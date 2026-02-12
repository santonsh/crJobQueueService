#!/bin/bash

# Test 4: Job Cancellation (PROCESSING)

source "$(dirname "$0")/test-utils.sh"

echo -e "${BLUE}=== Test 4: Job Cancellation (PROCESSING) ===${NC}"
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

CANCEL_PROC_JOB_ID=$(echo $JOB_RESPONSE | jq -r '.jobId')

info "Waiting for job to start processing..."
sleep 2

PROC_STATUS=$(curl -s "$API_URL/jobs/$CANCEL_PROC_JOB_ID" | jq -r '.status')
if [ "$PROC_STATUS" == "PROCESSING" ]; then
    pass "Job is now in PROCESSING state"
else
    warn "Job not yet processing (status: $PROC_STATUS), cancelling anyway..."
fi

info "Cancelling job while processing..."
CANCEL_RESPONSE=$(curl -s -X DELETE "$API_URL/jobs/$CANCEL_PROC_JOB_ID")
CANCEL_STATUS=$(echo $CANCEL_RESPONSE | jq -r '.status')

if [ "$CANCEL_STATUS" == "CANCELLED" ]; then
    pass "Job marked as CANCELLED (processing may continue but result discarded)"
    exit 0
else
    fail "Job not cancelled" "Status: $CANCEL_STATUS"
    exit 1
fi
