#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# API endpoint
API_URL="http://localhost:3000"

echo -e "${BLUE}================================${NC}"
echo -e "${BLUE}Job Service Integration Tests${NC}"
echo -e "${BLUE}================================${NC}"
echo ""

# Helper functions
pass() {
    TESTS_RUN=$((TESTS_RUN + 1))
    TESTS_PASSED=$((TESTS_PASSED + 1))
    echo -e "${GREEN}✓ PASS${NC}: $1"
}

fail() {
    TESTS_RUN=$((TESTS_RUN + 1))
    TESTS_FAILED=$((TESTS_FAILED + 1))
    echo -e "${RED}✗ FAIL${NC}: $1"
    if [ ! -z "$2" ]; then
        echo -e "${RED}  Details: $2${NC}"
    fi
}

info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    info "Checking prerequisites..."

    # Check if jq is installed
    if ! command -v jq &> /dev/null; then
        fail "jq is not installed (required for JSON parsing)"
        echo "Install with: brew install jq"
        exit 1
    fi

    # Check if Docker is running
    if ! docker ps &> /dev/null; then
        fail "Docker is not running"
        exit 1
    fi

    # Check if containers are running
    if ! docker ps | grep -q "jobs-postgres"; then
        warn "PostgreSQL container not running. Starting docker-compose..."
        docker-compose up -d
        sleep 5
    fi

    pass "Prerequisites check"
}

# Wait for service to be ready
wait_for_service() {
    local url=$1
    local name=$2
    local max_attempts=30
    local attempt=0

    info "Waiting for $name to be ready..."

    while [ $attempt -lt $max_attempts ]; do
        if curl -s "$url" > /dev/null 2>&1; then
            pass "$name is ready"
            return 0
        fi
        attempt=$((attempt + 1))
        sleep 1
    done

    fail "$name failed to start within 30 seconds"
    return 1
}

# Wait for job to reach a specific status
wait_for_status() {
    local job_id=$1
    local expected_status=$2
    local max_attempts=${3:-30}
    local attempt=0

    while [ $attempt -lt $max_attempts ]; do
        local status=$(curl -s "$API_URL/jobs/$job_id" | jq -r '.status')

        if [ "$status" == "$expected_status" ]; then
            return 0
        fi

        attempt=$((attempt + 1))
        sleep 1
    done

    return 1
}

echo ""
echo -e "${BLUE}=== Test Setup ===${NC}"
check_prerequisites

# Ensure services are running
info "Checking if API is running..."
if ! curl -s "$API_URL/health" > /dev/null 2>&1; then
    warn "API not running. Please start services:"
    echo "  Terminal 1: cd codebase && npm run start:dev:api"
    echo "  Terminal 2: cd codebase && npm run start:dev:worker"
    echo "  Terminal 3: cd codebase && npm run start:dev:monitor"
    exit 1
fi

wait_for_service "$API_URL/health" "API Server"

echo ""
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
fi

info "Waiting for job to complete (2s execution + processing time)..."
sleep 4

FINAL_STATUS=$(curl -s "$API_URL/jobs/$JOB_ID" | jq -r '.status')
if [ "$FINAL_STATUS" == "COMPLETED" ]; then
    pass "Job completed successfully"
else
    fail "Job did not complete" "Status: $FINAL_STATUS"
fi

echo ""
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
fi

if [ "$ATTEMPTS" -gt 1 ]; then
    pass "Retry logic executed ($ATTEMPTS attempts)"
else
    warn "Job succeeded on first attempt (expected retries with 80% failure prob)"
fi

echo ""
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
else
    fail "Job not cancelled" "Status: $CANCEL_STATUS"
fi

echo ""
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
else
    fail "Job not cancelled" "Status: $CANCEL_STATUS"
fi

echo ""
echo -e "${BLUE}=== Test 5: Concurrent Jobs ===${NC}"
info "Submitting 10 jobs concurrently..."

CONCURRENT_JOB_IDS=()
for i in {1..10}; do
    JOB_RESPONSE=$(curl -s -X POST "$API_URL/jobs" \
      -H "Content-Type: application/json" \
      -d "{
        \"class\": \"test\",
        \"type\": \"delay\",
        \"payload\": {
          \"executionTime\": 1000,
          \"failureProb\": 0
        }
      }")

    JOB_ID=$(echo $JOB_RESPONSE | jq -r '.jobId')
    CONCURRENT_JOB_IDS+=($JOB_ID)
done

pass "Submitted 10 concurrent jobs"

info "Waiting for all jobs to complete..."
sleep 8

COMPLETED_COUNT=0
for JOB_ID in "${CONCURRENT_JOB_IDS[@]}"; do
    STATUS=$(curl -s "$API_URL/jobs/$JOB_ID" | jq -r '.status')
    if [ "$STATUS" == "COMPLETED" ]; then
        COMPLETED_COUNT=$((COMPLETED_COUNT + 1))
    fi
done

if [ $COMPLETED_COUNT -eq 10 ]; then
    pass "All 10 concurrent jobs completed successfully"
else
    fail "Not all concurrent jobs completed" "Completed: $COMPLETED_COUNT/10"
fi

echo ""
echo -e "${BLUE}=== Test 6: Health Endpoints ===${NC}"

# API Health
API_HEALTH=$(curl -s "$API_URL/health")
if echo $API_HEALTH | jq -e '.status == "ok"' > /dev/null; then
    pass "API health check"
else
    fail "API health check" "Response: $API_HEALTH"
fi

# Worker Stats
WORKER_STATS=$(curl -s "http://localhost:3001/stats")
if echo $WORKER_STATS | jq -e '.worker_memory_usage' > /dev/null; then
    pass "Worker stats endpoint"
else
    fail "Worker stats endpoint" "Response: $WORKER_STATS"
fi

# Monitor Metrics
MONITOR_METRICS=$(curl -s "http://localhost:3002/metrics/system")
if echo $MONITOR_METRICS | jq -e '.abandoned_jobs_recovered_total' > /dev/null; then
    pass "Monitor metrics endpoint"
else
    fail "Monitor metrics endpoint" "Response: $MONITOR_METRICS"
fi

echo ""
echo -e "${YELLOW}=== Test 7: Abandoned Job Recovery ===${NC}"
warn "This test requires manual intervention - skipping in automated mode"
info "To test manually:"
info "  1. Submit a long job"
info "  2. Kill the worker process (Ctrl+C)"
info "  3. Wait 2-5 minutes for monitor to detect (or set JOB_TIMEOUT_MINUTES=1)"
info "  4. Check monitor logs for 'Re-enqueued abandoned' message"
info "  5. Restart worker and verify job completes"

echo ""
echo -e "${BLUE}================================${NC}"
echo -e "${BLUE}Test Summary${NC}"
echo -e "${BLUE}================================${NC}"
echo -e "Tests Run:    $TESTS_RUN"
echo -e "${GREEN}Tests Passed: $TESTS_PASSED${NC}"
if [ $TESTS_FAILED -gt 0 ]; then
    echo -e "${RED}Tests Failed: $TESTS_FAILED${NC}"
else
    echo -e "${GREEN}Tests Failed: $TESTS_FAILED${NC}"
fi
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}🎉 All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}❌ Some tests failed${NC}"
    exit 1
fi
