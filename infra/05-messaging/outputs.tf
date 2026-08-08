output "bid_commands_queue_url" {
  value = aws_sqs_queue.bid_commands.url
}

output "bid_commands_queue_arn" {
  value = aws_sqs_queue.bid_commands.arn
}

output "bid_commands_dlq_url" {
  value = aws_sqs_queue.bid_dlq.url
}

output "bid_commands_dlq_arn" {
  value = aws_sqs_queue.bid_dlq.arn
}

output "scheduler_group_name" {
  value = var.enable_stage3 ? try(aws_scheduler_schedule_group.main[0].name, null) : null
}

output "scheduler_group_arn" {
  value = var.enable_stage3 ? try(aws_scheduler_schedule_group.main[0].arn, null) : null
}

output "scheduler_role_arn" {
  value = var.enable_stage3 ? try(aws_iam_role.scheduler_invoke[0].arn, null) : null
}

output "scheduler_dlq_url" {
  value = var.enable_stage3 ? try(aws_sqs_queue.scheduler_dlq[0].url, null) : null
}

output "scheduler_dlq_arn" {
  value = var.enable_stage3 ? try(aws_sqs_queue.scheduler_dlq[0].arn, null) : null
}
