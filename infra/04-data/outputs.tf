output "item_state_table_name" {
  value = aws_dynamodb_table.item_auction_state.name
}

output "item_state_table_arn" {
  value = aws_dynamodb_table.item_auction_state.arn
}

output "item_state_stream_arn" {
  value = aws_dynamodb_table.item_auction_state.stream_arn
}

output "bid_events_table_name" {
  value = aws_dynamodb_table.bid_events.name
}

output "bid_events_table_arn" {
  value = aws_dynamodb_table.bid_events.arn
}

output "bid_events_stream_arn" {
  value = aws_dynamodb_table.bid_events.stream_arn
}

output "websocket_connections_table_name" {
  value = aws_dynamodb_table.websocket_connections.name
}

output "websocket_connections_table_arn" {
  value = aws_dynamodb_table.websocket_connections.arn
}

output "bidder_aliases_table_name" {
  value = aws_dynamodb_table.item_bidder_aliases.name
}

output "bidder_aliases_table_arn" {
  value = aws_dynamodb_table.item_bidder_aliases.arn
}

output "idempotency_table_name" {
  value = aws_dynamodb_table.idempotency.name
}

output "idempotency_table_arn" {
  value = aws_dynamodb_table.idempotency.arn
}

output "auction_catalog_table_name" {
  value = var.enable_stage3 ? aws_dynamodb_table.auction_catalog[0].name : null
}

output "auction_catalog_table_arn" {
  value = var.enable_stage3 ? aws_dynamodb_table.auction_catalog[0].arn : null
}

output "bidder_events_index_name" {
  value = var.enable_stage3 ? "bidder_sub-sk-index" : null
}

output "media_bucket_name" {
  value = var.enable_stage3 ? aws_s3_bucket.media[0].bucket : null
}

output "media_bucket_arn" {
  value = var.enable_stage3 ? aws_s3_bucket.media[0].arn : null
}

output "category_catalog_table_name" {
  value = var.enable_stage3 ? aws_dynamodb_table.category_catalog[0].name : null
}

output "category_catalog_table_arn" {
  value = var.enable_stage3 ? aws_dynamodb_table.category_catalog[0].arn : null
}

output "category_catalog_slug_index_name" {
  value = var.enable_stage3 ? "slug-index" : null
}

output "category_catalog_status_index_name" {
  value = var.enable_stage3 ? "status-index" : null
}

output "admin_audit_events_table_name" {
  value = var.enable_stage3 ? aws_dynamodb_table.admin_audit_events[0].name : null
}

output "admin_audit_events_table_arn" {
  value = var.enable_stage3 ? aws_dynamodb_table.admin_audit_events[0].arn : null
}

output "admin_audit_events_actor_index_name" {
  value = var.enable_stage3 ? "actor-index" : null
}

output "admin_audit_events_resource_index_name" {
  value = var.enable_stage3 ? "resource-index" : null
}
