#!/bin/bash

# Test 6: Health Endpoints

source "$(dirname "$0")/test-utils.sh"

echo -e "${BLUE}=== Test 6: Health Endpoints ===${NC}"

# API Health
API_HEALTH=$(curl -s "$API_URL/health")
if echo $API_HEALTH | jq -e '.status == "ok"' > /dev/null; then
    pass "API health check"
else
    fail "API health check" "Response: $API_HEALTH"
    exit 1
fi

# Worker Stats
WORKER_STATS=$(curl -s "http://localhost:3001/stats")
if echo $WORKER_STATS | jq -e '.worker_memory_usage' > /dev/null; then
    pass "Worker stats endpoint"
else
    fail "Worker stats endpoint" "Response: $WORKER_STATS"
    exit 1
fi

# Monitor Metrics
MONITOR_METRICS=$(curl -s "http://localhost:3002/metrics/system")
if echo $MONITOR_METRICS | jq -e '.abandoned_jobs_recovered_total' > /dev/null; then
    pass "Monitor metrics endpoint"
    exit 0
else
    fail "Monitor metrics endpoint" "Response: $MONITOR_METRICS"
    exit 1
fi
