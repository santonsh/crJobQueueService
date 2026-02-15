# Monitoring & Metrics Architecture

## Overview

This document describes the monitoring and metrics architecture for the Jobs Service. The design enables scalable, real-time observability across dynamically scaled worker instances without requiring service discovery infrastructure.

The system includes:
- **Worker Stats Service**: Per-worker metrics collection and publishing
- **Monitor Service**: Aggregates metrics from all workers and provides REST API
- **MonitorUI**: Vue.js web dashboard for real-time visualization

## Design Principles

1. **Self-Registration**: Workers self-register via Redis keys with TTL-based health detection
2. **Zero Service Discovery**: No need to track worker IPs/ports - Redis key scanning provides automatic discovery
3. **Ephemeral Stats**: Worker-local stats in memory, aggregated via Redis, with optional DB persistence for historical trends
4. **Auto-Scaling Friendly**: New workers appear automatically, dead workers expire via TTL
5. **Minimal Overhead**: Workers push stats every 5s, monitor aggregates on-demand via REST API
6. **Environment-Aware**: Local dev exposes worker stats endpoint (port 3001), Docker workers publish to Redis only

## Architecture Components

### 1. Worker Stats Service

**Responsibility**: Collect and publish per-worker metrics

**Storage**: In-memory (local to each worker instance)

**Publishing**: Push to Redis every 5 seconds (configurable via `WORKER_STATS_REPORTING_PERIOD_SECONDS`)

**Metrics Collected**:
- `worker_processed_jobs_total` - Counter: Total jobs completed by this worker
- `worker_failed_jobs_total` - Counter: Total jobs failed by this worker
- `worker_active_jobs` - Gauge: Current number of jobs being processed
- `worker_memory_usage` - Gauge: Heap memory usage in MB
- `worker_cpu_usage` - Gauge: CPU usage percentage
- `worker_uptime_seconds` - Counter: Time since worker started
- `worker_db_pool_total` - Gauge: Total database connections in pool
- `worker_db_pool_idle` - Gauge: Idle database connections
- `worker_db_pool_waiting` - Gauge: Queries waiting for a connection
- `worker_db_pool_max` - Gauge: Maximum pool size
- `worker_db_pool_usage_percent` - Gauge: Pool utilization percentage

**Redis Key Pattern**:
```
worker:stats:{WORKER_TYPE}:{WORKER_ID}
```

**Example**:
```
worker:stats:general:worker-abc123
worker:stats:gpu:worker-def456
```

**TTL**: 300 seconds (5 minutes) - Auto-removes dead workers

**Data Structure**:
```json
{
  "workerId": "worker-abc123",
  "workerType": "general",
  "timestamp": "2026-02-15T10:30:00.000Z",
  "processedJobsTotal": 1523,
  "failedJobsTotal": 12,
  "activeJobs": 3,
  "memoryUsageMb": 245.7,
  "cpuUsagePercent": 42.3,
  "uptimeSeconds": 3600,
  "dbPoolTotal": 15,
  "dbPoolIdle": 10,
  "dbPoolWaiting": 0,
  "dbPoolMax": 20,
  "dbPoolUsagePercent": 75
}
```

**Configuration (Environment Variables)**:
```bash
# Worker identity
WORKER_TYPE=general                              # Semantic label for grouping
WORKER_ID=worker-${HOSTNAME}-${PID}              # Auto-generated if not provided

# Stats publishing
WORKER_STATS_REPORTING_PERIOD_SECONDS=5          # How often to push stats to Redis
WORKER_STATS_REDIS_TTL_SECONDS=300               # TTL for Redis keys (5 minutes)
WORKER_STATS_PORT=3001                           # HTTP port for /stats endpoint (local only)

# Redis connection (shared with BullMQ)
REDIS_URL=redis://localhost:6379
```

**Local vs Docker Behavior**:
- **Local development**: Worker exposes HTTP endpoint on port 3001 (`GET /stats`)
- **Docker environments**: Worker stats endpoint not exposed, stats published to Redis only

### 2. Monitor Service

**Responsibility**: Aggregate worker stats and provide system-wide metrics

**Data Sources**:
- Redis (worker stats aggregation)
- PostgreSQL (job counts, database metrics)
- BullMQ (queue depth, processing rates)

**Endpoints**:
- `GET /health` - Health check
- `GET /metrics/workers` - Aggregated worker metrics
- `GET /metrics/jobs` - Job-level metrics
- `GET /metrics/queue` - Queue metrics
- `GET /metrics/system` - System-wide metrics

**Sampling**: Monitor reads from Redis on-demand when `/metrics/workers` is called

**Configuration (Environment Variables)**:
```bash
# Monitor service
MONITOR_PORT=3002                                     # HTTP port for metrics endpoints
MONITOR_WORKER_STATS_QUERY_PERIOD_SECONDS=10          # Cache TTL for worker stats

# Cron schedules
MONITOR_CRON_SCHEDULE=*/2 * * * *                     # Abandoned job recovery (every 2 min)

# Job timeouts
JOB_TIMEOUT_MINUTES=5                                 # When to consider job abandoned
MAX_QUEUE_WAIT_MINUTES=30                             # Max time in PENDING before abandoned

# TTL cleanup
JOB_TTL_DAYS_COMPLETED=7                              # Delete completed jobs after 7 days
JOB_TTL_DAYS_FAILED=30                                # Delete failed jobs after 30 days
JOB_TTL_DAYS_CANCELLED=7                              # Delete cancelled jobs after 7 days

# Redis connection
REDIS_URL=redis://localhost:6379

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/jobs
DB_POOL_MAX=3                                         # Monitor uses small pool
DB_POOL_MIN=1
```

### 3. MonitorUI (Web Dashboard)

**Technology**: Vue 3 + Vuetify 3

**Port**: 8081 (development)

**Features**:
- **Real-time metrics**: Auto-refresh every 5 seconds
- **Job Metrics**: Total submissions, status breakdown (PENDING, PROCESSING, COMPLETED, FAILED, CANCELLED)
- **Queue Metrics**: Depth, waiting, active, failed counts
- **Worker Metrics**: Running workers, CPU/memory utilization, active jobs, connection pool stats
- **System Metrics**: Abandoned jobs recovered, TTL cleanup stats

**Access**: `http://localhost:8081`

**Starting MonitorUI**:
```bash
cd monitorUI
npm install  # First time only
npm run dev
```

**Configuration**:
MonitorUI reads from Monitor service at `http://localhost:3002` by default. To point to different environment:
```javascript
// monitorUI/src/config.js
const MONITOR_URL = process.env.MONITOR_URL || 'http://localhost:3002';
```

**Dashboard Layout**:
1. **Job Metrics** (full width, 6 columns)
   - Total Submissions
   - PENDING
   - PROCESSING
   - COMPLETED
   - FAILED
   - CANCELLED

2. **Queue Metrics** (full width, 4 columns)
   - Queue Depth (In Flight)
   - Waiting
   - Active (Processing)
   - Failed

3. **Worker Metrics** (half width)
   - Workers Running (by type)
   - Avg CPU Utilization
   - Avg Memory Utilization
   - Total Jobs in Processing
   - Avg DB Pool Usage
   - Individual worker details

4. **System Metrics** (half width)
   - Abandoned Jobs Recovered
   - Jobs TTL Cleaned (retention cleanup)

## Metrics Aggregation

### Worker Metrics (`GET /metrics/workers`)

**Response Structure**:
```json
{
  "last_sample_period_workers_running": {
    "general": 5
  },
  "last_sample_period_avg_cpu_utilization": {
    "general": 38.5
  },
  "last_sample_period_avg_memory_utilization": {
    "general": 512.3
  },
  "last_sample_period_total_jobs_in_processing": {
    "general": 45
  },
  "last_sample_period_avg_db_pool_usage": {
    "general": 65.2
  },
  "workers": [
    {
      "workerId": "worker-abc123",
      "workerType": "general",
      "timestamp": "2026-02-15T10:30:00.000Z",
      "processedJobsTotal": 1523,
      "failedJobsTotal": 12,
      "activeJobs": 3,
      "memoryUsageMb": 245.7,
      "cpuUsagePercent": 42.3,
      "uptimeSeconds": 3600,
      "dbPoolTotal": 15,
      "dbPoolIdle": 10,
      "dbPoolWaiting": 0,
      "dbPoolMax": 20,
      "dbPoolUsagePercent": 75
    }
  ]
}
```

**Aggregation Logic**:

```typescript
// last_sample_period_workers_running
// Count unique worker IDs per worker type
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

// last_sample_period_avg_db_pool_usage
// Average database pool usage across all workers
const avgPoolUsage = {};
workers.forEach(w => {
  if (!avgPoolUsage[w.workerType]) avgPoolUsage[w.workerType] = { sum: 0, count: 0 };
  avgPoolUsage[w.workerType].sum += w.dbPoolUsagePercent || 0;
  avgPoolUsage[w.workerType].count += 1;
});
Object.keys(avgPoolUsage).forEach(type => {
  avgPoolUsage[type] = avgPoolUsage[type].sum / avgPoolUsage[type].count;
});
```

### Queue Metrics (`GET /metrics/queue`)

**Response Structure**:
```json
{
  "queue_depth": 145,
  "queue_waiting": 80,
  "queue_active": 65,
  "queue_failed": 12
}
```

**Data Source**: BullMQ Queue API
```typescript
const counts = await queue.getJobCounts('waiting', 'active', 'failed');

return {
  queue_depth: counts.waiting + counts.active,  // Total jobs in flight
  queue_waiting: counts.waiting,                 // Jobs waiting for a worker
  queue_active: counts.active,                   // Jobs currently being processed
  queue_failed: counts.failed,                   // Jobs in failed queue
};
```

**Notes**:
- `queue_depth`: Total jobs in flight (waiting + active)
- `queue_waiting`: Jobs in queue, not yet picked up by a worker
- `queue_active`: Jobs currently being processed (still in BullMQ until completion)
- `queue_failed`: Jobs in BullMQ failed queue (transient errors retried, permanent errors reconciled)

### Job Metrics (`GET /metrics/jobs`)

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

### System Metrics (`GET /metrics/system`)

**Response Structure**:
```json
{
  "abandoned_jobs_recovered_total": 47,
  "jobs_deleted_total": 1523
}
```

**Notes**:
- `abandoned_jobs_recovered_total`: Jobs recovered by monitor cron (PROCESSING/PENDING timeout recovery + failed queue transient error retries)
- `jobs_deleted_total`: Jobs cleaned up by TTL policy (renamed from "jobs_deleted" to "Jobs TTL Cleaned" in UI)

## Data Flow

### Worker Stats Publishing Flow

```
┌─────────────────────────────────────────┐
│ WORKER INSTANCE                          │
├─────────────────────────────────────────┤
│                                          │
│ 1. Process jobs → Update counters       │
│    - Increment processedJobsTotal        │
│    - Increment failedJobsTotal           │
│    - Track activeJobs (gauge)            │
│                                          │
│ 2. Sample resource usage (on publish)   │
│    - Memory: process.memoryUsage()      │
│    - CPU: process.cpuUsage()            │
│    - DB Pool: dataSource.driver.master  │
│                                          │
│ 3. Publish to Redis (every 5s)          │
│    - Key: worker:stats:{type}:{id}      │
│    - TTL: 300 seconds                    │
│                                          │
│ 4. Expose /stats endpoint (local only)  │
│    - Port 3001 in local dev             │
│    - Not exposed in Docker              │
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
│ worker:stats:general:w3 → {stats}       │
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
│ 1. On-demand Redis read                 │
│    - Scan: worker:stats:*               │
│    - Read all active worker stats        │
│    - Cache for 10s (configurable)        │
│                                          │
│ 2. Aggregate by worker type             │
│    - Count workers                       │
│    - Average CPU/memory/pool usage       │
│    - Sum active jobs                     │
│                                          │
│ 3. Query database & BullMQ              │
│    - Job counts by status                │
│    - Queue depths (waiting/active/failed)│
│                                          │
│ 4. Expose via REST endpoints            │
│    - GET /metrics/workers                │
│    - GET /metrics/jobs                   │
│    - GET /metrics/queue                  │
│    - GET /metrics/system                 │
│                                          │
└─────────────────────────────────────────┘
                    │
                    │ HTTP GET /metrics/*
                    ▼
┌─────────────────────────────────────────┐
│ MONITORUI (Vue.js Dashboard)            │
├─────────────────────────────────────────┤
│                                          │
│ 1. Auto-refresh every 5 seconds         │
│    - Fetch all metrics endpoints         │
│                                          │
│ 2. Display real-time metrics            │
│    - Job Metrics (6 columns)            │
│    - Queue Metrics (4 columns)          │
│    - Worker Metrics (aggregated)        │
│    - System Metrics                      │
│                                          │
│ 3. Visual indicators                     │
│    - Color-coded status counts           │
│    - Progress bars for pool usage        │
│    - Real-time timestamp                 │
│                                          │
└─────────────────────────────────────────┘
```

## REST Endpoints

### Worker Service (Port 3001) - Local Development Only

#### `GET /stats`
Returns current stats for this specific worker instance.

**Use Case**: Direct debugging, health checks in local development

**Availability**:
- ✅ Local environment (port 3001)
- ❌ Docker environments (not exposed)

**Response**:
```json
{
  "workerId": "worker-local-12345",
  "workerType": "general",
  "worker_active_jobs": 3,
  "worker_cpu_usage": 42.3,
  "worker_memory_usage": 245,
  "worker_uptime_seconds": 3600,
  "worker_processed_jobs_total": 1523,
  "worker_failed_jobs_total": 12,
  "worker_db_pool_total": 15,
  "worker_db_pool_idle": 10,
  "worker_db_pool_waiting": 0,
  "worker_db_pool_max": 20,
  "worker_db_pool_usage_percent": 75
}
```

#### `GET /health`
Health check endpoint.

**Response**:
```json
{
  "status": "ok",
  "timestamp": "2026-02-15T10:30:00.000Z",
  "uptime": 3600
}
```

### Monitor Service (Port 3002)

#### `GET /metrics/workers`
Aggregated metrics across all active workers.

**Query Parameters**: None

**Response**: See "Worker Metrics" section above

**Caching**: Results cached for 10 seconds (configurable via `MONITOR_WORKER_STATS_QUERY_PERIOD_SECONDS`)

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
  "timestamp": "2026-02-15T10:30:00.000Z",
  "uptime": 3600
}
```

## Implementation Status

### ✅ Phase 1: Worker Stats Collection - COMPLETE
- ✅ CPU usage calculation in WorkerStatsService
- ✅ Active jobs tracking in WorkerStatsService
- ✅ JobsProcessor connected to WorkerStatsService (increment counters on job events)
- ✅ Redis client in WorkerStatsService for stats publishing
- ✅ Periodic stats publishing (every 5s) with Redis SETEX
- ✅ Environment variables: `WORKER_TYPE`, `WORKER_ID`, `WORKER_STATS_REPORTING_PERIOD_SECONDS`, `WORKER_STATS_REDIS_TTL_SECONDS`
- ✅ Worker stats endpoint: `GET /stats` (local only)
- ✅ Database connection pool metrics tracking

### ✅ Phase 2: Monitor Stats Aggregation - COMPLETE
- ✅ Redis client in MonitorService for stats reading
- ✅ On-demand Redis scanning to read worker stats
- ✅ Aggregation logic for worker metrics by type
- ✅ `GET /metrics/workers` endpoint with aggregated data
- ✅ `GET /metrics/jobs` with PostgreSQL queries
- ✅ `GET /metrics/queue` with BullMQ API calls
- ✅ `GET /metrics/system` with abandoned jobs and TTL cleanup counters
- ✅ Environment variables: `MONITOR_WORKER_STATS_QUERY_PERIOD_SECONDS`
- ✅ Database pool usage aggregation

### ✅ Phase 2.5: MonitorUI Dashboard - COMPLETE
- ✅ Vue 3 + Vuetify 3 web application
- ✅ Real-time metrics display with 5-second auto-refresh
- ✅ Job Metrics visualization (full width, 6 status columns)
- ✅ Queue Metrics visualization (full width, 4 metric columns including Failed)
- ✅ Worker Metrics visualization with aggregated stats
- ✅ System Metrics visualization
- ✅ Responsive layout for different screen sizes
- ✅ Color-coded status indicators (success/warning/error)

### 📋 Phase 3: Multi-Queue Worker Support (Future Enhancement)
- [ ] Add `WORKER_QUEUES` environment variable support
- [ ] Refactor JobsProcessor to support multiple queue registration
- [ ] Update worker stats to include `queues` field
- [ ] Add queue-based job routing in API service
- [ ] Document queue naming conventions
- [ ] Add tests for multi-queue scenarios

### 📋 Phase 4: Historical Metrics (Future Enhancement)
- [ ] Create `metrics_snapshots` table in PostgreSQL
- [ ] Implement periodic metrics persistence (every 5 minutes)
- [ ] Add time-series queries for historical trends
- [ ] Add retention policy (TTL for old metrics)
- [ ] Integrate with Grafana/Prometheus (optional)

## Testing Strategy

### Unit Tests
- ✅ Worker stats calculation (CPU, memory, counters)
- ✅ Redis key pattern generation
- ✅ Aggregation logic (average, sum, count)

### Integration Tests
- ✅ Worker publishes stats to Redis (test-09-monitoring-stats.sh)
- ✅ Monitor reads and aggregates worker stats
- ✅ TTL expiry removes dead workers
- ✅ Queue metrics accuracy (depth, waiting, active, failed)
- ✅ Environment-aware testing (local/full/loadbalanced)

### Load Tests
- ✅ 2000 QPS job submission (load-test-2k-qps.js)
- ✅ Monitor performance with 5+ active workers
- ✅ Redis memory usage under high worker count
- ✅ Metrics endpoint response times

## Performance Considerations

### Redis Memory Usage

**Per Worker**:
- Stats payload: ~600 bytes (JSON with pool metrics)
- Key overhead: ~100 bytes
- **Total per worker: ~700 bytes**

**At Scale**:
- 100 workers: ~70 KB
- 1,000 workers: ~700 KB
- 10,000 workers: ~7 MB

**Conclusion**: Redis memory usage is negligible even at very large scale.

### Monitor Query Performance

**Redis KEYS + MGET**:
- Current implementation uses KEYS pattern matching: O(N) where N = total keys in Redis
- MGET: O(N) where N = number of worker keys
- **Optimization for future**: Use SCAN instead of KEYS for large Redis instances (10,000+ workers)

**Recommended for large scale**:
```typescript
// Current (works well for < 1000 workers)
const keys = await redis.keys('worker:stats:*');

// Future optimization (use SCAN for 10,000+ workers)
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
- Uses indexes on: `status` (existing)
- Group by queries are fast for current scale (< 1M jobs)
- Monitor uses small connection pool (max 3 connections)

**Connection Pool Monitoring**:
- Workers report pool usage in stats
- High pool usage (> 80%) logged as warnings
- Monitor aggregates average pool usage across workers
- Helps identify connection pool exhaustion before it causes failures

### MonitorUI Performance

**Auto-Refresh Strategy**:
- 5-second refresh interval matches worker publishing frequency
- Parallel API calls to all metrics endpoints
- Minimal DOM updates (Vue 3 reactivity)
- No data persistence (ephemeral dashboard)

**Network Efficiency**:
- Gzip compression on API responses
- Small payload sizes (< 10 KB per endpoint)
- Local caching in browser (5s TTL)

## Environment-Specific Behavior

### Local Development
- **Worker stats endpoint**: ✅ Available on port 3001
- **Stats publishing**: ✅ To Redis every 5s
- **MonitorUI**: ✅ Full access to all metrics
- **Best for**: Development, debugging, worker-level diagnostics

### Docker Environments (Full Stack / Load-Balanced)
- **Worker stats endpoint**: ❌ Not exposed (workers in containers)
- **Stats publishing**: ✅ To Redis every 5s
- **MonitorUI**: ✅ Full access via Monitor service aggregation
- **Best for**: Integration testing, load testing, production simulation

## Configuration Reference

### Environment Variables

#### Worker Service
```bash
# Worker Identity
WORKER_TYPE=general                                   # Worker type for grouping
WORKER_ID=worker-${HOSTNAME}-${PID}                  # Auto-generated if not provided

# Worker Concurrency
WORKER_CONCURRENCY=10                                # Number of concurrent jobs

# Stats Publishing
WORKER_STATS_REPORTING_PERIOD_SECONDS=5              # How often to push stats to Redis
WORKER_STATS_REDIS_TTL_SECONDS=300                   # TTL for Redis keys (5 minutes)
WORKER_STATS_PORT=3001                               # HTTP port for /stats endpoint (local only)

# Database Connection Pool
DB_POOL_MAX=20                                       # Maximum pool size
DB_POOL_MIN=5                                        # Minimum pool size

# Redis (shared with BullMQ)
REDIS_URL=redis://localhost:6379
```

#### Monitor Service
```bash
# Monitor service
MONITOR_PORT=3002                                    # HTTP port for metrics endpoints
MONITOR_WORKER_STATS_QUERY_PERIOD_SECONDS=10         # Cache TTL for worker stats

# Cron Schedules
MONITOR_CRON_SCHEDULE=*/2 * * * *                    # Abandoned job recovery (every 2 min)

# Job Timeouts
JOB_TIMEOUT_MINUTES=5                                # When to consider job abandoned
MAX_QUEUE_WAIT_MINUTES=30                            # Max time in PENDING before abandoned

# TTL Cleanup
JOB_TTL_DAYS_COMPLETED=7                             # Delete completed jobs after 7 days
JOB_TTL_DAYS_FAILED=30                               # Delete failed jobs after 30 days
JOB_TTL_DAYS_CANCELLED=7                             # Delete cancelled jobs after 7 days

# Database Connection Pool
DB_POOL_MAX=3                                        # Monitor uses small pool
DB_POOL_MIN=1

# Redis (shared with BullMQ)
REDIS_URL=redis://localhost:6379

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/jobs
```

#### MonitorUI
```bash
# Development server
PORT=8081                                            # Web server port

# API endpoint
VITE_MONITOR_URL=http://localhost:3002               # Monitor service URL
```

## Monitoring Best Practices

### Health Checks

**Monitor Service**:
- Exposes `/health` endpoint
- Check Redis connectivity
- Check database connectivity
- Track last successful stats collection timestamp

**Worker Service**:
- Exposes `/health` endpoint
- Check Redis connectivity
- Check database connectivity
- Track uptime and active jobs

### Alerting Recommendations

**Critical Alerts**:
- No worker stats in Redis for > 5 minutes (all workers down)
- Queue depth > 1000 for > 10 minutes (backlog building)
- Worker failure rate > 10% (systemic issues)
- Database pool usage > 90% for > 2 minutes (connection exhaustion)

**Warning Alerts**:
- Abandoned jobs count growing > 10/hour (worker crashes or timeouts)
- Queue depth > 500 (load increasing)
- Worker CPU > 90% for > 5 minutes (overloaded)
- Database pool usage > 80% (approaching limit)

### Dashboard Usage

**Real-Time Monitoring**:
- Open MonitorUI at `http://localhost:8081`
- Monitor auto-refreshes every 5 seconds
- Check Job Metrics for status distribution
- Check Queue Metrics for backlog
- Check Worker Metrics for resource usage
- Check System Metrics for recovery/cleanup activity

**Debugging Workflow**:
1. Check MonitorUI for high-level issues
2. Drill down to specific worker via worker details
3. For local dev: Access worker stats endpoint directly (`GET localhost:3001/stats`)
4. Check database pool usage if seeing connection errors
5. Review Monitor service logs for cron job activity

## Future Enhancements

See [TODO.md](TODO.md) for detailed roadmap. Key items:

**Priority 1: Monitoring (Next)**
- Prometheus/Grafana integration for historical metrics
- Alerting for abandoned jobs, high failure rates, queue depth
- Distributed tracing (OpenTelemetry)
- MonitorUI enhancements (historical graphs, filtering)

**Priority 6.3: Multi-Queue Workers**
- Support for worker types (general, GPU, I/O-intensive)
- Queue-based job routing
- Priority queues
- Resource-based worker selection

## References

- [BullMQ Documentation](https://docs.bullmq.io/)
- [Redis Commands](https://redis.io/commands/)
- [NestJS Metrics](https://docs.nestjs.com/techniques/performance)
- [Vue 3 Documentation](https://vuejs.org/)
- [Vuetify 3 Documentation](https://vuetifyjs.com/)
- [TESTING_INSTRUCTIONS.md](./TESTING_INSTRUCTIONS.md) - Integration test suite
