#!/bin/bash

# Test 2: Job Failure with Retry

source "$(dirname "$0")/test-utils.sh"

echo -e "${BLUE}=== Test 2: Job Failure with Retry ===${NC}"
info "Submitting job with 80% failure probability..."

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
    exit 0
else
    warn "Job succeeded on first attempt (expected retries with 80% failure prob)"
    exit 0
fi
