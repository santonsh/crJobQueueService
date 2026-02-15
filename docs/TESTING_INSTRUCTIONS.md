# Testing Instructions

This document describes the testing infrastructure for the Job Processing System.

## Overview

The test suite is organized into modular, environment-aware integration tests located in the `tests/` directory. Tests can run against three deployment environments:

- **local**: Local development (API: 3000, Monitor: 3002, Worker: 3001)
- **full**: Full stack Docker (API: 3020, Monitor: 3022)
- **loadbalanced**: Load-balanced Docker (API: 3010, Monitor: 3012)

## Prerequisites

### Required Tools

```bash
# jq - JSON parsing for test scripts
brew install jq

# Docker - For containerized environments
docker --version
```

### Docker Containers

Ensure Docker is running:
```bash
docker ps
```

## Deployment Environments

### Local Development Environment

**Services:** API, Worker, Monitor (running directly on host)
**Infrastructure:** PostgreSQL and Redis in Docker

**Start infrastructure:**
```bash
docker-compose -f docker-compose.dev-support.yml up -d
```

**Start services (in separate terminals):**

Terminal 1 - API:
```bash
cd codebase
npm run start:dev:api
```
Wait for: "🚀 API Server is running on: http://localhost:3000"

Terminal 2 - Worker:
```bash
cd codebase
npm run start:dev:worker
```
Wait for: "⚙️ Worker is running on: http://localhost:3001"

Terminal 3 - Monitor:
```bash
cd codebase
npm run start:dev:monitor
```
Wait for: "📊 Monitor is running on: http://localhost:3002"

**Verify services:**
```bash
curl http://localhost:3000/health  # API
curl http://localhost:3001/stats   # Worker stats
curl http://localhost:3002/health  # Monitor
```

### Full Stack Docker Environment

**Services:** 1 API, 1 Monitor, 5 Workers, PostgreSQL, Redis (all containerized)

**Start:**
```bash
docker-compose -f docker-compose.full.yml up -d
```

**Verify:**
```bash
docker ps | grep jobs-  # Should show 8 containers
curl http://localhost:3020/health  # API
curl http://localhost:3022/health  # Monitor
```

**Stop:**
```bash
docker-compose -f docker-compose.full.yml down
```

### Load-Balanced Docker Environment

**Services:** 2 APIs (load-balanced), 1 Monitor, 5 Workers, PostgreSQL, Redis (all containerized)

**Start:**
```bash
docker-compose -f docker-compose.loadbalanced.yml up -d
```

**Verify:**
```bash
docker ps | grep jobs-  # Should show 9 containers
curl http://localhost:3010/health  # Load-balanced API
curl http://localhost:3012/health  # Monitor
```

**Stop:**
```bash
docker-compose -f docker-compose.loadbalanced.yml down
```

## Integration Tests

### Running All Tests

```bash
# Local environment (default)
bash tests/run-all-tests.sh

# Full stack Docker
bash tests/run-all-tests.sh --env full

# Load-balanced Docker
bash tests/run-all-tests.sh --env loadbalanced
```

### Individual Tests

All test scripts are located in `tests/` and follow the naming pattern `test-XX-description.sh`:

#### Test 00: Health Checks
```bash
bash tests/test-00-health.sh
```
Verifies all services are running and healthy:
- API health endpoint
- Monitor health endpoint
- Worker stats endpoint (local only)

#### Test 01: Happy Path
```bash
bash tests/test-01-happy-path.sh
```
Tests successful job execution:
- Submit job with 0% failure probability
- Verify PENDING → PROCESSING → COMPLETED transition

#### Test 02: Retry Logic
```bash
bash tests/test-02-retry-logic.sh
```
Tests job retry mechanism:
- Submit job with 100% failure probability
- Verify retry attempts with exponential backoff
- Verify final FAILED status after max retries

#### Test 03: Cancel Pending Job
```bash
bash tests/test-03-cancel-pending.sh
```
Tests cancellation of queued jobs:
- Submit job
- Cancel before processing starts
- Verify PENDING → CANCELLED transition

#### Test 04: Cancel Processing Job
```bash
bash tests/test-04-cancel-processing.sh
```
Tests cancellation of running jobs:
- Submit long-running job
- Cancel while processing
- Verify PROCESSING → CANCELLED transition

#### Test 05: Concurrent Jobs
```bash
bash tests/test-05-concurrent-jobs.sh
```
Tests parallel job processing:
- Submit 10 concurrent jobs
- Verify all complete successfully
- Check processing distribution

#### Test 07: Abandoned Job Recovery
```bash
bash tests/test-07-abandoned-job-recovery.sh
```
Tests monitor's abandoned job recovery (LOCAL ONLY):
- Submit long-running job
- Kill worker to simulate crash
- Verify monitor detects and re-enqueues job
- Restart worker and verify completion

**Note:** This test only runs in local environment where worker processes can be controlled. Automatically skipped for Docker environments.

#### Test 08: Health Endpoints
```bash
bash tests/test-08-health-endpoints.sh
```
Validates health and metrics endpoints:
- API health endpoint structure
- Worker stats endpoint (local only)
- Monitor metrics endpoint

#### Test 09: Monitoring Stats
```bash
bash tests/test-09-monitoring-stats.sh
```
Validates monitoring and metrics accuracy:
- Worker stats publishing to Redis
- Monitor worker aggregation
- Job metrics accuracy
- Queue metrics (depth, waiting, active, failed)
- System metrics

### Test Utilities

The `tests/test-utils.sh` file provides shared functions:

**Environment Configuration:**
- Automatic port mapping based on `DEPLOYMENT_ENV`
- API and Monitor URL construction

**Helper Functions:**
- `pass()` - Print success message
- `fail()` - Print failure message and details
- `info()` - Print informational message
- `warn()` - Print warning message
- `wait_for_service()` - Poll endpoint until healthy
- `submit_job()` - Submit test job with execution time and failure probability

**Usage in tests:**
```bash
source "$(dirname "$0")/test-utils.sh"

# Submit a 2-second job with 0% failure
JOB_ID=$(submit_job 2000 0)
```

## Load Testing

### 2K QPS Load Test

High-throughput load test with configurable parameters:

```bash
# Basic usage (local environment)
node tests/load-test-2k-qps.js

# Full stack environment
node tests/load-test-2k-qps.js --env full

# Load-balanced environment
node tests/load-test-2k-qps.js --env loadbalanced

# Custom configuration
node tests/load-test-2k-qps.js \
  --qps 2000 \
  --duration 60 \
  --concurrency 50 \
  --execution-time 100 \
  --env full
```

**Parameters:**
- `--qps <number>`: Target queries per second (default: 2000)
- `--duration <seconds>`: Test duration in seconds (default: 60)
- `--execution-time <ms>`: Job execution time in milliseconds (default: 100)
- `--concurrency <num>`: Number of concurrent workers (default: 50)
- `--warmup <seconds>`: Warmup period before test (default: 5)
- `--env <type>`: Deployment environment (local, full, loadbalanced)
- `--api-layer`: Test API layer only (GET /health) without database writes

**Output:**
- Real-time QPS metrics
- Success/failure counts
- Response time percentiles (p50, p95, p99)
- Final statistics summary

## Manual Testing

### Submit a Test Job

```bash
curl -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "class": "test",
    "type": "delay",
    "payload": {
      "executionTime": 2000,
      "failureProb": 0
    }
  }'
```

**Expected response:**
```json
{
  "jobId": "uuid-here",
  "class": "test",
  "type": "delay",
  "status": "PENDING",
  "createdAt": "2025-02-15T...",
  ...
}
```

### Check Job Status

```bash
curl http://localhost:3000/jobs/{jobId}
```

### Cancel a Job

```bash
curl -X DELETE http://localhost:3000/jobs/{jobId}
```

### Monitor Metrics

```bash
# Job metrics
curl http://localhost:3002/metrics/jobs | jq

# Queue metrics
curl http://localhost:3002/metrics/queue | jq

# Worker metrics
curl http://localhost:3002/metrics/workers | jq

# System metrics
curl http://localhost:3002/metrics/system | jq
```

### Worker Stats (Local Only)

```bash
curl http://localhost:3001/stats | jq
```

## Troubleshooting

### Tests Failing to Connect

**Check services are running:**
```bash
# Local environment
curl http://localhost:3000/health
curl http://localhost:3002/health

# Full stack
curl http://localhost:3020/health
curl http://localhost:3022/health

# Load-balanced
curl http://localhost:3010/health
curl http://localhost:3012/health
```

**Check Docker containers:**
```bash
docker ps | grep jobs-
```

**Restart environment:**
```bash
# Local
docker-compose -f docker-compose.dev-support.yml restart

# Full
docker-compose -f docker-compose.full.yml restart

# Load-balanced
docker-compose -f docker-compose.loadbalanced.yml restart
```

### Database Connection Issues

**Check PostgreSQL is running:**
```bash
docker ps | grep postgres
```

**Connect to database:**
```bash
# Local environment
docker exec -it dev-support-postgres psql -U jobsuser -d jobsdb

# Full stack
docker exec -it jobs-postgres psql -U jobsuser -d jobsdb

# Load-balanced
docker exec -it jobs-postgres-lb psql -U jobsuser -d jobsdb
```

**Verify jobs table exists:**
```sql
\dt
SELECT COUNT(*) FROM jobs;
```

### Redis Connection Issues

**Check Redis is running:**
```bash
docker ps | grep redis
```

**Connect to Redis:**
```bash
# Local environment
docker exec -it dev-support-redis redis-cli

# Full stack
docker exec -it jobs-redis redis-cli

# Load-balanced
docker exec -it jobs-redis-lb redis-cli
```

**Check queue:**
```redis
KEYS bull:jobs:*
```

### High Connection Pool Usage

**Check worker stats:**
```bash
curl http://localhost:3001/stats | jq '.worker_db_pool_usage_percent'
```

**Monitor pool metrics:**
```bash
# Watch connection pool usage
watch -n 2 'curl -s http://localhost:3001/stats | jq "{total: .worker_db_pool_total, idle: .worker_db_pool_idle, waiting: .worker_db_pool_waiting, max: .worker_db_pool_max, usage: .worker_db_pool_usage_percent}"'
```

**If pool exhaustion occurs:**
- Check for connection leaks in code
- Increase `DB_POOL_MAX` in environment configuration
- Reduce worker concurrency (`WORKER_CONCURRENCY`)
- Review long-running queries/transactions

### Test-Specific Issues

#### Abandoned Job Recovery Test Fails

This test only works in local environment. It automatically skips for Docker environments because it requires:
- Direct access to worker process (port 3001)
- Ability to kill and restart worker process
- Worker not in a container

#### Worker Stats Endpoint Not Found (Docker)

Worker stats endpoints are not exposed in Docker environments. Tests automatically skip these checks for `full` and `loadbalanced` environments. Worker stats are published to Redis and aggregated by the Monitor service instead.

### Viewing Service Logs

**Local environment:**
Check terminal windows where services are running.

**Docker environments:**
```bash
# All services
docker-compose -f docker-compose.full.yml logs -f

# Specific service
docker logs -f jobs-api
docker logs -f jobs-worker-1
docker logs -f jobs-monitor

# Last 100 lines
docker logs --tail 100 jobs-api
```

### Clean Slate

**Reset local environment:**
```bash
# Stop services (Ctrl+C in each terminal)
# Or kill all:
pkill -f "nest start"

# Reset Docker infrastructure
docker-compose -f docker-compose.dev-support.yml down -v
docker-compose -f docker-compose.dev-support.yml up -d

# Restart services
cd codebase
npm run start:dev:api &
npm run start:dev:worker &
npm run start:dev:monitor &
```

**Reset full stack:**
```bash
docker-compose -f docker-compose.full.yml down -v
docker-compose -f docker-compose.full.yml up -d
```

**Reset load-balanced:**
```bash
docker-compose -f docker-compose.loadbalanced.yml down -v
docker-compose -f docker-compose.loadbalanced.yml up -d
```

## Environment-Specific Notes

### Local Environment
- **Pros:** Fast iteration, direct debugging, worker stats endpoint available
- **Cons:** Single worker, doesn't test distributed scenarios
- **Best for:** Development, debugging, abandoned job recovery testing

### Full Stack Docker
- **Pros:** 5 workers, tests distributed processing, production-like configuration
- **Cons:** Slower startup, harder to debug, no load balancing
- **Best for:** Integration testing, multi-worker scenarios, pre-production validation

### Load-Balanced Docker
- **Pros:** Load-balanced API, 5 workers, most production-like
- **Cons:** Most complex, slowest startup, hardest to debug
- **Best for:** Performance testing, load testing, production simulation
