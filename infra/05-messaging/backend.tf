terraform {
  backend "s3" {
    bucket         = "la-tfstate-233376973052"
    key            = "05-messaging/terraform.tfstate"
    region         = "ap-southeast-1"
    dynamodb_table = "la-tflock"
    encrypt        = true
  }
}
