#!/bin/bash

# Main test runner - runs all integration tests

source "$(dirname "$0")/test-utils.sh"

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

echo -e "${BLUE}================================${NC}"
echo -e "${BLUE}Job Service Integration Tests${NC}"
echo -e "${BLUE}================================${NC}"
echo ""

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

# Run a single test
run_test() {
    local test_script=$1
    local test_name=$(basename "$test_script" .sh)

    TESTS_RUN=$((TESTS_RUN + 1))

    echo ""
    if bash "$test_script"; then
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
}

echo -e "${BLUE}=== Test Setup ===${NC}"
check_prerequisites

# Ensure API is running
info "Checking if API is running..."
if ! curl -s "$API_URL/health" > /dev/null 2>&1; then
    warn "API not running. Please start services:"
    echo "  Terminal 1: cd codebase && npm run start:dev:api"
    echo "  Terminal 2: cd codebase && npm run start:dev:worker"
    echo "  Terminal 3: cd codebase && npm run start:dev:monitor"
    exit 1
fi

wait_for_service "$API_URL/health" "API Server"

# Run all tests
run_test "$(dirname "$0")/test-00-health.sh"
run_test "$(dirname "$0")/test-01-happy-path.sh"
run_test "$(dirname "$0")/test-02-retry-logic.sh"
run_test "$(dirname "$0")/test-03-cancel-pending.sh"
run_test "$(dirname "$0")/test-04-cancel-processing.sh"
run_test "$(dirname "$0")/test-05-concurrent-jobs.sh"

echo ""
warn "Test 06-07: Abandoned Job Recovery (LONG TEST - ~3-4 minutes)"
info "This test will:"
info "  1. Submit a long-running job"
info "  2. Kill the worker to simulate a crash"
info "  3. Wait for monitor to detect and re-enqueue the job (1 min timeout + 1 min cron)"
info "  4. Restart worker and verify completion"
echo ""
read -p "Run abandoned job recovery test? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    run_test "$(dirname "$0")/test-07-abandoned-job-recovery.sh"
else
    info "Skipping abandoned job recovery test"
fi

run_test "$(dirname "$0")/test-08-health-endpoints.sh"
run_test "$(dirname "$0")/test-09-monitoring-stats.sh"

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
