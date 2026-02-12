# Monitoring & Metrics Architecture

## Overview

This document describes the monitoring and metrics architecture for the Jobs Service. The design enables scalable, real-time observability across dynamically scaled worker instances without requiring service discovery infrastructure.

## Design Principles

1. **Self-Registration**: Workers self-register via Redis keys with TTL-based health detection
2. **Zero Service Discovery**: No need to track worker IPs/ports - Redis key scanning provides automatic discovery
3. **Ephemeral Stats**: Worker-local stats in memory, aggregated via Redis, with optional DB persistence for historical trends
4. **Auto-Scaling Friendly**: New workers appear automatically, dead workers expire via TTL
5. **Minimal Overhead**: Workers push stats every 30s, monitor reads periodically for aggregation

## Architecture Components

### 1. Worker Stats Service

**Responsibility**: Collect and publish per-worker metrics

**Storage**: In-memory (local to each worker instance)

**Publishing**: Push to Redis every 30 seconds (configurable via `WORKER_STATS_PUBLISH_INTERVAL_SECONDS`)

**Metrics Collected**:
- `worker_processed_jobs_total` - Counter: Total jobs completed by this worker
- `worker_failed_jobs_total` - Counter: Total jobs failed by this worker
- `worker_active_jobs` - Gauge: Current number of jobs being processed
- `worker_memory_usage_mb` - Gauge: Heap memory usage in MB
- `worker_cpu_usage_percent` - Gauge: CPU usage percentage
- `worker_uptime_seconds` - Counter: Time since worker started

**Redis Key Pattern**:
```
worker:stats:{WORKER_TYPE}:{WORKER_ID}
```

**Example**:
```
worker:stats:general:worker-abc123
worker:stats:gpu:worker-def456
```

**TTL**: 5 minutes (300 seconds) - Auto-removes dead workers

**Data Structure**:
```json
{
  "workerId": "worker-abc123",
  "workerType": "general",
  "timestamp": "2026-02-12T10:30:00.000Z",
  "processedJobsTotal": 1523,
  "failedJobsTotal": 12,
  "activeJobs": 3,
  "memoryUsageMb": 245.7,
  "cpuUsagePercent": 42.3,
  "uptimeSeconds": 3600,
  "queues": ["jobs", "high_priority_jobs"]
}
```

**Configuration (Environment Variables)**:
```bash
# Worker identity
WORKER_TYPE=general                    # Semantic label for grouping (general, gpu, io-intensive, etc.)
WORKER_ID=worker-${HOSTNAME}-${PID}    # Auto-generated if not provided

# Stats publishing
WORKER_STATS_PUBLISH_INTERVAL_SECONDS=30  # How often to push stats to Redis

# Redis connection (shared with BullMQ)
REDIS_URL=redis://localhost:6379
```

### 2. Monitor Service

**Responsibility**: Aggregate worker stats and provide system-wide metrics

**Data Sources**:
- Redis (worker stats aggregation)
- PostgreSQL (job counts, database metrics)
- BullMQ (queue depth, processing rates)

**Endpoints**:
- `GET /metrics/workers` - Aggregated worker metrics
- `GET /metrics/jobs` - Job-level metrics
- `GET /metrics/queue` - Queue metrics
- `GET /metrics/system` - System-wide metrics

**Sampling**: Monitor reads from Redis every 30 seconds (configurable via `MONITOR_STATS_SAMPLE_INTERVAL_SECONDS`)

**Configuration (Environment Variables)**:
```bash
# Stats collection
MONITOR_STATS_SAMPLE_INTERVAL_SECONDS=30  # How often to read worker stats from Redis

# Redis connection
REDIS_URL=redis://localhost:6379
```

### 3. Metrics Aggregation

The monitor service aggregates metrics over the **last sampling period** (time between monitor reads).

#### Worker Metrics (`GET /metrics/workers`)

**Response Structure**:
```json
{
  "last_sample_period_workers_running": {
    "general": 5,
    "gpu": 2,
    "io_intensive": 3
  },
  "last_sample_period_avg_cpu_utilization": {
    "general": 38.5,
    "gpu": 92.1,
    "io_intensive": 15.3
  },
  "last_sample_period_avg_memory_utilization": {
    "general": 512.3,
    "gpu": 2048.7,
    "io_intensive": 256.1
  },
  "last_sample_period_total_jobs_in_processing": {
    "general": 45,
    "gpu": 8,
    "io_intensive": 12
  },
  "workers": [
    {
      "workerId": "worker-abc123",
      "workerType": "general",
      "timestamp": "2026-02-12T10:30:00.000Z",
      "processedJobsTotal": 1523,
      "failedJobsTotal": 12,
      "activeJobs": 3,
      "memoryUsageMb": 245.7,
      "cpuUsagePercent": 42.3,
      "uptimeSeconds": 3600,
      "queues": ["jobs", "high_priority_jobs"]
    }
  ]
}
```

**Aggregation Logic**:

```typescript
// last_sample_period_workers_running
// Count unique worker IDs per worker type from stats within last sampling period
const workersRunning = {};
workers.forEach(w => {
  workersRunning[w.workerType] = (workersRunning[w.workerType] || 0) + 1;
});

// last_sample_period_avg_cpu_utilization
// Average CPU across all workers of each type
const avgCpu = {};
workers.forEach(w => {
  if (!avgCpu[w.workerType]) avgCpu[w.workerType] = { sum: 0, count: 0 };
  avgCpu[w.workerType].sum += w.cpuUsagePercent;
  avgCpu[w.workerType].count += 1;
});
// Convert to averages
Object.keys(avgCpu).forEach(type => {
  avgCpu[type] = avgCpu[type].sum / avgCpu[type].count;
});

// last_sample_period_avg_memory_utilization
// Same logic as CPU but for memory

// last_sample_period_total_jobs_in_processing
// Sum of activeJobs across all workers of each type
const totalProcessing = {};
workers.forEach(w => {
  totalProcessing[w.workerType] = (totalProcessing[w.workerType] || 0) + w.activeJobs;
});
```

#### Queue Metrics (`GET /metrics/queue`)

**Response Structure**:
```json
{
  "last_sample_period_queue_length": {
    "jobs": 145,
    "high_priority_jobs": 3,
    "gpu_jobs": 12
  },
  "last_sample_period_queue_processing_rate": {
    "jobs": 85.3,
    "high_priority_jobs": 12.1,
    "gpu_jobs": 4.2
  }
}
```

**Data Source**: BullMQ Queue API
```typescript
// Queue length (jobs waiting + active)
const queue = new Queue('jobs', { connection: redis });
const counts = await queue.getJobCounts('waiting', 'active');
const queueLength = counts.waiting + counts.active;

// Processing rate (jobs/second over last sampling interval)
// Track completed jobs count between samples
const rate = (currentCompletedCount - previousCompletedCount) / sampleIntervalSeconds;
```

#### Job Metrics (`GET /metrics/jobs`)

**Response Structure**:
```json
{
  "job_submissions_total": 15234,
  "job_status_total": {
    "PENDING": 145,
    "PROCESSING": 65,
    "COMPLETED": 14523,
    "FAILED": 487,
    "CANCELLED": 14
  },
  "job_status_by_class": {
    "test": {
      "COMPLETED": 1234,
      "FAILED": 12
    },
    "payment": {
      "COMPLETED": 8765,
      "FAILED": 23
    }
  },
  "job_status_by_type": {
    "delay": { "COMPLETED": 1234 },
    "processPayment": { "COMPLETED": 8765 }
  }
}
```

**Data Source**: PostgreSQL queries on `jobs` table
```sql
-- Total submissions
SELECT COUNT(*) FROM jobs;

-- By status
SELECT status, COUNT(*) FROM jobs GROUP BY status;

-- By class and status
SELECT class, status, COUNT(*) FROM jobs GROUP BY class, status;

-- By type and status
SELECT type, status, COUNT(*) FROM jobs GROUP BY type, status;
```

#### System Metrics (`GET /metrics/system`)

**Response Structure**:
```json
{
  "abandoned_jobs_recovered_total": 47,
  "jobs_deleted_total": 1523,
  "database_connection_pool_size": 10,
  "database_active_connections": 3,
  "redis_connection_status": "connected",
  "redis_used_memory_mb": 124.5
}
```

## Worker Types & Queue Mapping

### Problem Statement

The current implementation has a single worker type that processes all jobs from one queue. We need to support:
- **Different resource requirements**: CPU-intensive vs GPU vs I/O-bound jobs
- **Priority-based processing**: High-priority vs low-priority jobs
- **Workload isolation**: Critical jobs shouldn't be blocked by bulk operations
- **Cost optimization**: Run GPU workers only when needed, scale general workers independently

### Proposed Architecture

**Flexible Worker-to-Queue Mapping via Environment Variables**

Each worker instance is configured with:
1. `WORKER_TYPE` - Semantic label for monitoring/grouping (e.g., "general", "gpu", "io_intensive")
2. `WORKER_QUEUES` - Comma-separated list of BullMQ queues this worker listens to

**Benefits**:
- Same Docker image, different deployment configurations
- Maximum flexibility for Kubernetes/container orchestration
- Workers can listen to multiple queues (e.g., general worker handles both normal and high-priority jobs)
- Easy to add new worker types without code changes

### Configuration Examples

#### Example 1: General Worker (Multi-Queue)
```bash
# Handles both normal and high-priority jobs
WORKER_TYPE=general
WORKER_QUEUES=jobs,high_priority_jobs
WORKER_CONCURRENCY=10
```

#### Example 2: GPU Worker (Single Queue)
```bash
# Dedicated GPU worker for ML inference
WORKER_TYPE=gpu
WORKER_QUEUES=gpu_jobs
WORKER_CONCURRENCY=2  # Limited by GPU availability
```

#### Example 3: I/O Intensive Worker
```bash
# High concurrency for I/O-bound tasks
WORKER_TYPE=io_intensive
WORKER_QUEUES=io_jobs
WORKER_CONCURRENCY=50
```

#### Example 4: Priority-Based Workers
```bash
# High-priority worker (dedicated resources)
WORKER_TYPE=high_priority
WORKER_QUEUES=high_priority_jobs
WORKER_CONCURRENCY=5

# Low-priority worker (shared resources)
WORKER_TYPE=low_priority
WORKER_QUEUES=low_priority_jobs
WORKER_CONCURRENCY=20
```

### Job-to-Queue Routing

**Phase 1 (Current)**: Single queue `jobs`
- All jobs go to the `jobs` queue
- Simple, no routing logic needed

**Phase 2 (Future Enhancement)**: Explicit queue in submission
```typescript
POST /jobs
{
  "class": "payment",
  "type": "processPayment",
  "queue": "high_priority_jobs",  // Explicit queue selection
  "payload": { ... }
}
```

**Phase 3 (Future Enhancement)**: Class-based routing configuration
```typescript
// config/job-routing.config.ts
export const jobRouting = {
  'payment.processPayment': 'high_priority_jobs',
  'ml.runInference': 'gpu_jobs',
  'etl.extractData': 'io_jobs',
  'default': 'jobs'
};
```

**Phase 4 (Future Enhancement)**: Priority-based automatic routing
```typescript
POST /jobs
{
  "class": "payment",
  "type": "processPayment",
  "priority": "high",  // Auto-routes to high_priority_jobs
  "payload": { ... }
}
```

### Mapping Table (Phase 2+)

| Job Class | Job Type | Queue | Worker Type | Resource Profile |
|-----------|----------|-------|-------------|------------------|
| `test` | `delay` | `jobs` | `general` | Low CPU, low memory |
| `payment` | `processPayment` | `high_priority_jobs` | `general` | Low CPU, high priority |
| `ml` | `runInference` | `gpu_jobs` | `gpu` | GPU required |
| `etl` | `extractData` | `io_jobs` | `io_intensive` | High I/O, high concurrency |
| `analytics` | `generateReport` | `low_priority_jobs` | `general` | CPU intensive, low priority |

### Implementation Strategy

**Best Practice Recommendation**: **Flexible ENV-based configuration (Option C)**

**Rationale**:
1. **Same codebase, different deployments**: One Docker image can be deployed as different worker types
2. **Kubernetes-native**: Align with K8s best practices of configuring pods via ENV vars
3. **Easy scaling**: Scale each worker type independently based on workload
4. **No service discovery needed**: Workers self-register via Redis with their type and queues
5. **Future-proof**: Easy to add new worker types without code changes

**Implementation**:
```typescript
// Worker startup (apps/worker/main.ts)
const workerType = process.env.WORKER_TYPE || 'general';
const workerQueues = (process.env.WORKER_QUEUES || 'jobs').split(',');
const concurrency = parseInt(process.env.WORKER_CONCURRENCY, 10) || 10;

// Register processors for each queue
workerQueues.forEach(queueName => {
  const worker = new Worker(
    queueName,
    async (job) => await processJob(job),
    { connection: redis, concurrency }
  );
});

// Publish stats with worker type and queues
await redis.setex(
  `worker:stats:${workerType}:${workerId}`,
  300,
  JSON.stringify({
    workerType,
    workerId,
    queues: workerQueues,
    // ... other stats
  })
);
```

## Data Flow

### Worker Stats Publishing Flow

```
┌─────────────────────────────────────────┐
│ WORKER INSTANCE                          │
├─────────────────────────────────────────┤
│                                          │
│ 1. Process jobs → Update counters       │
│    - Increment processedJobsTotal        │
│    - Track activeJobs (gauge)            │
│                                          │
│ 2. Sample resource usage (every 10s)    │
│    - Memory: process.memoryUsage()      │
│    - CPU: process.cpuUsage()            │
│                                          │
│ 3. Publish to Redis (every 30s)         │
│    - Key: worker:stats:{type}:{id}      │
│    - TTL: 300 seconds                    │
│                                          │
└─────────────────────────────────────────┘
                    │
                    │ SETEX worker:stats:general:w1 300 {...}
                    ▼
┌─────────────────────────────────────────┐
│ REDIS                                    │
├─────────────────────────────────────────┤
│                                          │
│ worker:stats:general:w1 → {stats}       │
│ worker:stats:general:w2 → {stats}       │
│ worker:stats:gpu:w3 → {stats}           │
│                                          │
│ (TTL: 300s - auto-expires dead workers) │
│                                          │
└─────────────────────────────────────────┘
                    │
                    │ KEYS worker:stats:* → MGET
                    ▼
┌─────────────────────────────────────────┐
│ MONITOR SERVICE                          │
├─────────────────────────────────────────┤
│                                          │
│ 1. Sample Redis (every 30s)             │
│    - Scan: worker:stats:*               │
│    - Read all active worker stats        │
│                                          │
│ 2. Aggregate by worker type             │
│    - Count workers                       │
│    - Average CPU/memory                  │
│    - Sum active jobs                     │
│                                          │
│ 3. Query database & BullMQ              │
│    - Job counts by status                │
│    - Queue depths                        │
│                                          │
│ 4. Expose via REST endpoints            │
│    - GET /metrics/workers                │
│    - GET /metrics/jobs                   │
│    - GET /metrics/queue                  │
│    - GET /metrics/system                 │
│                                          │
└─────────────────────────────────────────┘
```

## REST Endpoints

### Worker Service (Port 3001)

#### `GET /stats`
Returns current stats for this specific worker instance.

**Use Case**: Direct debugging, health checks

**Response**:
```json
{
  "worker_active_jobs": 3,
  "worker_cpu_usage": 42.3,
  "worker_memory_usage": 245.7,
  "worker_uptime_seconds": 3600,
  "worker_processed_jobs_total": 1523
}
```

#### `GET /health`
Health check endpoint.

**Response**:
```json
{
  "status": "ok",
  "timestamp": "2026-02-12T10:30:00.000Z",
  "uptime": 3600
}
```

### Monitor Service (Port 3002)

#### `GET /metrics/workers`
Aggregated metrics across all active workers.

**Query Parameters**: None

**Response**: See "Worker Metrics" section above

#### `GET /metrics/jobs`
Job-level metrics from database.

**Query Parameters**: None

**Response**: See "Job Metrics" section above

#### `GET /metrics/queue`
Queue metrics from BullMQ.

**Query Parameters**: None

**Response**: See "Queue Metrics" section above

#### `GET /metrics/system`
System-wide metrics.

**Query Parameters**: None

**Response**: See "System Metrics" section above

#### `GET /health`
Health check endpoint.

**Response**:
```json
{
  "status": "ok",
  "timestamp": "2026-02-12T10:30:00.000Z",
  "uptime": 3600
}
```

## Implementation Checklist

### Phase 1: Worker Stats Collection (Current Priority)
- [ ] Implement CPU usage calculation in WorkerStatsService
- [ ] Implement active jobs tracking in WorkerStatsService
- [ ] Connect JobsProcessor to WorkerStatsService (increment counters on job events)
- [ ] Add Redis client to WorkerStatsService for stats publishing
- [ ] Implement periodic stats publishing (every 30s) with Redis SETEX
- [ ] Add environment variables: `WORKER_TYPE`, `WORKER_ID`, `WORKER_STATS_PUBLISH_INTERVAL_SECONDS`
- [ ] Test worker stats endpoint: `GET /stats`

### Phase 2: Monitor Stats Aggregation
- [ ] Add Redis client to MonitorService for stats reading
- [ ] Implement periodic Redis scanning (every 30s) to read worker stats
- [ ] Implement aggregation logic for worker metrics by type
- [ ] Implement `GET /metrics/workers` endpoint with aggregated data
- [ ] Implement `GET /metrics/jobs` with PostgreSQL queries
- [ ] Implement `GET /metrics/queue` with BullMQ API calls
- [ ] Complete `GET /metrics/system` with database/Redis metrics
- [ ] Add environment variables: `MONITOR_STATS_SAMPLE_INTERVAL_SECONDS`

### Phase 3: Multi-Queue Worker Support (Future Enhancement)
- [ ] Add `WORKER_QUEUES` environment variable support
- [ ] Refactor JobsProcessor to support multiple queue registration
- [ ] Update worker stats to include `queues` field
- [ ] Add queue-based job routing in API service
- [ ] Document queue naming conventions
- [ ] Add tests for multi-queue scenarios

### Phase 4: Historical Metrics (Future Enhancement)
- [ ] Create `metrics_snapshots` table in PostgreSQL
- [ ] Implement periodic metrics persistence (every 5 minutes)
- [ ] Add time-series queries for historical trends
- [ ] Add retention policy (TTL for old metrics)
- [ ] Integrate with Grafana/Prometheus (optional)

## Testing Strategy

### Unit Tests
- Worker stats calculation (CPU, memory, counters)
- Redis key pattern generation
- Aggregation logic (average, sum, count)

### Integration Tests
- Worker publishes stats to Redis
- Monitor reads and aggregates worker stats
- TTL expiry removes dead workers
- Multiple worker types aggregate correctly

### Load Tests
- 2000 QPS job submission
- Monitor performance with 100+ active workers
- Redis memory usage under high worker count
- Metrics endpoint response times

## Future Enhancements

See [TODO.md](TODO.md) for detailed roadmap. Key items:

**Priority 1: Monitoring (Next)**
- 1.1: Prometheus/Grafana integration
- 1.2: Alerting for abandoned jobs, high failure rates, queue depth
- 1.3: Distributed tracing (OpenTelemetry)

**Priority 6.3: Multi-Queue Workers**
- Support for worker types (general, GPU, I/O-intensive)
- Queue-based job routing
- Priority queues
- Resource-based worker selection

## Configuration Reference

### Environment Variables

#### Worker Service
```bash
# Worker Identity
WORKER_TYPE=general                           # Worker type for grouping (general, gpu, io_intensive)
WORKER_ID=worker-${HOSTNAME}-${PID}          # Auto-generated if not provided
WORKER_QUEUES=jobs                           # Comma-separated queue names (future)

# Worker Concurrency
WORKER_CONCURRENCY=10                        # Number of concurrent jobs

# Stats Publishing
WORKER_STATS_PUBLISH_INTERVAL_SECONDS=30     # How often to push stats to Redis
WORKER_STATS_PORT=3001                       # HTTP port for /stats endpoint

# Redis (shared with BullMQ)
REDIS_URL=redis://localhost:6379
```

#### Monitor Service
```bash
# Stats Collection
MONITOR_STATS_SAMPLE_INTERVAL_SECONDS=30     # How often to read worker stats from Redis
MONITOR_PORT=3002                            # HTTP port for metrics endpoints

# Cron Schedules
MONITOR_CRON_SCHEDULE=* * * * *              # Abandoned job recovery (every 1 min default)
CLEANUP_CRON_SCHEDULE=0 2 * * *              # TTL cleanup (daily at 2 AM)

# Job Timeouts
JOB_TIMEOUT_MINUTES=5                        # When to consider job abandoned
MAX_QUEUE_WAIT_MINUTES=30                    # Max time in PENDING before abandoned

# Redis (shared with BullMQ)
REDIS_URL=redis://localhost:6379

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/jobs
```

## Performance Considerations

### Redis Memory Usage

**Per Worker**:
- Stats payload: ~500 bytes (JSON)
- Key overhead: ~100 bytes
- **Total per worker: ~600 bytes**

**At Scale**:
- 100 workers: ~60 KB
- 1,000 workers: ~600 KB
- 10,000 workers: ~6 MB

**Conclusion**: Redis memory usage is negligible even at very large scale.

### Monitor Query Performance

**Redis KEYS + MGET**:
- KEYS pattern matching: O(N) where N = total keys in Redis
- MGET: O(N) where N = number of worker keys
- **Optimization**: Use SCAN instead of KEYS for large Redis instances

**Recommended**:
```typescript
// Instead of KEYS (blocks Redis)
const keys = await redis.keys('worker:stats:*');

// Use SCAN (non-blocking)
const keys = [];
let cursor = '0';
do {
  const [newCursor, scannedKeys] = await redis.scan(
    cursor,
    'MATCH', 'worker:stats:*',
    'COUNT', 100
  );
  keys.push(...scannedKeys);
  cursor = newCursor;
} while (cursor !== '0');
```

### Database Query Performance

**Job Metrics Queries**:
- Ensure indexes on: `status`, `class`, `type`, `createdAt`
- Use materialized views for heavy aggregations (future)
- Cache results in Redis with 30s TTL (future)

**Recommended Indexes**:
```sql
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_class ON jobs(class);
CREATE INDEX idx_jobs_type ON jobs(type);
CREATE INDEX idx_jobs_created_at ON jobs(createdAt);
CREATE INDEX idx_jobs_status_class ON jobs(status, class);
```

## Monitoring the Monitor

**Health Checks**:
- Monitor service exposes `/health` endpoint
- Check Redis connectivity
- Check database connectivity
- Track last successful stats collection timestamp

**Alerting**:
- Alert if no worker stats in Redis for > 5 minutes
- Alert if abandoned jobs count grows rapidly
- Alert if queue depth exceeds threshold
- Alert if worker failure rate > 5%

## References

- [BullMQ Documentation](https://docs.bullmq.io/)
- [Redis Commands](https://redis.io/commands/)
- [NestJS Metrics](https://docs.nestjs.com/techniques/performance)
- [Prometheus Best Practices](https://prometheus.io/docs/practices/naming/)
