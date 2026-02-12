# Architecture Document

## System Overview

Our architecture to support 1K-3K QPS will include:
- Single NestJS API server that will serve as ingestion layer
- Scalable NestJS workers
- BullMQ as a queue framework (based on Redis)
- PostgreSQL database to write and query job status
- Monitor service - a separate NestJS service to look for abandoned jobs, re-enqueue them, and expose metrics
- MonitorUI - Vue.js web application for visualizing system metrics and testing
- Docker Compose to wrap all together

We expect this setup to handle 1K QPS (this of course to be tested).

## Core Requirements & Design Decisions

### Concurrency & Exactly-Once Processing

#### BullMQ Distributed Locking
BullMQ provides distributed locking via Redis to prevent duplicate job dequeuing. Each job can only be claimed by one worker at a time.

#### Atomic State Transitions
Workers use conditional PostgreSQL updates to ensure exactly-once processing:

**When claiming a job:**
```sql
UPDATE jobs
SET status = 'PROCESSING', processingStartedAt = NOW()
WHERE id = ? AND status = 'PENDING'
```
If the update returns 0 rows → job already claimed or cancelled → worker skips processing.

**When completing a job:**
```sql
UPDATE jobs
SET status = 'COMPLETED', result = ?, finishedAt = NOW()
WHERE id = ? AND status = 'PROCESSING'
```
This ensures cancelled jobs aren't overwritten by late-completing workers.

### Fault Tolerance

#### Job Retries (Failed Processing)
If a job fails during processing, we can retry in two ways:
- **Option A:** Push again to pipeline (requires tracking retry number in job entity in DB)
- **Option B:** Schedule a retry within the worker operation. This way we can set exact retry time with exponential extension.

**We choose Option B** because:
- Option A is simpler but can affect the first-come-first-serve principle and prevents us from using efficient exponential time retries
- Option B allows precise timing control with exponential backoff
- Worker handles retry logic internally, incrementing attempts counter
- After maxAttempts is reached, job is marked as FAILED (no re-enqueue)

#### Abandoned Jobs Detection

Jobs can be abandoned in two scenarios:

**1. Abandoned PROCESSING Jobs**
Worker crashes or gets scaled down while processing a job.

**Detection Strategy:**
The Monitor service runs a cron job every 2 minutes to query the database:
```sql
SELECT id FROM jobs
WHERE status = 'PROCESSING'
AND processingStartedAt < NOW() - INTERVAL '${jobTimeoutMinutes} minutes'
```

**Recovery Strategy:**
For each abandoned PROCESSING job:
1. Re-enqueue to BullMQ
2. Update status back to PENDING:
   ```sql
   UPDATE jobs
   SET status = 'PENDING', processingStartedAt = NULL
   WHERE id = ? AND status = 'PROCESSING'
   ```
3. **Do NOT increment attempts counter** (abandonment is infrastructure failure, not job failure)
4. **Preserve original createdAt** to maintain creation timestamp

**2. Abandoned PENDING Jobs**
Jobs that exist in the database but were somehow lost from BullMQ queue (Redis failure, manual deletion, etc.).

**Detection Strategy:**
Monitor service queries for old PENDING jobs that should have been processed by now:
```sql
SELECT id FROM jobs
WHERE status = 'PENDING'
AND createdAt < NOW() - INTERVAL '${maxQueueWaitMinutes} minutes'
```

**Recovery Strategy:**
For each abandoned PENDING job:
1. Re-enqueue to BullMQ (job likely lost from queue)
2. No database update needed (already PENDING)

**Trade-offs:**
- Re-enqueued jobs lose their place in the queue (sent to back), but this is acceptable as abandoned jobs are rare infrastructure events
- `maxQueueWaitMinutes` threshold must be tuned based on queue depth and processing rate to avoid false positives

**Note:** For jobs with unpredictable execution length, we could introduce 'job heartbeat' where workers periodically update a timestamp in the DB - this is added to "If I had more time" section.

### Cancellation Handling

#### Race Condition: Cancel During Processing
- User calls `DELETE /jobs/:id` while worker is processing
- API conditionally updates: `UPDATE jobs SET status = 'CANCELLED', cancelledAt = NOW() WHERE id = ? AND status IN ('PENDING', 'PROCESSING')`
- When processing a job, worker first claims it: `UPDATE ... WHERE status = 'PENDING'`
  - If 0 rows updated → job is cancelled, worker skips processing
- Worker completes and attempts: `UPDATE ... SET status = 'COMPLETED' WHERE id = ? AND status = 'PROCESSING'`
  - If 0 rows updated → job was cancelled mid-processing
  - Result is discarded, job stays CANCELLED

**Trade-off:** This will result in correct outcome however would not prevent processing waste. For real-time cancellation of PROCESSING jobs, we would need PostgreSQL polling or a cancel queue subscription on workers (see "If I had more time").

We may delete the job from BullMQ queue as well, but this is not critical because of the conditional update logic above.

## Data Model

### Database Schema

```sql
CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class VARCHAR(255) NOT NULL,  -- indexed
  type VARCHAR(255) NOT NULL,   -- indexed
  status VARCHAR(20) NOT NULL,  -- PENDING, PROCESSING, COMPLETED, FAILED, CANCELLED
  payload JSONB NOT NULL,
  result JSONB,
  error JSONB,
  attempts INT DEFAULT 0,
  maxAttempts INT DEFAULT 3,
  createdAt TIMESTAMP NOT NULL DEFAULT NOW(),
  processingStartedAt TIMESTAMP,
  finishedAt TIMESTAMP,
  cancelledAt TIMESTAMP,
  metadata JSONB
);

CREATE INDEX idx_jobs_class ON jobs(class);
CREATE INDEX idx_jobs_type ON jobs(type);
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_created_at ON jobs(createdAt);
CREATE INDEX idx_jobs_processing_started_at ON jobs(processingStartedAt) WHERE status = 'PROCESSING';
```

**Field Explanations:**
- `class`: A group of job types (e.g., "data-processing", "notifications", "ml-tasks"). Used to classify jobs for potential separation to workers, priority queues, business domain, etc.
- `type`: Specific job type within a class (e.g., "email-send", "data-export", "ml-inference")
- `attempts`: Number of times job processing has been attempted (incremented on failure, NOT on abandonment)
- `processingStartedAt`: When worker claimed the job (used for abandoned job detection)
- `metadata`: Extensible field for additional job-specific data

### Job State Machine

```
PENDING → PROCESSING → COMPLETED
                    → FAILED (after maxAttempts retries)
                    → CANCELLED (by user)
        ↓
    CANCELLED (before processing)
```

**Valid Transitions:**
- PENDING → PROCESSING (worker claims job)
- PENDING → CANCELLED (user cancels before processing)
- PROCESSING → COMPLETED (job succeeds)
- PROCESSING → FAILED (job fails after maxAttempts)
- PROCESSING → CANCELLED (user cancels during processing)
- PROCESSING → PENDING (abandoned job detected by monitor)

### Job TTL
To prevent database pollution, we set a TTL for COMPLETED, FAILED, and CANCELLED jobs that should remove old entities from the table.

**Implementation:** Background cleanup job in the Monitor app that periodically deletes old jobs:
```sql
DELETE FROM jobs
WHERE status IN ('COMPLETED', 'FAILED', 'CANCELLED')
AND finishedAt < NOW() - INTERVAL '${ttlDays} days'
```

Typical TTL values:
- COMPLETED jobs: 7-30 days
- FAILED jobs: 30-90 days (for debugging)
- CANCELLED jobs: 7 days

## API Interface

### REST Endpoints

```
POST /jobs
Body: { class: string, type: string, payload: object }
Response: { jobId: UUID, status: "PENDING" }

GET /jobs/:id
Response: {
  jobId: UUID,
  class: string,
  type: string,
  status: string,
  payload: object,
  result?: object,
  error?: object,
  createdAt: timestamp,
  processingStartedAt?: timestamp,
  finishedAt?: timestamp
}

DELETE /jobs/:id
Response: { jobId: UUID, status: "CANCELLED" }
```

## Error Handling

### Validation Errors (HTTP 400)
Failed requests due to:
- Non-existent job type
- Invalid payload parameters
- Malformed JSON

These return HTTP 400 immediately with descriptive error message.

### Server Errors (HTTP 500)
Only for unhandled exceptions. All expected errors should be caught and handled appropriately.

### Processing Errors
- Errors during job execution are caught by the worker
- Written to the `error` field in the job entity (JSONB)
- Job status set to FAILED after maxAttempts retries
- Worker uses exponential backoff between retry attempts

### Dead Letter Queue (DLQ)
DLQ will not be implemented at this stage. Failed jobs (after maxAttempts) remain in the database with status=FAILED for manual investigation.

## NestJS Organization

### Project Structure

```
codebase/
  apps/
    ├── api/           # REST API server
    ├── worker/        # Job processor workers
    └── monitor/       # Abandoned job recovery, TTL cleanup, metrics/stats endpoints

  src/ (shared across apps)
    ├── modules/
    │   ├── common/        # Shared interfaces, DTOs, types
    │   └── jobs/          # Job module (shared service to operate on job entities in BullMQ and PostgreSQL)

monitorUI/              # Vue.js web application for monitoring
  ├── src/
  │   ├── App.vue      # Main dashboard component
  │   └── main.js      # Application entry point
  └── package.json     # Frontend dependencies (Vue, Vuetify, Axios)
```

**Note:** NestJS structures shared services under `src/modules/` or `src/services/`, not under `libs/`. Each app imports these shared modules.

### Modules

**Common Library:**
- Shared interfaces and types
- Job DTOs per job class/type

**Jobs Module** (shared service):
- Used by other modules to operate on job entities in BullMQ and PostgreSQL
- Handles BullMQ queue operations
- Handles PostgreSQL job CRUD operations
- Ensures consistency between queue and database

**API Server Modules:**
- JobServer module: REST interface to create, get, cancel jobs
- Validation module: Validates job class/type and payload

**Worker Modules:**
- Processor module: Job execution logic
- Retry handler: Exponential backoff retry logic
- Stats module: Exposes `/stats` endpoint with worker metrics

**Monitor Modules:**
- Cron module: Scheduled abandoned job detection and recovery (PROCESSING and PENDING jobs)
- Cleanup module: Job TTL cleanup (deletes old COMPLETED, FAILED, CANCELLED jobs)
- Metrics module: Aggregates and exposes metrics endpoints (`/metrics/*`)
- Stats aggregator: Polls worker `/stats` endpoints to collect worker metrics
- Debug module: Testing endpoints (`/debug/run_test`) for automated system validation

**MonitorUI (Vue.js Application):**
- Dashboard: Real-time visualization of system metrics
- Auto-refresh: Fetches metrics every 5 seconds
- Test Runner: Integrated button to execute automated system tests via `/debug/run_test`
- Responsive design: Built with Vue 3, Vuetify, and Axios
- Runs independently on port 8081 (development) or can be served as static build

## Configuration

### Service-Level Config

```
# Redis (BullMQ)
REDIS_URL=redis://localhost:6379

# PostgreSQL
DATABASE_URL=postgresql://user:pass@localhost:5432/jobs

# Monitor Service
MONITOR_CRON_SCHEDULE='*/2 * * * *'  # Check abandoned jobs every 2 minutes
CLEANUP_CRON_SCHEDULE='0 2 * * *'     # Run TTL cleanup daily at 2 AM
MAX_QUEUE_WAIT_MINUTES=30              # Threshold for detecting abandoned PENDING jobs
JOB_TTL_DAYS_COMPLETED=7               # TTL for COMPLETED jobs
JOB_TTL_DAYS_FAILED=30                 # TTL for FAILED jobs (keep longer for debugging)
JOB_TTL_DAYS_CANCELLED=7               # TTL for CANCELLED jobs

# Worker Service
WORKER_CONCURRENCY=10  # Jobs processed concurrently per worker instance
WORKER_STATS_PORT=3001 # Port for worker stats endpoint
```

### Job-Type Config

Jobs are categorized by class and type. Each type can override defaults:

```typescript
{
  "data-processing": {
    "data-export": {
      maxRetryAttempts: 5,
      exponentialBackoffBase: 2,
      jobTimeoutMinutes: 30
    },
    "data-transform": {
      maxRetryAttempts: 3,
      exponentialBackoffBase: 2,
      jobTimeoutMinutes: 10
    }
  },
  "notifications": {
    "email-send": {
      maxRetryAttempts: 3,
      exponentialBackoffBase: 1.5,
      jobTimeoutMinutes: 2
    },
    "sms-send": {
      maxRetryAttempts: 2,
      exponentialBackoffBase: 1.5,
      jobTimeoutMinutes: 1
    }
  }
}
```

**Defaults (if not specified per job type):**
- MAX_RETRY_ATTEMPTS: 3
- EXPONENTIAL_BACKOFF_BASE: 2
- JOB_TIMEOUT_MINUTES: 5

### Allowed Jobs Registry

`ALLOWED_JOBS` is a registry that checks if the requested class/type is supported. Theoretically, each job should have its own DTO/interface as a source of truth, and from these DTO files we should decide if the job is supported and if the payload matches the expected format.

**Note:** This can be defined better after implementation.

## Trade-offs

### Redis (BullMQ) vs DB-Only Queue
✅ **Chose Redis/BullMQ:**
- Much more natural way to handle queues (FIFO, priority, delayed jobs)
- Mature retry logic built-in
- Better performance for queue operations
- Horizontal scaling of queue processing
- Battle-tested in production systems

❌ **Trade-off:**
- Additional dependency (Redis required)
- More operational complexity
- Need to maintain consistency between BullMQ queue and PostgreSQL state

### Separate Monitor Service
✅ **Chose separate service:**
- Better separation of concerns in deployment
- Can scale independently
- Doesn't interfere with worker or API performance
- Clear ownership of abandoned job recovery logic

❌ **Trade-off:**
- Need extra NestJS app
- Additional deployment/orchestration complexity

### In-Worker Retry vs Re-enqueue
✅ **Chose in-worker retry with exponential backoff:**
- More efficient (no re-queue overhead)
- Precise timing control for backoff
- Reduces queue churn
- Better for transient failures (network blips, temporary service unavailability)

❌ **Trade-off:**
- Worker holds job during backoff (blocks concurrency slot)
- Lost if worker crashes during retry delay (but monitor will recover)
- More complex worker logic

### No Real-Time Cancellation for PROCESSING Jobs
✅ **Chose deferred cancellation (at completion time):**
- Easier implementation ensuring logically correct output
- No need for inter-process communication
- Simpler worker logic
- Guaranteed consistency (no partial results)

❌ **Trade-off:**
- Potentially wasteful for cases where job runs are expensive and cancellation is frequent enough
- User must wait for job to complete before cancellation takes effect

## Observability

*Note: Observability features are not fully implemented in this assignment but are critical for production deployment.*

### Implementation Strategy

**Monitor Service** handles metrics collection and exposes stats endpoints:
- Aggregates metrics from database, BullMQ, and worker instances
- Provides REST endpoints for metrics consumption by monitoring tools (Prometheus, Datadog, etc.)
- Can be polled by external monitoring systems

**Worker Service** exposes stats endpoint:
- `GET /stats` endpoint returns current worker state and metrics
- Monitor service polls worker instances to aggregate metrics
- Worker tracks: active jobs count, CPU/memory usage, processed jobs count

### Metrics to Track

**Job Metrics:**
- `job_submissions_total` (counter, labeled by class, type)
- `job_processing_duration_seconds` (histogram, labeled by class, type, status)
- `job_status_total` (counter, labeled by status, class, type)
- `job_retries_total` (counter, labeled by class, type)
- `job_failures_total` (counter, labeled by class, type, error_type)

**Queue Metrics:**
- `queue_depth` (gauge) - number of jobs waiting in BullMQ
- `queue_processing_rate` (gauge) - jobs/second being processed
- `queue_age_seconds` (histogram) - time jobs spend in queue

**Worker Metrics (exposed via Worker `/stats` endpoint):**
- `worker_active_jobs` (gauge) - jobs currently being processed by this worker
- `worker_cpu_usage` (gauge) - current CPU usage percentage
- `worker_memory_usage` (gauge) - current memory usage in MB
- `worker_uptime_seconds` (gauge) - time since worker started
- `worker_processed_jobs_total` (counter) - total jobs processed since startup

**System Metrics:**
- `abandoned_jobs_recovered_total` (counter) - abandoned jobs re-enqueued
- `database_connection_pool_size` (gauge)
- `redis_connection_errors_total` (counter)

### Monitor Service Endpoints

```
GET /metrics/jobs
Response: {
  total_submissions: number,
  pending: number,
  processing: number,
  completed: number,
  failed: number,
  cancelled: number
}

GET /metrics/queue
Response: {
  queue_depth: number,        // Total jobs in flight (waiting + active)
  queue_waiting: number,      // Jobs waiting for a worker
  queue_active: number        // Jobs currently being processed
}

GET /metrics/workers
Response: {
  workers: [
    {
      active_jobs: number,
      cpu_usage: string,       // e.g., "2.45%"
      memory_usage: string,    // e.g., "125MB"
      processed: number        // Total jobs processed
    }
  ]
}

GET /metrics/system
Response: {
  abandonedJobsRecovered: number,
  jobsDeleted: number,
  lastCleanupRun: timestamp
}

POST /debug/run_test
Response: {
  success: boolean,
  duration?: number,          // Test duration in seconds
  message?: string            // Error message if failed
}
Description: Submits 100 jobs with 5-second execution time and validates all complete within 55 seconds

POST /debug/clean/stats
Body: { confirm: boolean }
Response: {
  success: boolean,
  message: string,
  deleted?: number            // Number of keys deleted
}
Description: Clears worker stats from Redis and resets in-memory counters

POST /debug/clean/table
Body: { confirm: boolean }
Response: {
  success: boolean,
  message: string,
  deleted?: number
}
Description: Truncates the jobs table in PostgreSQL (removes all job records)

POST /debug/clean/queue
Body: { confirm: boolean }
Response: {
  success: boolean,
  message: string,
  deleted?: number            // Approximate number of jobs removed
}
Description: Clears all jobs from BullMQ queue (obliterates queue)

POST /debug/clean/all
Body: { confirm: boolean }
Response: {
  success: boolean,
  message: string,
  stats?: {
    statsDeleted: number,
    queueDeleted: number,
    tableDeleted: number
  }
}
Description: Performs full system cleanup (stats + table + queue) for testing
```

### Logging Strategy

**Structured JSON Logging:**
```json
{
  "timestamp": "2024-01-15T10:30:00Z",
  "level": "info",
  "service": "worker",
  "jobId": "uuid",
  "jobClass": "data-processing",
  "jobType": "data-export",
  "message": "Job processing started",
  "correlationId": "uuid"
}
```

**Log Job Lifecycle:**
- Job submitted (API)
- Job claimed by worker
- Job processing started
- Job retry attempt (with attempt number)
- Job completed/failed
- Job cancelled
- Abandoned job detected and re-enqueued

**Error Logging:**
- All errors with full stack traces
- Job context (id, class, type, payload)
- Retry attempt number
- Error classification (transient vs permanent)

### Alerting

**Critical Alerts:**
- Queue depth > 10,000 (backlog building up)
- Job failure rate > 10% in last 5 minutes (systemic issues)
- Worker crash/restart rate > 5/hour (infrastructure issues)
- Database connection pool exhaustion

**Warning Alerts:**
- Abandoned jobs detected (worker health degradation)
- Average job processing time increased by 50% (performance degradation)
- Worker CPU/memory > 80% for 5 minutes (scaling needed)
- Redis connection errors

**SLA Alerts:**
- P95 job completion time > threshold (by job type)
- Job submission rate dropped by 50% (potential upstream issues)

## Scalability: Supporting 100K QPS

At 100K QPS (100x current scale), the current architecture would face bottlenecks:

### Write Path Bottlenecks
1. **PostgreSQL writes** (~10K writes/sec per instance)
2. **Single API server** (CPU/network limits)
3. **BullMQ queue ingestion** (Redis write throughput)

### Proposed Architecture Changes

#### Hot Layer (Write Path)
- **Scalable API servers** (multiple instances behind load balancer)
- Process requests and push to **Kafka/Redis Streams** (not directly to BullMQ)
- Return job ID immediately (job not yet in DB)
- Kafka provides durability and high throughput (millions of events/sec)

#### Warm Layer (Ingestion)
- **Ingestion workers** consume from Kafka/Redis Streams
- **Batch write** jobs to PostgreSQL (e.g., 1000 jobs per transaction)
- **Batch enqueue** to BullMQ processing queues
- Provides write amplification: 100K requests/sec → 100 Bull writes/sec

#### Cold Layer (Processing)
- **Workers stay relatively the same** (process jobs from BullMQ)
- **Cannot access DB directly** for writes (would overwhelm DB)
- Push status updates to **Kafka/Redis Streams** (warm layer)
- Ingestion workers consume updates and batch write to PostgreSQL

#### Read Path Scaling
Current architecture also needs changes for 100K QPS reads:

1. **Database sharding** by job ID (consistent hashing)
2. **Read replicas** for PostgreSQL (route reads to replicas)
3. **Redis cache layer** for hot jobs:
   - Cache recently created/completed jobs
   - TTL = 5 minutes
   - Cache invalidation on status updates
4. **Separate servers** for read and write paths

### Summary of Changes

```
100K QPS Architecture:

Write Path:
[Clients]
  ↓
[Load Balancer]
  ↓
[API Servers (scaled)] → [Kafka/Redis Streams (write)]
  ↓
[Ingestion Workers] → [PostgreSQL (batch writes)] + [BullMQ (batch enqueue)]
  ↓
[Processing Workers] → [Kafka/Redis Streams (updates)]
  ↓
[Update Workers] → [PostgreSQL (batch updates)]

Read Path:
[Clients]
  ↓
[Load Balancer]
  ↓
[Read API Servers] → [Redis Cache] → [PostgreSQL Read Replicas]
```

**Key Principles:**
- **Batch operations** wherever possible (reduces DB load 100x)
- **Asynchronous everything** (decouple components)
- **Separate read/write paths** (different scaling characteristics)
- **Cache aggressively** (reduce DB load)
- **Partition data** (horizontal scaling via sharding)

## Future Enhancements

### Mid-Execution Job Cancellation
Requires PostgreSQL polling or more efficient cancel queue subscription on worker.

### Job Execution Heartbeat
For long-running jobs to detect abandoned ones not purely on static threshold.

### Job Progress Tracking
If such data is available and we allow writing to DB mid-execution (like with heartbeat), we could update the progress for better visibility.

### Add Statistics Function
A cron job to analyze periodical job stats (can and better be implemented via external tools though).

### Bulk Job Submission
Submit multiple jobs in a single API call for efficiency.

### Webhooks/Queue for Job Completion
For job finish notification to external systems.

### Webhooks/Queue for Errors
For job failure notification to external systems.
