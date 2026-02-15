# Setup Guide - Phase 1 Complete

## ✅ Phase 1: Infrastructure & Placeholder Services - COMPLETE

The following has been set up and is ready to run:

### Project Structure
```
cytoReason/
├── codebase/                   # All NestJS code
│   ├── src/
│   │   ├── apps/              # Thin entry points (main.ts + app.module.ts)
│   │   │   ├── api/           # API Server (Port 3000)
│   │   │   ├── worker/        # Worker Service (Port 3001)
│   │   │   └── monitor/       # Monitor Service (Port 3002)
│   │   ├── services/          # Business logic (shared across apps)
│   │   │   ├── health/        # Health check service
│   │   │   ├── worker-stats/  # Worker statistics
│   │   │   └── monitor/       # Monitoring & cron jobs
│   │   ├── config/            # Configuration (Phase 2)
│   │   └── common/            # Shared code (Phase 2)
│   ├── package.json
│   ├── nest-cli.json
│   └── tsconfig.json
├── docker-compose.dev-support.yml  # PostgreSQL + Redis for local dev
├── ARCHITECTURE.md            # Complete system design
├── TODO.md                    # Future enhancements
├── README.md                  # Usage instructions
└── REFACTORING.md             # Structure refactoring details
```

### Services Created

#### 1. API Server (Port 3000)
- ✅ Basic NestJS app with health endpoint
- ✅ `GET /health` - Returns service status
- 📦 Ready for Phase 2: Job CRUD endpoints

#### 2. Worker Service (Port 3001)
- ✅ Basic NestJS app with stats endpoint
- ✅ `GET /health` - Health check
- ✅ `GET /stats` - Worker metrics (placeholder)
- 📦 Ready for Phase 2: Job processing logic

#### 3. Monitor Service (Port 3002)
- ✅ Basic NestJS app with metrics endpoints
- ✅ `GET /health` - Health check
- ✅ `GET /metrics/jobs` - Job metrics (placeholder)
- ✅ `GET /metrics/queue` - Queue metrics (placeholder)
- ✅ `GET /metrics/workers` - Worker metrics (placeholder)
- ✅ `GET /metrics/system` - System metrics (placeholder)
- ✅ Cron jobs scheduled (not yet implemented):
  - Every 2 minutes: Check for abandoned jobs
  - Daily at 2 AM: TTL cleanup
- 📦 Ready for Phase 2: Minimal monitoring implementation

### Infrastructure (Docker Compose)

#### PostgreSQL
- Image: `postgres:15-alpine`
- Port: `5432`
- Database: `jobsdb`
- User: `jobsuser`
- Password: `jobspass`
- Health check: Configured
- Volume: `postgres_data` for persistence

#### Redis
- Image: `redis:7-alpine`
- Port: `6379`
- Health check: Configured
- Volume: `redis_data` for persistence

### Configuration

All environment variables configured in `.env`:
- Database connection string
- Redis connection string
- Service ports (3000, 3001, 3002)
- Worker concurrency (10)
- Cron schedules
- Job defaults (retry attempts, timeouts, TTL)

## 🚀 How to Run (Phase 1)

### Prerequisites
- Node.js >= 18
- Docker Desktop (must be running)
- npm

### Steps

1. **Start Docker Desktop** (important!)

2. **Start Infrastructure**
   ```bash
   docker-compose up -d
   ```

   Verify containers are running:
   ```bash
   docker ps
   ```

   Should show:
   - `jobs-postgres` - PostgreSQL
   - `jobs-redis` - Redis

3. **Install Dependencies**
   ```bash
   cd codebase
   npm install
   ```

4. **Start All Services**
   ```bash
   npm run start:dev
   ```

   This starts all three services with hot-reload:
   - API: http://localhost:3000
   - Worker: http://localhost:3001
   - Monitor: http://localhost:3002

5. **Test Endpoints**
   ```bash
   # API Server
   curl http://localhost:3000/health

   # Worker
   curl http://localhost:3001/health
   curl http://localhost:3001/stats

   # Monitor
   curl http://localhost:3002/health
   curl http://localhost:3002/metrics/jobs
   ```

### Expected Output

All health checks should return:
```json
{
  "status": "ok",
  "service": "api|worker|monitor",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

Worker stats should return:
```json
{
  "worker_active_jobs": 0,
  "worker_cpu_usage": 0,
  "worker_memory_usage": <MB>,
  "worker_uptime_seconds": <seconds>,
  "worker_processed_jobs_total": 0
}
```

## 📋 Next Steps - Phase 2

### Database & Queue Integration
- [ ] Add TypeORM configuration
- [ ] Create Job entity (database schema)
- [ ] Add database migrations
- [ ] Configure BullMQ
- [ ] Create shared Jobs module

### API Implementation
- [ ] `POST /jobs` - Submit job
- [ ] `GET /jobs/:id` - Get job status
- [ ] `DELETE /jobs/:id` - Cancel job
- [ ] Job validation (class/type/payload)
- [ ] Error handling

### Worker Implementation
- [ ] BullMQ job processor
- [ ] Job execution logic (with test job type)
- [ ] Retry with exponential backoff
- [ ] Conditional database updates
- [ ] Update stats endpoint with real data

### Monitor Implementation (Minimal)
- [ ] Abandoned PROCESSING jobs detection
- [ ] Abandoned PENDING jobs detection
- [ ] Re-enqueue logic
- [ ] TTL cleanup (optional for Phase 2)

## 📋 Phase 3 - Testing

### Test Job Type
```typescript
{
  class: "testJobs",
  type: "regularJob",
  payload: {
    executionTime: number,  // milliseconds to run
    failureProb: number     // 0.0 - 1.0 probability of failure
  }
}
```

### Test Scenarios
- [ ] Submit job and verify completion
- [ ] Test job failure and retry
- [ ] Test job cancellation (PENDING and PROCESSING)
- [ ] Test worker crash recovery
- [ ] Test concurrent job processing
- [ ] Test abandoned job detection

## 📝 Documentation Complete

- ✅ [ARCHITECTURE.md](./ARCHITECTURE.md) - Full system design, trade-offs, scalability to 100K QPS
- ✅ [TODO.md](./TODO.md) - Prioritized future enhancements
- ✅ [README.md](./README.md) - Quick start and usage
- ✅ This setup guide

## 🎯 Success Criteria for Phase 1

- [x] Docker Compose with PostgreSQL and Redis
- [x] Three NestJS apps (api, worker, monitor) with basic structure
- [x] Health endpoints on all services
- [x] Environment configuration
- [x] Dependencies installed
- [x] Project structure organized
- [x] Documentation complete

**Phase 1 is ready for testing once Docker Desktop is started!**

To verify Docker is running:
```bash
docker info
```

If Docker is not running, start Docker Desktop and wait for it to be ready, then run:
```bash
docker-compose up -d
cd codebase && npm run start:dev
```
