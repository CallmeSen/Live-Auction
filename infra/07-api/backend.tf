terraform {
  backend "s3" {
    bucket         = "la-tfstate-233376973052"
    key            = "07-api/terraform.tfstate"
    region         = "ap-southeast-1"
    profile        = "la-admin"
    dynamodb_table = "la-tflock"
    encrypt        = true
  }
}
