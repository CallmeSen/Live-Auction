output "alarm_topic_arn" {
  value = aws_sns_topic.alarms.arn
}

output "alarm_topic_name" {
  value = aws_sns_topic.alarms.name
}

output "dashboard_name" {
  value = aws_cloudwatch_dashboard.main.dashboard_name
}

output "alarm_arns" {
  value = concat(
    [
      aws_cloudwatch_metric_alarm.rejected_bid.arn,
      aws_cloudwatch_metric_alarm.bid_latency.arn,
      aws_cloudwatch_metric_alarm.bid_dlq.arn,
      aws_cloudwatch_metric_alarm.scheduler_dlq.arn,
    ],
    [for alarm in values(aws_cloudwatch_metric_alarm.lambda_errors) : alarm.arn]
  )
}
