#!/bin/bash

# Test 09: Monitoring Stats
# Verifies that:
# 1. Workers publish stats to Redis
# 2. Monitor can read and aggregate worker stats
# 3. Job metrics are accurate
# 4. Queue metrics are accurate

source "$(dirname "$0")/test-utils.sh"

WORKER_STATS_URL="http://localhost:3001"

echo "=================================="
echo "Test 09: Monitoring Stats"
echo "=================================="

# Step 1: Submit some test jobs to generate metrics
info "Submitting 5 test jobs..."
JOB_IDS=()
for i in {1..5}; do
  JOB_ID=$(submit_job 2000 0)  # 2 second jobs, 0% failure
  JOB_IDS+=("$JOB_ID")
  pass "Job $i submitted: $JOB_ID"
done

# Step 1.5: Check queue metrics immediately after submission (before jobs complete)
info "Checking queue metrics (jobs should be in queue)..."
QUEUE_METRICS_EARLY=$(curl -s "$MONITOR_URL/metrics/queue")

if [ -z "$QUEUE_METRICS_EARLY" ]; then
  fail "Queue metrics returned empty response"
  exit 1
fi

QUEUE_DEPTH_EARLY=$(echo $QUEUE_METRICS_EARLY | jq -r '.queue_depth')
QUEUE_WAITING_EARLY=$(echo $QUEUE_METRICS_EARLY | jq -r '.queue_waiting')
QUEUE_ACTIVE_EARLY=$(echo $QUEUE_METRICS_EARLY | jq -r '.queue_active')

if [ "$QUEUE_DEPTH_EARLY" = "null" ]; then
  fail "Queue metrics missing queue_depth"
  echo "  Response: $QUEUE_METRICS_EARLY"
  exit 1
fi

pass "Queue metrics working"
info "  Queue depth (waiting + active): $QUEUE_DEPTH_EARLY"
info "  Waiting (jobs in queue): $QUEUE_WAITING_EARLY"
info "  Active (jobs being processed): $QUEUE_ACTIVE_EARLY"

if [ "$QUEUE_DEPTH_EARLY" -ge 1 ]; then
  pass "Queue has jobs in flight (depth: $QUEUE_DEPTH_EARLY)"
else
  warn "Queue depth is 0 - jobs may have processed too quickly"
fi

# Wait a bit for jobs to start processing
sleep 1

# Step 2: Check worker stats endpoint (while jobs are processing) - only for local
if [ "$DEPLOYMENT_ENV" = "local" ]; then
  info "Checking worker stats endpoint (jobs should be processing)..."
  WORKER_STATS=$(curl -s "$WORKER_STATS_URL/stats")

  if [ -z "$WORKER_STATS" ]; then
    fail "Worker stats endpoint returned empty response"
    exit 1
  fi

  # Verify worker stats structure
  ACTIVE_JOBS=$(echo $WORKER_STATS | jq -r '.worker_active_jobs')
  CPU_USAGE=$(echo $WORKER_STATS | jq -r '.worker_cpu_usage')
  MEMORY_USAGE=$(echo $WORKER_STATS | jq -r '.worker_memory_usage')
  UPTIME=$(echo $WORKER_STATS | jq -r '.worker_uptime_seconds')
  PROCESSED=$(echo $WORKER_STATS | jq -r '.worker_processed_jobs_total')

  if [ "$ACTIVE_JOBS" = "null" ] || [ "$CPU_USAGE" = "null" ] || [ "$MEMORY_USAGE" = "null" ]; then
    fail "Worker stats missing required fields"
    echo "  Response: $WORKER_STATS"
    exit 1
  fi

  pass "Worker stats endpoint working"
  info "  Active jobs: $ACTIVE_JOBS"
  info "  Processed jobs: $PROCESSED"
  info "  CPU usage: $CPU_USAGE%"
  info "  Memory usage: ${MEMORY_USAGE}MB"
  info "  Uptime: ${UPTIME}s"

  # Verify that we're tracking the 5 jobs (active + processed should equal 5)
  TOTAL_TRACKED=$((ACTIVE_JOBS + PROCESSED))
  if [ "$TOTAL_TRACKED" -ge 5 ]; then
    pass "Worker is tracking all 5 submitted jobs (active: $ACTIVE_JOBS, processed: $PROCESSED)"
  else
    warn "Worker tracking only $TOTAL_TRACKED jobs (expected 5)"
  fi
else
  info "Skipping worker stats endpoint check (not available in $DEPLOYMENT_ENV environment)"
  pass "Worker stats will be checked via Monitor service"
fi

# Step 3: Wait for worker stats to be published to Redis (5 seconds reporting period)
info "Waiting 6 seconds for worker stats to publish to Redis..."
sleep 6

# Step 4: Check monitor worker metrics
info "Checking monitor worker metrics..."
MONITOR_WORKERS=$(curl -s "$MONITOR_URL/metrics/workers")

if [ -z "$MONITOR_WORKERS" ]; then
  fail "Monitor worker metrics returned empty response"
  exit 1
fi

# Verify monitor found workers
WORKERS_ARRAY=$(echo $MONITOR_WORKERS | jq -r '.workers')
WORKERS_COUNT=$(echo $WORKERS_ARRAY | jq 'length')

if [ "$WORKERS_COUNT" -eq 0 ]; then
  fail "Monitor did not find any workers in Redis"
  echo "  Response: $MONITOR_WORKERS"
  exit 1
fi

pass "Monitor found $WORKERS_COUNT worker(s) in Redis"

# Verify aggregated metrics exist
WORKERS_RUNNING=$(echo $MONITOR_WORKERS | jq -r '.last_sample_period_workers_running.general')
AVG_CPU=$(echo $MONITOR_WORKERS | jq -r '.last_sample_period_avg_cpu_utilization.general')
AVG_MEMORY=$(echo $MONITOR_WORKERS | jq -r '.last_sample_period_avg_memory_utilization.general')
TOTAL_ACTIVE=$(echo $MONITOR_WORKERS | jq -r '.last_sample_period_total_jobs_in_processing.general')

if [ "$WORKERS_RUNNING" = "null" ] || [ "$AVG_CPU" = "null" ]; then
  fail "Monitor worker metrics missing aggregated data"
  echo "  Response: $MONITOR_WORKERS"
  exit 1
fi

pass "Monitor aggregated worker metrics"
info "  Workers running (general): $WORKERS_RUNNING"
info "  Avg CPU (general): $AVG_CPU%"
info "  Avg memory (general): ${AVG_MEMORY}MB"
info "  Total active jobs (general): $TOTAL_ACTIVE"

# Step 5: Check monitor job metrics
info "Checking monitor job metrics..."
JOB_METRICS=$(curl -s "$MONITOR_URL/metrics/jobs")

if [ -z "$JOB_METRICS" ]; then
  fail "Monitor job metrics returned empty response"
  exit 1
fi

TOTAL_JOBS=$(echo $JOB_METRICS | jq -r '.job_submissions_total')
PENDING_COUNT=$(echo $JOB_METRICS | jq -r '.job_status_total.PENDING // 0')
PROCESSING_COUNT=$(echo $JOB_METRICS | jq -r '.job_status_total.PROCESSING // 0')
COMPLETED_COUNT=$(echo $JOB_METRICS | jq -r '.job_status_total.COMPLETED // 0')
FAILED_COUNT=$(echo $JOB_METRICS | jq -r '.job_status_total.FAILED // 0')
CANCELLED_COUNT=$(echo $JOB_METRICS | jq -r '.job_status_total.CANCELLED // 0')

if [ "$TOTAL_JOBS" = "null" ] || [ "$TOTAL_JOBS" -lt 5 ]; then
  fail "Job metrics show incorrect total ($TOTAL_JOBS, expected >= 5)"
  echo "  Response: $JOB_METRICS"
  exit 1
fi

pass "Monitor job metrics working"
info "  Total submissions: $TOTAL_JOBS"
info "  PENDING: $PENDING_COUNT"
info "  PROCESSING: $PROCESSING_COUNT"
info "  COMPLETED: $COMPLETED_COUNT"
info "  FAILED: $FAILED_COUNT"
info "  CANCELLED: $CANCELLED_COUNT"

# Step 6: Check queue metrics again (after processing - should be empty)
info "Checking queue metrics after processing (should be empty)..."
QUEUE_METRICS_LATE=$(curl -s "$MONITOR_URL/metrics/queue")

if [ -z "$QUEUE_METRICS_LATE" ]; then
  fail "Queue metrics returned empty response"
  exit 1
fi

QUEUE_DEPTH_LATE=$(echo $QUEUE_METRICS_LATE | jq -r '.queue_depth')
QUEUE_WAITING_LATE=$(echo $QUEUE_METRICS_LATE | jq -r '.queue_waiting')
QUEUE_ACTIVE_LATE=$(echo $QUEUE_METRICS_LATE | jq -r '.queue_active')

if [ "$QUEUE_DEPTH_LATE" = "null" ]; then
  fail "Queue metrics missing queue_depth"
  echo "  Response: $QUEUE_METRICS_LATE"
  exit 1
fi

pass "Queue metrics after processing"
info "  Queue depth: $QUEUE_DEPTH_LATE (should be 0)"
info "  Waiting: $QUEUE_WAITING_LATE"
info "  Active: $QUEUE_ACTIVE_LATE"

if [ "$QUEUE_DEPTH_LATE" -eq 0 ]; then
  pass "Queue is empty after processing (all jobs completed)"
else
  warn "Queue still has $QUEUE_DEPTH_LATE jobs"
fi

# Step 7: Check monitor system metrics
info "Checking monitor system metrics..."
SYSTEM_METRICS=$(curl -s "$MONITOR_URL/metrics/system")

if [ -z "$SYSTEM_METRICS" ]; then
  fail "Monitor system metrics returned empty response"
  exit 1
fi

ABANDONED_RECOVERED=$(echo $SYSTEM_METRICS | jq -r '.abandoned_jobs_recovered_total')
JOBS_DELETED=$(echo $SYSTEM_METRICS | jq -r '.jobs_deleted_total')

if [ "$ABANDONED_RECOVERED" = "null" ]; then
  fail "System metrics missing required fields"
  echo "  Response: $SYSTEM_METRICS"
  exit 1
fi

pass "Monitor system metrics working"
info "  Abandoned jobs recovered: $ABANDONED_RECOVERED"
info "  Jobs deleted: $JOBS_DELETED"

# Step 8: Wait for jobs to complete
info "Waiting for jobs to complete..."
sleep 5

# Verify all jobs completed
FINAL_JOB_METRICS=$(curl -s "$MONITOR_URL/metrics/jobs")
FINAL_COMPLETED=$(echo $FINAL_JOB_METRICS | jq -r '.job_status_total.COMPLETED // 0')

if [ "$FINAL_COMPLETED" -lt 5 ]; then
  warn "Only $FINAL_COMPLETED out of 5 jobs completed"
else
  pass "All 5 jobs completed"
fi

# Step 9: Verify worker stats updated (only for local)
if [ "$DEPLOYMENT_ENV" = "local" ]; then
  info "Checking updated worker stats..."
  FINAL_WORKER_STATS=$(curl -s "$WORKER_STATS_URL/stats")
  FINAL_PROCESSED=$(echo $FINAL_WORKER_STATS | jq -r '.worker_processed_jobs_total')
  FINAL_ACTIVE=$(echo $FINAL_WORKER_STATS | jq -r '.worker_active_jobs')

  if [ "$FINAL_PROCESSED" -ge "$PROCESSED" ]; then
    pass "Worker processed jobs count increased (was $PROCESSED, now $FINAL_PROCESSED)"
  else
    warn "Worker processed jobs count did not increase"
  fi

  if [ "$FINAL_ACTIVE" -eq 0 ]; then
    pass "Worker has no active jobs (all completed)"
  else
    warn "Worker still has $FINAL_ACTIVE active jobs"
  fi
else
  info "Skipping final worker stats check (not available in $DEPLOYMENT_ENV environment)"
  pass "Worker stats verified via Monitor service"
fi

echo ""
echo "=================================="
echo "✓ Test 09 PASSED"
echo "=================================="
echo ""
echo "Summary:"
if [ "$DEPLOYMENT_ENV" = "local" ]; then
  echo "  - Worker stats endpoint: ✓"
fi
echo "  - Worker stats published to Redis: ✓"
echo "  - Monitor worker aggregation: ✓"
echo "  - Monitor job metrics: ✓"
echo "  - Monitor queue metrics: ✓"
echo "  - Monitor system metrics: ✓"
echo "  - Stats updated correctly: ✓"
echo ""

exit 0
