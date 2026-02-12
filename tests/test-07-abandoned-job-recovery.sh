#!/bin/bash

# Test 7: Abandoned Job Recovery

source "$(dirname "$0")/test-utils.sh"

echo -e "${BLUE}=== Test 7: Abandoned Job Recovery ===${NC}"

# Step 1: Submit a long-running job (30 seconds)
info "Submitting long-running job (30 seconds)..."

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

JOB_ID=$(echo $JOB_RESPONSE | jq -r '.jobId')
pass "Job submitted: $JOB_ID"

# Step 2: Wait for job to start processing
info "Waiting for job to start processing..."
sleep 3

JOB_STATUS=$(curl -s "$API_URL/jobs/$JOB_ID" | jq -r '.status')
if [ "$JOB_STATUS" == "PROCESSING" ]; then
    pass "Job is PROCESSING"
else
    fail "Job not in PROCESSING state" "Status: $JOB_STATUS"
    exit 1
fi

# Step 3: Kill the worker process to simulate crash
info "Killing worker process to simulate crash..."
WORKER_PID=$(lsof -ti:3001 2>/dev/null)
if [ ! -z "$WORKER_PID" ]; then
    kill -9 $WORKER_PID 2>/dev/null
    sleep 2
    # Verify it's actually dead
    if lsof -ti:3001 > /dev/null 2>&1; then
        fail "Worker process still running after kill attempt"
        exit 1
    fi
    pass "Worker process killed (PID: $WORKER_PID)"
else
    fail "Worker process not found on port 3001"
    exit 1
fi

# Step 4: Restart worker immediately (simulates worker recovery/restart)
info "Restarting worker process..."
cd "$(dirname "$0")/.." && cd codebase
npm run start:worker > /dev/null 2>&1 &
WORKER_PID=$!
cd - > /dev/null
sleep 3  # Give worker time to start up
pass "Worker restarted (PID: $WORKER_PID)"

# Step 6: Check monitor stats before recovery
INITIAL_STATS=$(curl -s "http://localhost:3002/metrics/system")
INITIAL_RECOVERED=$(echo $INITIAL_STATS | jq -r '.abandoned_jobs_recovered_total')
info "Initial abandoned jobs recovered: $INITIAL_RECOVERED"

# Step 7: Wait for monitor to detect and recover abandoned job
info "Waiting for monitor to detect abandoned job (up to 3 minutes)..."
info "Monitor cron runs every 1 minute, job timeout is 1 minute"
info "Worker is running and will pick up job once monitor re-enqueues it"

# Wait for total of 3 minutes, checking every 15 seconds
MAX_WAIT_SECONDS=180
INTERVAL=15
ELAPSED=0

while [ $ELAPSED -lt $MAX_WAIT_SECONDS ]; do
    sleep $INTERVAL
    ELAPSED=$((ELAPSED + INTERVAL))

    # Check if job was re-enqueued (status should be PENDING again or already COMPLETED)
    JOB_STATUS=$(curl -s "$API_URL/jobs/$JOB_ID" | jq -r '.status')
    CURRENT_STATS=$(curl -s "http://localhost:3002/metrics/system" 2>/dev/null || echo '{}')
    CURRENT_RECOVERED=$(echo $CURRENT_STATS | jq -r '.abandoned_jobs_recovered_total // 0')

    info "[$ELAPSED/$MAX_WAIT_SECONDS seconds] Job status: $JOB_STATUS, Recovered: $CURRENT_RECOVERED"

    # If recovered count increased, the monitor detected it
    if [ "$CURRENT_RECOVERED" -gt "$INITIAL_RECOVERED" ]; then
        pass "Monitor detected and recovered abandoned job"

        # Step 8: Wait for worker to process the re-enqueued job
        # Job execution time is 30s, give some buffer for queue pickup
        info "Waiting for worker to process re-enqueued job (up to 35 seconds)..."
        sleep 35

        # Step 9: Verify job completed
        FINAL_STATUS=$(curl -s "$API_URL/jobs/$JOB_ID" | jq -r '.status')
        if [ "$FINAL_STATUS" == "COMPLETED" ]; then
            pass "Job completed after recovery"

            # Verify stats
            FINAL_STATS=$(curl -s "http://localhost:3002/metrics/system")
            FINAL_RECOVERED=$(echo $FINAL_STATS | jq -r '.abandoned_jobs_recovered_total')
            pass "Total abandoned jobs recovered: $FINAL_RECOVERED"

            exit 0
        else
            fail "Job did not complete after recovery" "Status: $FINAL_STATUS"
            exit 1
        fi
    fi
done

# If we got here, monitor didn't detect the abandoned job in time
fail "Monitor did not detect abandoned job within 3 minutes"
info "This may be because:"
info "  - Monitor cron interval is too long (currently 1 minute)"
info "  - Job timeout is too long (currently 1 minute)"
info "  - Monitor service is not running"
exit 1
