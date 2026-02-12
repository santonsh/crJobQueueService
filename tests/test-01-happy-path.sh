#!/bin/bash

# Test 1: Happy Path (Successful Job)

source "$(dirname "$0")/test-utils.sh"

echo -e "${BLUE}=== Test 1: Happy Path (Successful Job) ===${NC}"
info "Submitting job that will succeed..."

JOB_RESPONSE=$(curl -s -X POST "$API_URL/jobs" \
  -H "Content-Type: application/json" \
  -d '{
    "class": "test",
    "type": "delay",
    "payload": {
      "executionTime": 2000,
      "failureProb": 0
    }
  }')

JOB_ID=$(echo $JOB_RESPONSE | jq -r '.jobId')
INITIAL_STATUS=$(echo $JOB_RESPONSE | jq -r '.status')

if [ "$INITIAL_STATUS" == "PENDING" ]; then
    pass "Job created with status PENDING (ID: $JOB_ID)"
else
    fail "Job not created with PENDING status" "Got: $INITIAL_STATUS"
    exit 1
fi

info "Waiting for job to complete (2s execution + processing time)..."
sleep 4

FINAL_STATUS=$(curl -s "$API_URL/jobs/$JOB_ID" | jq -r '.status')
if [ "$FINAL_STATUS" == "COMPLETED" ]; then
    pass "Job completed successfully"
    exit 0
else
    fail "Job did not complete" "Status: $FINAL_STATUS"
    exit 1
fi
