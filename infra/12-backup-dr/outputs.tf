output "backup_vault_name" {
  value = aws_backup_vault.main.name
}

output "backup_vault_arn" {
  value = aws_backup_vault.main.arn
}

output "backup_plan_id" {
  value = aws_backup_plan.main.id
}

output "backup_selection_id" {
  value = aws_backup_selection.data.id
}

output "selected_resource_arns" {
  value = local.backup_resources
}
