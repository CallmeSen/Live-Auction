$scriptPath = Join-Path $PSScriptRoot '..\bootstrap-remote-state.ps1'

Describe 'bootstrap-remote-state.ps1' {
    It 'exists at the documented path' {
        Test-Path -LiteralPath $scriptPath | Should Be $true
    }
}

. $scriptPath

Describe 'Invoke-AwsCli' {
    It 'is the AWS process boundary' {
        Get-Command Invoke-AwsCli -ErrorAction SilentlyContinue |
            Should Not BeNullOrEmpty
    }

    It 'captures stderr and exit code for an allowed AWS CLI failure' {
        $fakeBin = Join-Path $TestDrive 'fake-aws'
        New-Item -ItemType Directory -Path $fakeBin | Out-Null
        @'
@echo off
echo aws: [ERROR]: An error occurred (404) when calling HeadBucket 1>&2
exit /b 254
'@ | Set-Content -LiteralPath (Join-Path $fakeBin 'aws.cmd') -Encoding ASCII

        $originalPath = $env:PATH
        try {
            $env:PATH = "$fakeBin;$originalPath"
            $result = Invoke-AwsCli `
                -Arguments @('s3api', 'head-bucket', '--bucket', 'missing') `
                -AllowFailure
        }
        finally {
            $env:PATH = $originalPath
        }

        $result.ExitCode | Should Be 254
        $result.Output | Should Match '404'
    }
}

Describe 'Get-AwsIdentity' {
    Mock Invoke-AwsCli {
        [pscustomobject]@{
            ExitCode = 0
            Output   = '{"UserId":"AIDAEXAMPLE","Account":"233376973052","Arn":"arn:aws:iam::233376973052:user/terraform-bootstrap"}'
        }
    }

    It 'returns the account and caller ARN from STS' {
        $identity = Get-AwsIdentity

        $identity.Account | Should Be '233376973052'
        $identity.Arn | Should Be 'arn:aws:iam::233376973052:user/terraform-bootstrap'
        Assert-MockCalled Invoke-AwsCli 1 -Scope It -ParameterFilter {
            $Arguments -join ' ' -eq 'sts get-caller-identity --output json'
        }
    }
}

Describe 'Ensure-StateBucket' {
    Mock Invoke-AwsCli {
        if ($Arguments -join ' ' -eq 's3api head-bucket --bucket la-tfstate-233376973052') {
            return [pscustomobject]@{ ExitCode = 1; Output = 'Not Found' }
        }

        [pscustomobject]@{ ExitCode = 0; Output = '' }
    }

    It 'creates and hardens a missing bucket' {
        Ensure-StateBucket `
            -BucketName 'la-tfstate-233376973052' `
            -Region 'ap-southeast-1'

        Assert-MockCalled Invoke-AwsCli 1 -Scope It -ParameterFilter {
            $Arguments -join ' ' -eq 's3api create-bucket --bucket la-tfstate-233376973052 --region ap-southeast-1 --create-bucket-configuration LocationConstraint=ap-southeast-1'
        }
        Assert-MockCalled Invoke-AwsCli 1 -Scope It -ParameterFilter {
            $Arguments -join ' ' -like 's3api put-bucket-versioning --bucket la-tfstate-233376973052*'
        }
        Assert-MockCalled Invoke-AwsCli 1 -Scope It -ParameterFilter {
            $Arguments -contains 'put-bucket-encryption' -and
            $Arguments -contains '--server-side-encryption-configuration' -and
            $Arguments[([array]::IndexOf($Arguments, '--server-side-encryption-configuration') + 1)] -like 'file://*'
        }
        Assert-MockCalled Invoke-AwsCli 1 -ParameterFilter {
            $Arguments -join ' ' -like 's3api put-public-access-block --bucket la-tfstate-233376973052*BlockPublicAcls=true*'
        }
    }

    It 'reuses an existing bucket and reapplies hardening' {
        Mock Invoke-AwsCli {
            [pscustomobject]@{ ExitCode = 0; Output = '' }
        }

        Ensure-StateBucket `
            -BucketName 'la-tfstate-233376973052' `
            -Region 'ap-southeast-1'

        Assert-MockCalled Invoke-AwsCli 0 -Scope It -ParameterFilter {
            $Arguments -contains 'create-bucket'
        }
        Assert-MockCalled Invoke-AwsCli 1 -Scope It -ParameterFilter {
            $Arguments -contains 'put-bucket-versioning'
        }
        Assert-MockCalled Invoke-AwsCli 1 -Scope It -ParameterFilter {
            $Arguments -contains 'put-bucket-encryption'
        }
        Assert-MockCalled Invoke-AwsCli 1 -Scope It -ParameterFilter {
            $Arguments -contains 'put-public-access-block'
        }
    }

    It 'passes bucket encryption JSON through a file URI' {
        Mock Invoke-AwsCli {
            if ($Arguments -contains 'put-bucket-encryption') {
                $encryptionIndex = [array]::IndexOf($Arguments, '--server-side-encryption-configuration')
                $encryptionArgument = $Arguments[$encryptionIndex + 1]
                $encryptionArgument | Should Match '^file://'

                $jsonPath = $encryptionArgument.Substring(7)
                $json = Get-Content -Raw -LiteralPath $jsonPath | ConvertFrom-Json
                $json.Rules[0].ApplyServerSideEncryptionByDefault.SSEAlgorithm |
                    Should Be 'AES256'
            }

            [pscustomobject]@{ ExitCode = 0; Output = '' }
        }

        Ensure-StateBucket `
            -BucketName 'la-tfstate-233376973052' `
            -Region 'ap-southeast-1'
    }

    It 'stops when the bucket lookup fails for a reason other than not found' {
        Mock Invoke-AwsCli {
            if ($Arguments -contains 'head-bucket') {
                return [pscustomobject]@{
                    ExitCode = 1
                    Output   = 'An error occurred (AccessDenied) when calling the HeadBucket operation'
                }
            }

            [pscustomobject]@{ ExitCode = 0; Output = '' }
        }

        $caught = $null
        try {
            Ensure-StateBucket `
                -BucketName 'la-tfstate-233376973052' `
                -Region 'ap-southeast-1'
        }
        catch {
            $caught = $_
        }

        $caught | Should Not BeNullOrEmpty
        $caught.Exception.Message | Should Match 'AccessDenied'

        Assert-MockCalled Invoke-AwsCli 0 -Scope It -ParameterFilter {
            $Arguments -contains 'create-bucket'
        }
    }

    It 'omits LocationConstraint when creating a bucket in us-east-1' {
        Mock Invoke-AwsCli {
            if ($Arguments -contains 'head-bucket') {
                return [pscustomobject]@{ ExitCode = 1; Output = 'Not Found' }
            }

            [pscustomobject]@{ ExitCode = 0; Output = '' }
        }

        Ensure-StateBucket `
            -BucketName 'la-tfstate-233376973052' `
            -Region 'us-east-1'

        Assert-MockCalled Invoke-AwsCli 1 -Scope It -ParameterFilter {
            $Arguments -join ' ' -eq 's3api create-bucket --bucket la-tfstate-233376973052 --region us-east-1'
        }
    }
}

Describe 'Ensure-LockTable' {
    Mock Invoke-AwsCli {
        if ($Arguments -contains 'describe-table') {
            return [pscustomobject]@{
                ExitCode = 1
                Output   = 'ResourceNotFoundException: Requested resource not found'
            }
        }

        [pscustomobject]@{ ExitCode = 0; Output = '' }
    }

    It 'creates and waits for a missing lock table' {
        Ensure-LockTable `
            -TableName 'la-tflock' `
            -Region 'ap-southeast-1'

        Assert-MockCalled Invoke-AwsCli 1 -Scope It -ParameterFilter {
            $Arguments -join ' ' -eq 'dynamodb create-table --table-name la-tflock --attribute-definitions AttributeName=LockID,AttributeType=S --key-schema AttributeName=LockID,KeyType=HASH --billing-mode PAY_PER_REQUEST --region ap-southeast-1'
        }
        Assert-MockCalled Invoke-AwsCli 1 -Scope It -ParameterFilter {
            $Arguments -join ' ' -eq 'dynamodb wait table-exists --table-name la-tflock --region ap-southeast-1'
        }
    }

    It 'reuses an existing lock table' {
        Mock Invoke-AwsCli {
            [pscustomobject]@{
                ExitCode = 0
                Output   = '{"Table":{"TableStatus":"ACTIVE"}}'
            }
        }

        Ensure-LockTable `
            -TableName 'la-tflock' `
            -Region 'ap-southeast-1'

        Assert-MockCalled Invoke-AwsCli 0 -Scope It -ParameterFilter {
            $Arguments -contains 'create-table'
        }
        Assert-MockCalled Invoke-AwsCli 0 -Scope It -ParameterFilter {
            $Arguments -contains 'wait'
        }
    }

    It 'stops when the table lookup fails for a reason other than not found' {
        Mock Invoke-AwsCli {
            if ($Arguments -contains 'describe-table') {
                return [pscustomobject]@{
                    ExitCode = 1
                    Output   = 'AccessDeniedException: User is not authorized'
                }
            }

            [pscustomobject]@{ ExitCode = 0; Output = '' }
        }

        $caught = $null
        try {
            Ensure-LockTable `
                -TableName 'la-tflock' `
                -Region 'ap-southeast-1'
        }
        catch {
            $caught = $_
        }

        $caught | Should Not BeNullOrEmpty
        $caught.Exception.Message | Should Match 'AccessDeniedException'
        Assert-MockCalled Invoke-AwsCli 0 -Scope It -ParameterFilter {
            $Arguments -contains 'create-table'
        }
    }
}

Describe 'Assert-AwsCliAvailable' {
    Mock Get-Command { $null } -ParameterFilter { $Name -eq 'aws' }

    It 'reports a clear error when AWS CLI is missing' {
        $caught = $null
        try {
            Assert-AwsCliAvailable
        }
        catch {
            $caught = $_
        }

        $caught | Should Not BeNullOrEmpty
        $caught.Exception.Message | Should Match 'AWS CLI v2'
    }
}

Describe 'Invoke-RemoteStateBootstrap' {
    Mock Assert-AwsCliAvailable {}
    Mock Get-AwsIdentity {
        [pscustomobject]@{
            Account = '233376973052'
            Arn     = 'arn:aws:iam::233376973052:user/terraform-bootstrap'
        }
    }
    Mock Ensure-StateBucket {}
    Mock Ensure-LockTable {}

    It 'derives the bucket name and ensures both backend resources' {
        Invoke-RemoteStateBootstrap `
            -Region 'ap-southeast-1' `
            -BucketPrefix 'la-tfstate' `
            -LockTableName 'la-tflock'

        Assert-MockCalled Assert-AwsCliAvailable 1 -Scope It
        Assert-MockCalled Ensure-StateBucket 1 -Scope It -ParameterFilter {
            $BucketName -eq 'la-tfstate-233376973052' -and
            $Region -eq 'ap-southeast-1'
        }
        Assert-MockCalled Ensure-LockTable 1 -Scope It -ParameterFilter {
            $TableName -eq 'la-tflock' -and
            $Region -eq 'ap-southeast-1'
        }
    }

    It 'warns when the authenticated caller is the account root' {
        Mock Get-AwsIdentity {
            [pscustomobject]@{
                Account = '233376973052'
                Arn     = 'arn:aws:iam::233376973052:root'
            }
        }
        Mock Write-Warning {}

        Invoke-RemoteStateBootstrap `
            -Region 'ap-southeast-1' `
            -BucketPrefix 'la-tfstate' `
            -LockTableName 'la-tflock'

        Assert-MockCalled Write-Warning 1 -Scope It -ParameterFilter {
            $Message -match 'root' -and $Message -match 'IAM'
        }
    }
}
