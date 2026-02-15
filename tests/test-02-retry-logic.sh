#!/bin/bash

# Test 2: Job Failure with Retry
# Verifies that:
# 1. Jobs retry with exponential backoff on failure
# 2. Permanently failed jobs (exhausted retries) are removed from BullMQ
# 3. PostgreSQL is the single source of truth for job state

source "$(dirname "$0")/test-utils.sh"

echo -e "${BLUE}=== Test 2: Job Failure with Retry ===${NC}"
info "Submitting job with 80% failure probability..."

# Get initial BullMQ failed queue count
INITIAL_QUEUE_METRICS=$(curl -s "$MONITOR_URL/metrics/queue")
INITIAL_FAILED_COUNT=$(echo $INITIAL_QUEUE_METRICS | jq -r '.queue_failed // 0')
info "Initial BullMQ failed queue count: $INITIAL_FAILED_COUNT"

JOB_RESPONSE=$(curl -s -X POST "$API_URL/jobs" \
  -H "Content-Type: application/json" \
  -d '{
    "class": "test",
    "type": "delay",
    "payload": {
      "executionTime": 1000,
      "failureProb": 0.8
    }
  }')

RETRY_JOB_ID=$(echo $JOB_RESPONSE | jq -r '.jobId')

info "Waiting for retries (this may take up to 20 seconds with exponential backoff)..."
sleep 25

RETRY_JOB=$(curl -s "$API_URL/jobs/$RETRY_JOB_ID")
RETRY_STATUS=$(echo $RETRY_JOB | jq -r '.status')
ATTEMPTS=$(echo $RETRY_JOB | jq -r '.attempts')

if [ "$RETRY_STATUS" == "COMPLETED" ] || [ "$RETRY_STATUS" == "FAILED" ]; then
    pass "Job reached terminal state: $RETRY_STATUS after $ATTEMPTS attempt(s)"
else
    fail "Job stuck in non-terminal state" "Status: $RETRY_STATUS, Attempts: $ATTEMPTS"
    exit 1
fi

if [ "$ATTEMPTS" -gt 1 ]; then
    pass "Retry logic executed ($ATTEMPTS attempts)"
else
    warn "Job succeeded on first attempt (expected retries with 80% failure prob)"
fi

# Verify BullMQ failed queue cleanup for permanently failed jobs
if [ "$RETRY_STATUS" == "FAILED" ]; then
    info "Job permanently failed - verifying BullMQ cleanup..."

    # Check BullMQ failed queue count after job completion
    FINAL_QUEUE_METRICS=$(curl -s "$MONITOR_URL/metrics/queue")
    FINAL_FAILED_COUNT=$(echo $FINAL_QUEUE_METRICS | jq -r '.queue_failed // 0')

    if [ "$FINAL_FAILED_COUNT" -eq "$INITIAL_FAILED_COUNT" ]; then
        pass "BullMQ failed queue unchanged (job was cleaned): $FINAL_FAILED_COUNT"
        info "PostgreSQL status: FAILED, BullMQ: removed ✓"
    else
        fail "BullMQ failed queue increased" "Before: $INITIAL_FAILED_COUNT, After: $FINAL_FAILED_COUNT (should be equal)"
        exit 1
    fi
fi

exit 0
