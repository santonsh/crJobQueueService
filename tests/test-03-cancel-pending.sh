#!/bin/bash

# Test 3: Job Cancellation (PENDING)

source "$(dirname "$0")/test-utils.sh"

echo -e "${BLUE}=== Test 3: Job Cancellation (PENDING) ===${NC}"
info "Submitting long-running job..."

JOB_RESPONSE=$(curl -s -X POST "$API_URL/jobs" \
  -H "Content-Type: application/json" \
  -d '{
    "class": "test",
    "type": "delay",
    "payload": {
      "executionTime": 30000,
      "failureProb": 0
    }
  }')

CANCEL_JOB_ID=$(echo $JOB_RESPONSE | jq -r '.jobId')

info "Cancelling job immediately..."
CANCEL_RESPONSE=$(curl -s -X DELETE "$API_URL/jobs/$CANCEL_JOB_ID")
CANCEL_STATUS=$(echo $CANCEL_RESPONSE | jq -r '.status')

if [ "$CANCEL_STATUS" == "CANCELLED" ]; then
    pass "Job cancelled successfully (PENDING → CANCELLED)"
    exit 0
else
    fail "Job not cancelled" "Status: $CANCEL_STATUS"
    exit 1
fi
