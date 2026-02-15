#!/bin/bash

# Test 1: Happy Path (Successful Jobs - Both Job Types)

source "$(dirname "$0")/test-utils.sh"

echo -e "${BLUE}=== Test 1: Happy Path (Successful Jobs) ===${NC}"

# Test 1a: test/delay job
info "Test 1a: Submitting test/delay job..."

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

JOB_ID_DELAY=$(echo $JOB_RESPONSE | jq -r '.jobId')
INITIAL_STATUS=$(echo $JOB_RESPONSE | jq -r '.status')

if [ "$INITIAL_STATUS" == "PENDING" ]; then
    pass "test/delay job created with status PENDING (ID: $JOB_ID_DELAY)"
else
    fail "test/delay job not created with PENDING status" "Got: $INITIAL_STATUS"
    exit 1
fi

info "Waiting for test/delay job to complete (2s execution + processing time)..."
sleep 4

FINAL_STATUS=$(curl -s "$API_URL/jobs/$JOB_ID_DELAY" | jq -r '.status')
JOB_RESULT=$(curl -s "$API_URL/jobs/$JOB_ID_DELAY" | jq -r '.result')

if [ "$FINAL_STATUS" == "COMPLETED" ]; then
    pass "test/delay job completed successfully"
    info "Result: $JOB_RESULT"
else
    fail "test/delay job did not complete" "Status: $FINAL_STATUS"
    exit 1
fi

echo ""

# Test 1b: gpu-modelInference/inference job
info "Test 1b: Submitting gpu-modelInference/inference job..."

JOB_RESPONSE=$(curl -s -X POST "$API_URL/jobs" \
  -H "Content-Type: application/json" \
  -d '{
    "class": "gpu-modelInference",
    "type": "inference",
    "payload": {
      "modelId": "model-v1.2.3",
      "blobKey": "s3://bucket/input-data.bin"
    }
  }')

JOB_ID_GPU=$(echo $JOB_RESPONSE | jq -r '.jobId')
INITIAL_STATUS=$(echo $JOB_RESPONSE | jq -r '.status')

if [ "$INITIAL_STATUS" == "PENDING" ]; then
    pass "gpu-modelInference job created with status PENDING (ID: $JOB_ID_GPU)"
else
    fail "gpu-modelInference job not created with PENDING status" "Got: $INITIAL_STATUS"
    exit 1
fi

info "Waiting for gpu-modelInference job to complete (100ms execution + processing time)..."
sleep 2

FINAL_STATUS=$(curl -s "$API_URL/jobs/$JOB_ID_GPU" | jq -r '.status')
JOB_RESULT=$(curl -s "$API_URL/jobs/$JOB_ID_GPU" | jq -r '.result')
INFERENCE_RESULT=$(echo $JOB_RESULT | jq -r '.result')

if [ "$FINAL_STATUS" == "COMPLETED" ]; then
    pass "gpu-modelInference job completed successfully"
    info "Result: $JOB_RESULT"

    # Validate inference result is between 0-10
    if [ "$INFERENCE_RESULT" -ge 0 ] && [ "$INFERENCE_RESULT" -le 10 ]; then
        pass "Inference result is valid (0-10): $INFERENCE_RESULT"
    else
        fail "Inference result out of range" "Expected: 0-10, Got: $INFERENCE_RESULT"
        exit 1
    fi
else
    fail "gpu-modelInference job did not complete" "Status: $FINAL_STATUS"
    exit 1
fi

echo ""
pass "All job types completed successfully!"
exit 0
