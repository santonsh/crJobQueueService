# Architecture Summary

Concise overview of the Job Queue Service architecture. For detailed explanations, see [ARCHITECTURE.md](ARCHITECTURE.md).

## System Components

```
┌──────────┐     ┌─────────┐     ┌──────────┐     ┌────────────┐
│  Client  │────▶│   API   │────▶│  BullMQ  │────▶│   Worker   │
└──────────┘     └─────────┘     │ (Redis)  │     └──────────┬─┘
                      │           └──────────┘                │
                      │                                       │
                      ▼                                       ▼
                 ┌──────────────────────────────────────────────┐
                 │            PostgreSQL Database               │
                 │         (Source of Truth for Jobs)           │
                 └──────────────────────────────────────────────┘
                      ▲
                      │
                 ┌────┴─────┐          ┌────────────┐
                 │ Monitor  │          │ MonitorUI  │
                 │ Service  │◀────────▶│ (Vue.js)   │
                 └──────────┘          └────────────┘
```

**Components:**
- **API**: Job submission and query endpoints (NestJS)
- **BullMQ**: Distributed queue built on Redis
- **Worker**: Processes jobs with configurable concurrency (NestJS)
- **PostgreSQL**: Single source of truth for job state
- **Monitor**: Detects and recovers abandoned jobs, exposes metrics (NestJS)
- **MonitorUI**: Real-time metrics dashboard (Vue 3 + Vuetify)

**Target Performance:** 1K-2K QPS with horizontal worker scaling

## Data Model

### Job Entity
```
id (UUID), class, type, payload, status, attempts, maxAttempts,
error, result, createdAt, processingStartedAt, finishedAt
```

### Job States
```
PENDING → PROCESSING → COMPLETED
                    → FAILED
                    → CANCELLED
```

## Core Design Principles

### 1. Exactly-Once Processing
- **BullMQ**: Distributed locking via Redis prevents duplicate dequeuing
- **PostgreSQL**: Atomic conditional updates ensure only one worker processes each job
  - Claim job: `UPDATE ... WHERE status = 'PENDING'`
  - Complete job: `UPDATE ... WHERE status = 'PROCESSING'`

### 2. Fault Tolerance

#### Job Retries (Application Failures)
- Worker retries failed jobs with exponential backoff
- Increments `attempts` counter on each failure
- Marks job as FAILED after `maxAttempts` reached
- **PostgreSQL is marked FAILED, BullMQ job is removed** (no memory leak)

#### Abandoned Job Recovery (Infrastructure Failures)
Monitor service detects and recovers:

**Abandoned PROCESSING Jobs:**
- Detection: Jobs in PROCESSING state longer than timeout threshold
- Recovery: Re-enqueue to BullMQ, reset to PENDING
- Attempts counter NOT incremented (infrastructure failure, not job failure)

**Abandoned PENDING Jobs:**
- Detection: Jobs in PENDING state longer than queue wait threshold
- Recovery: Re-enqueue to BullMQ (likely lost from Redis)

### 3. Scalability

#### Horizontal Scaling
- **API**: Stateless, can scale behind load balancer
- **Workers**: Scale based on queue depth (primary scaling lever)
- **Monitor**: Single instance (low resource, stateless)

#### Database Optimization
- Connection pooling with monitoring (max 20 per worker)
- Bulk job insertion for efficiency
- Indexes on `status`, `createdAt`, `processingStartedAt`

### 4. Monitoring & Observability

#### Metrics Sources
- **PostgreSQL**: Job counts by status, completion rates
- **BullMQ**: Queue depth, waiting/active/failed counts
- **Workers**: Self-publish stats to Redis (CPU, memory, active jobs, DB pool usage)
- **Monitor**: Aggregates worker stats, exposes system metrics

#### MonitorUI Dashboard
- Real-time metrics (5-second refresh)
- Job status breakdown (PENDING, PROCESSING, COMPLETED, FAILED, CANCELLED)
- Queue health (depth, waiting, active, failed)
- Worker health (CPU, memory, DB pool saturation)

## Data Flow

### Job Submission
```
1. Client → POST /jobs → API
2. API → Insert to PostgreSQL (status: PENDING)
3. API → Enqueue to BullMQ
4. API → Return jobId to client
```

### Job Processing
```
1. Worker ← Dequeue from BullMQ
2. Worker → Claim job (UPDATE status to PROCESSING)
3. Worker → Execute job logic
4. Worker → Complete job (UPDATE status to COMPLETED/FAILED)
5. BullMQ → Remove job from queue
```

### Job Cancellation
```
1. Client → DELETE /jobs/:id → API
2. API → UPDATE status to CANCELLED (conditional)
3. Worker → Check status before completing
4. Worker → Skip completion if cancelled
```

### Abandoned Job Recovery
```
1. Monitor → Cron job (every 2 minutes)
2. Monitor → Query for abandoned jobs (PROCESSING timeout, PENDING timeout)
3. Monitor → Re-enqueue to BullMQ
4. Monitor → Reset status to PENDING (PROCESSING jobs only)
```

## Key Trade-offs

| Decision | Trade-off |
|----------|-----------|
| **PostgreSQL as source of truth** | ✓ Persistent, queryable<br>✗ DB load on high QPS |
| **Worker-side retries with exponential backoff** | ✓ Precise timing, efficient<br>✗ More complex than re-enqueue |
| **Monitor service for abandoned jobs** | ✓ Automatic recovery<br>✗ Re-enqueued jobs lose queue position |
| **BullMQ failed jobs removed on permanent failure** | ✓ No memory leak<br>✗ Need separate DLQ for analysis |
| **Worker stats published to Redis** | ✓ Low overhead, aggregatable<br>✗ 5-minute TTL, no historical data |

## Performance Characteristics

- **Throughput**: 1K-2K QPS tested with load balancing
- **Job Latency**: Low (sub-second for fast jobs)
- **Recovery Time**: 2-minute cron interval for abandoned jobs
- **Database Load**: Moderate (optimized with bulk inserts, connection pooling)
- **Memory**: Efficient (BullMQ jobs cleaned on completion)

## Deployment Architecture

See [DEPLOYMENT.md](DEPLOYMENT.md) for AWS deployment strategy (EKS/ECS, RDS, ElastiCache, ALB).

---

**For detailed implementation:**
- Architecture details: [ARCHITECTURE.md](ARCHITECTURE.md)
- Monitoring setup: [MONITORING.md](MONITORING.md)
- Testing strategy: [TESTING_INSTRUCTIONS.md](TESTING_INSTRUCTIONS.md)
- Load Testing strategy: [LOAD_TESTING.md](LOAD_TESTING.md)
- Future enhancements: [TODO.md](TODO.md)
