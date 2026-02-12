#!/bin/bash

# Test 00: Health Checks
# Verifies that all services are running and healthy

source "$(dirname "$0")/test-utils.sh"

API_URL="http://localhost:3000"
MONITOR_URL="http://localhost:3002"
WORKER_STATS_URL="http://localhost:3001"

echo "=================================="
echo "Test 00: Health Checks"
echo "=================================="

# Check API health
info "Checking API health at $API_URL/health..."
API_HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/health")

if [ "$API_HTTP_CODE" = "200" ]; then
  pass "API is healthy (HTTP $API_HTTP_CODE)"
  API_RESPONSE=$(curl -s "$API_URL/health")
  info "  Response: $API_RESPONSE"
else
  fail "API health check failed (HTTP $API_HTTP_CODE)"
  exit 1
fi

# Check Monitor health
info "Checking Monitor health at $MONITOR_URL/health..."
MONITOR_HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$MONITOR_URL/health")

if [ "$MONITOR_HTTP_CODE" = "200" ]; then
  pass "Monitor is healthy (HTTP $MONITOR_HTTP_CODE)"
  MONITOR_RESPONSE=$(curl -s "$MONITOR_URL/health")
  info "  Response: $MONITOR_RESPONSE"
else
  fail "Monitor health check failed (HTTP $MONITOR_HTTP_CODE)"
  exit 1
fi

# Check Worker stats endpoint
info "Checking Worker stats at $WORKER_STATS_URL/stats..."
WORKER_HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$WORKER_STATS_URL/stats")

if [ "$WORKER_HTTP_CODE" = "200" ]; then
  pass "Worker stats endpoint is healthy (HTTP $WORKER_HTTP_CODE)"

  # Parse and display key stats
  WORKER_RESPONSE=$(curl -s "$WORKER_STATS_URL/stats")
  WORKER_ID=$(echo "$WORKER_RESPONSE" | jq -r '.workerId // "unknown"')
  WORKER_TYPE=$(echo "$WORKER_RESPONSE" | jq -r '.workerType // "unknown"')
  UPTIME=$(echo "$WORKER_RESPONSE" | jq -r '.worker_uptime_seconds // 0')

  info "  Worker ID: $WORKER_ID"
  info "  Worker Type: $WORKER_TYPE"
  info "  Uptime: ${UPTIME}s"
else
  fail "Worker stats endpoint failed (HTTP $WORKER_HTTP_CODE)"
  warn "Worker may not be running on port 3001"
  exit 1
fi

echo ""
echo "=================================="
echo "✓ Test 00 PASSED"
echo "=================================="
echo ""
echo "Summary:"
echo "  - API (port 3000): ✓"
echo "  - Monitor (port 3002): ✓"
echo "  - Worker Stats (port 3001): ✓"
echo ""

exit 0
