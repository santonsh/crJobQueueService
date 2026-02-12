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
        exit 0
    elif [ $MAX_DURATION -le 10 ]; then
        warn "Jobs mostly concurrent but slower than expected (${MAX_DURATION}s)"
        info "  This might indicate some queueing or resource contention"
        exit 0
    else
        fail "Jobs may be running sequentially" "Max duration: ${MAX_DURATION}s (expected ~2-3s for parallel)"
        exit 1
    fi
else
    fail "Not all concurrent jobs completed" "Completed: $COMPLETED_COUNT/10"
    exit 1
fi
