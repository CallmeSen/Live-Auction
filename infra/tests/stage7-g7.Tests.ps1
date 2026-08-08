$repoRoot = Split-Path -Parent $PSScriptRoot
$moduleRoot = Join-Path $repoRoot '13-cicd'
$requiredFiles = @(
    'backend.tf',
    'versions.tf',
    'providers.tf',
    'variables.tf',
    'main.tf',
    'outputs.tf'
)

function Read-Stage7File([string]$File) {
    $path = Join-Path $moduleRoot $File
    if (-not (Test-Path -LiteralPath $path)) {
        return ''
    }
    return Get-Content -Raw -LiteralPath $path
}

Describe 'Stage 7 Terraform module skeleton' {
    foreach ($file in $requiredFiles) {
        It "contains $file" {
            Test-Path -LiteralPath (Join-Path $moduleRoot $file) | Should Be $true
        }
    }

    It 'locks Terraform and the AWS provider' {
        $versions = Read-Stage7File 'versions.tf'

        $versions | Should Match 'required_version\s*=\s*">= 1\.7, < 2\.0"'
        $versions | Should Match 'source\s*=\s*"hashicorp/aws"'
        $versions | Should Match 'version\s*=\s*"~> 6\.55\.0"'
    }

    It 'uses Singapore and shared tags without static credentials' {
        $provider = Read-Stage7File 'providers.tf'
        $variables = Read-Stage7File 'variables.tf'
        $all = ($requiredFiles | ForEach-Object { Read-Stage7File $_ }) -join "`n"

        $provider | Should Match 'region\s*=\s*var\.aws_region'
        $provider | Should Match 'default_tags'
        $provider | Should Match 'Project\s*=\s*var\.project'
        $provider | Should Match 'Environment\s*=\s*var\.environment'
        $provider | Should Match 'ManagedBy\s*=\s*"terraform"'
        $provider | Should Match 'Owner\s*=\s*var\.owner'
        $variables | Should Match 'default\s*=\s*"ap-southeast-1"'
        $all | Should Not Match '(?i)access_key\s*=|secret_key\s*=|profile\s*=|root credentials'
    }
}

Describe 'Stage 7 AWS-native Lambda delivery contract' {
    BeforeEach {
        $script:main = Read-Stage7File 'main.tf'
        $script:variables = Read-Stage7File 'variables.tf'
        $script:buildspec = Get-Content -Raw -LiteralPath (Join-Path $repoRoot '..\buildspec.cicd.yml') -ErrorAction SilentlyContinue
    }

    It 'creates a GitHub CodeConnections source and requires a real repository id' {
        $main | Should Match 'resource\s+"aws_codestarconnections_connection"\s+"github"'
        $main | Should Match 'provider_type\s*=\s*"GitHub"'
        $main | Should Match 'var\.full_repository_id'
        $main | Should Match 'resource\s+"aws_lambda_alias"\s+"bid_processor_live"'
        $variables | Should Match 'variable\s+"full_repository_id"'
        $variables | Should Match 'variable\s+"initial_function_version"'
        $variables | Should Not Match '(?i)your-org|example\.com|placeholder'
    }

    It 'creates a private versioned encrypted artifact bucket' {
        foreach ($pattern in @(
            'resource\s+"aws_s3_bucket"\s+"artifacts"',
            'resource\s+"aws_s3_bucket_versioning"\s+"artifacts"',
            'resource\s+"aws_s3_bucket_server_side_encryption_configuration"\s+"artifacts"',
            'resource\s+"aws_s3_bucket_public_access_block"\s+"artifacts"',
            'resource\s+"aws_s3_bucket_ownership_controls"\s+"artifacts"'
        )) {
            $main | Should Match $pattern
        }
    }

    It 'creates verify and deploy CodeBuild projects plus CodePipeline stages' {
        foreach ($pattern in @(
            'resource\s+"aws_codebuild_project"\s+"build"',
            'resource\s+"aws_codebuild_project"\s+"deploy"',
            'resource\s+"aws_codepipeline"\s+"main"',
            'CodeStarSourceConnection',
            'CodeBuild'
        )) {
            $main | Should Match $pattern
        }
        $main | Should Not Match '(?i)codedeploy|CodeDeployToLambda'
        $main | Should Match 'buildspec\.deploy\.yml'
    }

    It 'scopes CI roles and keeps IaC apply outside the delivery pipeline' {
        $main | Should Match 'iam:PassRole'
        $main | Should Match 'iam:PassedToService'
        $main | Should Match 'lambda:PublishVersion'
        $main | Should Match 'lambda:UpdateAlias'
        $main | Should Match 'cloudwatch:DescribeAlarms'
        $main | Should Not Match 'Action\s*=\s*"\*"'
        $main | Should Not Match 'Action\s*=\s*\[\s*"\*"\s*\]'
        $main | Should Not Match '(?i)codedeploy|AWSCodeDeployRoleForLambda'
        $buildspec | Should Not Match '(?i)terraform\s+apply|AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|aws_secret_access_key'
    }
}

Describe 'Stage 7 buildspec contract' {
    BeforeEach {
        $script:buildspec = Get-Content -Raw -LiteralPath (Join-Path $repoRoot '..\buildspec.cicd.yml') -ErrorAction SilentlyContinue
    }

    It 'runs backend and frontend verification before packaging the Lambda version' {
        foreach ($pattern in @(
            'python\s+-m\s+pytest',
            'npm\s+ci',
            'npm\s+run\s+typecheck',
            'npm\s+run\s+lint',
            'npm\s+run\s+build',
            'deterministic_zip',
            'bid_processor\.zip'
        )) {
            $buildspec | Should Match $pattern
        }
        $buildspec | Should Not Match '(?i)aws\s+lambda\s+(update-function-code|publish-version)'
    }

    It 'does not use static AWS credentials or destructive infrastructure commands' {
        $buildspec | Should Not Match '(?i)AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|AWS_SESSION_TOKEN|terraform\s+destroy|terraform\s+apply'
    }
}

Describe 'Stage 7 Lambda alias deployment contract' {
    BeforeEach {
        $script:deployspec = Get-Content -Raw -LiteralPath (Join-Path $repoRoot '..\buildspec.deploy.yml') -ErrorAction SilentlyContinue
    }

    It 'shifts 10 percent, checks the alarm, and promotes or rolls back the alias' {
        foreach ($pattern in @(
            'aws\s+lambda\s+update-function-code',
            'aws\s+lambda\s+publish-version',
            'aws\s+lambda\s+update-alias',
            'aws\s+cloudwatch\s+describe-alarm-state',
            'AdditionalVersionWeights',
            '0\.1',
            'rollback'
        )) {
            $deployspec | Should Match $pattern
        }
    }

    It 'does not use static credentials or destructive infrastructure commands' {
        $deployspec | Should Not Match '(?i)AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|AWS_SESSION_TOKEN|terraform\s+(destroy|apply)'
    }
}
