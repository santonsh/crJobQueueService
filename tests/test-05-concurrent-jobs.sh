#!/bin/bash

# Test 5: Worker Concurrency Test
# Verifies that the worker processes jobs concurrently (not sequentially)
# With 10 jobs of 2s each and worker concurrency=10:
#   - Parallel execution: ~2-3 seconds total
#   - Sequential execution: ~20 seconds total

source "$(dirname "$0")/test-utils.sh"

echo -e "${BLUE}=== Test 5: Worker Concurrency ===${NC}"
info "Submitting 10 jobs with 2-second execution time..."

CONCURRENT_JOB_IDS=()
START_TIME=$(date +%s)

for i in {1..10}; do
    JOB_RESPONSE=$(curl -s -X POST "$API_URL/jobs" \
      -H "Content-Type: application/json" \
      -d "{
        \"class\": \"test\",
        \"type\": \"delay\",
        \"payload\": {
          \"executionTime\": 2000,
          \"failureProb\": 0
        }
      }")

    JOB_ID=$(echo $JOB_RESPONSE | jq -r '.jobId')
    CONCURRENT_JOB_IDS+=($JOB_ID)
    echo "  Submitted job $i: $JOB_ID"
done

SUBMIT_END_TIME=$(date +%s)
SUBMIT_DURATION=$((SUBMIT_END_TIME - START_TIME))

pass "Submitted 10 concurrent jobs in ${SUBMIT_DURATION}s"

info "Waiting for all jobs to complete (timeout: 5 seconds)..."
sleep 5

COMPLETED_COUNT=0
MAX_DURATION=0

for JOB_ID in "${CONCURRENT_JOB_IDS[@]}"; do
    JOB_DATA=$(curl -s "$API_URL/jobs/$JOB_ID")
    STATUS=$(echo $JOB_DATA | jq -r '.status')

    if [ "$STATUS" == "COMPLETED" ]; then
        COMPLETED_COUNT=$((COMPLETED_COUNT + 1))

        # Calculate job duration (finishedAt - createdAt)
        CREATED_AT=$(echo $JOB_DATA | jq -r '.createdAt')
        FINISHED_AT=$(echo $JOB_DATA | jq -r '.finishedAt')

        # Convert to epoch seconds for calculation
        CREATED_SEC=$(date -j -f "%Y-%m-%dT%H:%M:%S" "${CREATED_AT:0:19}" +%s 2>/dev/null || echo "0")
        FINISHED_SEC=$(date -j -f "%Y-%m-%dT%H:%M:%S" "${FINISHED_AT:0:19}" +%s 2>/dev/null || echo "0")

        if [ "$CREATED_SEC" != "0" ] && [ "$FINISHED_SEC" != "0" ]; then
            DURATION=$((FINISHED_SEC - CREATED_SEC))
            echo "  Job $JOB_ID: COMPLETED (duration: ${DURATION}s)"

            if [ $DURATION -gt $MAX_DURATION ]; then
                MAX_DURATION=$DURATION
            fi
        else
            echo "  Job $JOB_ID: COMPLETED"
        fi
    else
        echo "  Job $JOB_ID: $STATUS"
    fi
done

echo ""
if [ $COMPLETED_COUNT -eq 10 ]; then
    pass "All 10 jobs completed successfully"

    info "Timing Analysis:"
    info "  Max job duration: ${MAX_DURATION}s"

    if [ $MAX_DURATION -le 5 ]; then
        pass "Jobs processed concurrently (max duration ≤ 5s)"
        info "  Expected for parallel: ~2-3s"
        info "  Expected for sequential: ~20s"
    elif [ $MAX_DURATION -le 10 ]; then
        warn "Jobs mostly concurrent but slower than expected (${MAX_DURATION}s)"
        info "  This might indicate some queueing or resource contention"
    else
        fail "Jobs may be running sequentially" "Max duration: ${MAX_DURATION}s (expected ~2-3s for parallel)"
        exit 1
    fi
else
    fail "Not all concurrent jobs completed" "Completed: $COMPLETED_COUNT/10"
    exit 1
fi

echo ""
echo -e "${BLUE}=== Test 5b: Bulk Job Submission ===${NC}"
info "Testing POST /jobs/bulk endpoint..."

# Create JSON payload with 100 jobs
BULK_START_TIME=$(date +%s)

BULK_RESPONSE=$(curl -s -X POST "$API_URL/jobs/bulk" \
  -H "Content-Type: application/json" \
  -d '{
    "jobs": [
      {"class": "test", "type": "delay", "payload": {"executionTime": 100, "failureProb": 0}},
      {"class": "test", "type": "delay", "payload": {"executionTime": 100, "failureProb": 0}},
      {"class": "test", "type": "delay", "payload": {"executionTime": 100, "failureProb": 0}},
      {"class": "test", "type": "delay", "payload": {"executionTime": 100, "failureProb": 0}},
      {"class": "test", "type": "delay", "payload": {"executionTime": 100, "failureProb": 0}},
      {"class": "test", "type": "delay", "payload": {"executionTime": 100, "failureProb": 0}},
      {"class": "test", "type": "delay", "payload": {"executionTime": 100, "failureProb": 0}},
      {"class": "test", "type": "delay", "payload": {"executionTime": 100, "failureProb": 0}},
      {"class": "test", "type": "delay", "payload": {"executionTime": 100, "failureProb": 0}},
      {"class": "test", "type": "delay", "payload": {"executionTime": 100, "failureProb": 0}}
    ]
  }')

BULK_SUBMIT_TIME=$(date +%s)
BULK_SUBMIT_DURATION=$((BULK_SUBMIT_TIME - BULK_START_TIME))

# Parse response
BULK_COUNT=$(echo $BULK_RESPONSE | jq -r '.count')
BULK_JOB_IDS=$(echo $BULK_RESPONSE | jq -r '.jobIds[]')

if [ "$BULK_COUNT" = "10" ]; then
    pass "Bulk job submission successful: $BULK_COUNT jobs created in ${BULK_SUBMIT_DURATION}s"
    info "  Job IDs returned: $(echo $BULK_RESPONSE | jq -r '.jobIds | length') items"

    # Wait for jobs to complete
    info "Waiting for bulk jobs to complete..."
    sleep 3

    # Verify all jobs were created and processed
    BULK_COMPLETED=0
    for JOB_ID in $BULK_JOB_IDS; do
        STATUS=$(curl -s "$API_URL/jobs/$JOB_ID" | jq -r '.status')
        if [ "$STATUS" = "COMPLETED" ]; then
            BULK_COMPLETED=$((BULK_COMPLETED + 1))
        fi
    done

    if [ $BULK_COMPLETED -eq 10 ]; then
        pass "All $BULK_COMPLETED bulk jobs completed successfully"
    else
        warn "Only $BULK_COMPLETED out of 10 bulk jobs completed"
    fi
else
    fail "Bulk job submission failed" "Expected count: 10, got: $BULK_COUNT"
    echo "  Response: $BULK_RESPONSE"
    exit 1
fi

echo ""
pass "Test 5: Concurrent and Bulk Jobs Test PASSED"
exit 0
