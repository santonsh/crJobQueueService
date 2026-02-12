# Implementation Plan

This document tracks the implementation roadmap and progress for completing the Jobs Service.

## Overview

The system is ~60% complete with solid foundations. Remaining work focuses on completing monitoring, adding batch operations, deployment configuration, and performance testing.

**Status Legend**: ☐ Pending | → In Progress | ✓ Complete

---

## Step 1: Complete Worker + Monitor Stats

**Goal**: Full observability with real metrics collection and aggregation

**Estimated Time**: 4-5 hours

### 1.1 Worker Stats Implementation
- ☐ Implement CPU usage tracking in `WorkerStatsService`
  - Use Node.js `process.cpuUsage()` API
  - Calculate percentage over time interval
- ☐ Track active jobs counter
  - Increment on job start
  - Decrement on job completion/failure
  - Connect `JobsProcessor` to `WorkerStatsService`
- ☐ Add Redis client to `WorkerStatsService`
- ☐ Implement periodic stats publishing (every 30s)
  - Key pattern: `worker:stats:{WORKER_TYPE}:{WORKER_ID}`
  - TTL: 300 seconds (5 minutes)
  - Include: workerId, workerType, queues, all metrics
- ☐ Add environment variables:
  - `WORKER_TYPE` (default: "general")
  - `WORKER_ID` (auto-generate from hostname+PID if not provided)
  - `WORKER_STATS_PUBLISH_INTERVAL_SECONDS` (default: 30)

### 1.2 Monitor Stats Aggregation
- ☐ Add Redis client to `MonitorService`
- ☐ Implement `getWorkerMetrics()`:
  - Scan Redis keys: `worker:stats:*` (use SCAN, not KEYS)
  - MGET all worker stats
  - Aggregate by worker type (count, avg CPU/memory, sum active jobs)
- ☐ Implement `getJobMetrics()`:
  - Query PostgreSQL for job counts by status
  - Query by class and type
  - Return job_submissions_total, job_status_total
- ☐ Implement `getQueueMetrics()`:
  - Add BullMQ Queue client
  - Query queue depth (waiting + active)
  - Track processing rate (completed count delta)
- ☐ Complete `getSystemMetrics()`:
  - Query TypeORM connection pool stats
  - Track Redis connection errors

### 1.3 Testing & Documentation
- ☐ Add monitoring test: `tests/test-09-monitoring-stats.sh`
  - Verify worker stats publishing to Redis
  - Verify monitor aggregation accuracy
  - Test with multiple workers
- ☐ Update `docs/MONITORING.md`:
  - Mark Phase 1 checklist items complete
  - Mark Phase 2 checklist items complete

---

## Step 2: Add Monitor Stats to MonitorUI

**Goal**: Rich data visualization in the dashboard

**Estimated Time**: 2-3 hours

- ☐ Update MonitorUI to display real worker stats
  - Show per-worker breakdown (CPU, memory, active jobs)
  - Display aggregated metrics by worker type
- ☐ Add charts/visualizations
  - CPU usage graph
  - Memory usage graph
  - Active jobs by worker type
  - Queue depth over time
- ☐ Improve UI layout for better data presentation
- ☐ Add filtering/sorting for workers

---

## Step 3: Batch Job Enqueue

**Goal**: Efficient bulk job submission

**Estimated Time**: 2-3 hours

### 3.1 Implementation
- ☐ Add `POST /jobs/bulk` endpoint to `JobsController`
- ☐ Create `CreateBulkJobsDto` for request validation
- ☐ Implement batch database insert in `JobsService`
  - Single transaction for all jobs
  - Return array of job IDs
- ☐ Implement batch BullMQ enqueue
  - Use BullMQ's `addBulk()` method
  - More efficient than individual `add()` calls

### 3.2 Testing
- ☐ Add test: `tests/test-10-batch-jobs.sh`
  - Submit 100 jobs in bulk
  - Verify all jobs created
  - Verify all jobs processed
  - Measure performance vs individual submissions

---

## Step 4: Testing Procedure Endpoint

**Goal**: Automated test execution via API/UI

**Estimated Time**: 2-3 hours

### 4.1 Design
- ☐ Design testing endpoint structure:
  - `POST /tests/run` with test scenario selection
  - Return test results (pass/fail, timing, details)
  - Support scenarios: happy-path, retry, cancellation, concurrent, abandoned, etc.

### 4.2 Implementation
- ☐ Add `TestsController` to monitor service
- ☐ Implement test scenario runners
  - Reuse logic from shell test scripts
  - Return structured JSON results
- ☐ Add test execution tracking (in-progress, completed)

### 4.3 UI Integration
- ☐ Add "Testing" tab to MonitorUI
- ☐ Display available test scenarios
- ☐ Show test execution status and results
- ☐ Display test history

### 4.4 Debug Cleanup Endpoints
- ☐ Add debug cleanup endpoints to monitor service for testing/debugging:
  - `POST /debug/clean/stats` - Clear worker stats from Redis
    - Delete all `worker:stats:*` keys
    - Reset in-memory counters (abandonedJobsRecovered, jobsDeleted)
  - `POST /debug/clean/table` - Truncate jobs table in PostgreSQL
    - Delete all job records from database
    - Reset sequences if applicable
  - `POST /debug/clean/queue` - Clear all jobs from BullMQ queue
    - Remove all jobs from waiting, active, delayed states
    - Clear completed and failed job lists
  - `POST /debug/clean/all` - Execute all cleanup operations above
    - Comprehensive system reset for testing
- ☐ Add safety confirmation parameter (e.g., `confirm: true`)
- ☐ Document these endpoints in ARCHITECTURE.md
- ☐ Add warning logs when cleanup endpoints are called

**Purpose**: Enable quick system reset between test runs without restarting services

---

## Step 5: Docker Compose for Full Deployment

**Goal**: Single-command deployment of entire system

**Estimated Time**: 2-3 hours

- ☐ Create `docker-compose.full.yml`
- ☐ Add services:
  - PostgreSQL (with initialization)
  - Redis
  - API service (build from Dockerfile)
  - Monitor service (build from Dockerfile)
  - Worker service × 2 instances (with different names)
- ☐ Add environment configuration
  - Shared .env file
  - Service-specific overrides
- ☐ Add healthchecks for all services
- ☐ Add volume mounts for persistence
- ☐ Create Dockerfiles for API, Worker, Monitor if missing
- ☐ Test full deployment: `docker-compose -f docker-compose.full.yml up`
- ☐ Document deployment process in README

---

## Step 6: High-Frequency Mode Logging

**Goal**: Minimal logging overhead at high throughput

**Estimated Time**: 1-2 hours

- ☐ Add `HF_MODE` environment variable (default: false)
- ☐ Modify API service logging:
  - Suppress per-request logs when `HF_MODE=true`
  - Keep: startup, shutdown, errors
  - Remove: job submission logs, status query logs
- ☐ Modify Worker service logging:
  - Suppress per-job logs when `HF_MODE=true`
  - Keep: startup, shutdown, errors, worker registration
  - Remove: job received, job started, job completed logs
- ☐ Test logging output with HF_MODE on/off
- ☐ Document in `.env.example` and SETUP_GUIDE.md

---

## Step 7: 2K QPS Load Test

**Goal**: Validate system performance at scale

**Estimated Time**: 2-3 hours

### 7.1 Setup
- ☐ Choose load testing tool (autocannon, wrk, or custom script)
- ☐ Create load test script: `tests/load-test-2k-qps.sh`
- ☐ Configure test parameters:
  - Target: 2000 requests/second
  - Duration: 5 minutes sustained
  - Job type: simple delay (1-2 seconds)

### 7.2 Execution
- ☐ Run baseline test (1 worker)
- ☐ Scale workers (5, 10, 20)
- ☐ Monitor system during test:
  - CPU usage (API, Workers, DB, Redis)
  - Memory usage
  - Queue depth
  - Database connections
  - Error rate

### 7.3 Analysis
- ☐ Measure latencies:
  - P50 (median)
  - P95
  - P99
- ☐ Measure throughput:
  - Actual requests/second achieved
  - Jobs completed/second
- ☐ Identify bottlenecks:
  - API server
  - Database
  - Redis
  - Worker processing
- ☐ Document results in `docs/LOAD_TEST_RESULTS.md`

---

## Timeline Summary

| Step | Task | Estimated Time |
|------|------|----------------|
| 1 | Worker + Monitor Stats | 4-5 hours |
| 2 | MonitorUI Visualization | 2-3 hours |
| 3 | Batch Job Enqueue | 2-3 hours |
| 4 | Testing Procedure Endpoint | 2-3 hours |
| 5 | Docker Compose Full | 2-3 hours |
| 6 | HF_MODE Logging | 1-2 hours |
| 7 | 2K QPS Load Test | 2-3 hours |
| **Total** | | **15-22 hours** |

---

## Progress Tracking

**Last Updated**: 2026-02-12

- Step 1: ☐ Not Started
- Step 2: ☐ Not Started
- Step 3: ☐ Not Started
- Step 4: ☐ Not Started
- Step 5: ☐ Not Started
- Step 6: ☐ Not Started
- Step 7: ☐ Not Started

**Completion**: 0/7 steps (0%)

---

## Notes

- Steps 1-2 should be completed first (foundation for observability)
- Steps 3-6 can be done in parallel after Step 1
- Step 7 should be last (requires everything else to be complete)
- Update this document as tasks are completed
- Mark items with → when in progress, ✓ when complete
