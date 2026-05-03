variable "name_prefix" { type = string }

resource "aws_sqs_queue" "tasks_dlq" {
  name                      = "${var.name_prefix}-tasks-dlq"
  message_retention_seconds = 1209600 # 14 days
}

resource "aws_sqs_queue" "tasks" {
  name                       = "${var.name_prefix}-tasks"
  visibility_timeout_seconds = 300
  message_retention_seconds  = 86400
  receive_wait_time_seconds  = 20 # long polling

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.tasks_dlq.arn
    maxReceiveCount     = 3
  })
}

resource "aws_sqs_queue_policy" "tasks" {
  queue_url = aws_sqs_queue.tasks.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "events.amazonaws.com" }
      Action    = "sqs:SendMessage"
      Resource  = aws_sqs_queue.tasks.arn
    }]
  })
}

# EventBridge rules → SQS for scheduled Lambda triggers
resource "aws_cloudwatch_event_rule" "monthly_rent" {
  name                = "${var.name_prefix}-monthly-rent"
  description         = "Trigger monthly rent ledger generation on 1st of each month at 8AM IST (2:30 UTC)"
  schedule_expression = "cron(30 2 1 * ? *)"
}

resource "aws_cloudwatch_event_target" "monthly_rent" {
  rule      = aws_cloudwatch_event_rule.monthly_rent.name
  target_id = "monthly-rent-sqs"
  arn       = aws_sqs_queue.tasks.arn
  input     = jsonencode({ task = "generate_and_remind" })
}

resource "aws_cloudwatch_event_rule" "daily_followups" {
  name                = "${var.name_prefix}-daily-followups"
  description         = "Trigger daily lead follow-up alerts at 10AM IST (4:30 UTC)"
  schedule_expression = "cron(30 4 * * ? *)"
}

resource "aws_cloudwatch_event_target" "daily_followups" {
  rule      = aws_cloudwatch_event_rule.daily_followups.name
  target_id = "daily-followups-sqs"
  arn       = aws_sqs_queue.tasks.arn
  input     = jsonencode({ task = "lead_followups" })
}

resource "aws_cloudwatch_event_rule" "move_out_alerts" {
  name                = "${var.name_prefix}-move-out-alerts"
  description         = "Trigger move-out reminders daily at 9AM IST (3:30 UTC)"
  schedule_expression = "cron(30 3 * * ? *)"
}

resource "aws_cloudwatch_event_target" "move_out_alerts" {
  rule      = aws_cloudwatch_event_rule.move_out_alerts.name
  target_id = "move-out-alerts-sqs"
  arn       = aws_sqs_queue.tasks.arn
  input     = jsonencode({ task = "move_out_alerts" })
}

output "tasks_queue_url" { value = aws_sqs_queue.tasks.url }
output "tasks_queue_arn" { value = aws_sqs_queue.tasks.arn }
output "tasks_dlq_arn" { value = aws_sqs_queue.tasks_dlq.arn }
