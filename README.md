# Jobs Service

Asynchronous job processing service built with NestJS, PostgreSQL, and BullMQ.

## Architecture Overview

**Core Components:**
- **API Server**: REST endpoints for job submission, status checks, and cancellation
- **Worker Service**: Processes jobs from BullMQ queue with retry logic and fault tolerance
- **Monitor Service**: Cron-based health checks for abandoned job recovery and TTL cleanup
- **PostgreSQL**: Single source of truth for job state with atomic updates
- **Redis/BullMQ**: Distributed queue for job transport with at-least-once delivery
- **MonitorUI**: Real-time Vue.js dashboard for metrics visualization

**Design Principles:**
- **Exactly-once processing**: PostgreSQL row-level locks ensure only one worker processes each job
- **Fault tolerance**: Worker-side retries with exponential backoff, abandoned job recovery
- **Scalability**: Horizontal scaling of API and workers, connection pooling, optional raw SQL mode
- **Observability**: Comprehensive metrics, health endpoints, real-time monitoring dashboard

**Key Trade-offs:**
- PostgreSQL as source of truth (persistent, queryable) vs. higher DB load on high QPS
- Worker-side retries (precise timing, efficient) vs. more complex than re-enqueue
- BullMQ for transport (Redis memory) vs. PostgreSQL for persistence (disk storage)

For detailed architecture, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) or [docs/ARCHITECTURE_SHORT.md](docs/ARCHITECTURE_SHORT.md).

## Project Structure

```
cytoReason/
├── codebase/                   # NestJS monorepo - All backend services
│   ├── src/
│   │   ├── apps/              # Thin entry points (main.ts + app.module.ts)
│   │   │   ├── api/           # REST API server
│   │   │   ├── worker/        # Job processor workers
│   │   │   └── monitor/       # Monitoring & cron jobs
│   │   ├── services/          # Business logic (shared across apps)
│   │   │   ├── jobs/          # Job submission, status, cancellation
│   │   │   ├── processor/     # Job processing logic & retry
│   │   │   ├── monitor/       # Metrics & abandoned job recovery
│   │   │   ├── health/        # Health checks
│   │   │   └── worker-stats/  # Worker statistics
│   │   ├── common/            # Shared entities, DTOs, interfaces
│   │   └── config/            # Configuration modules
│   └── package.json
│
├── monitorUI/                 # Vue.js monitoring dashboard
│   ├── src/
│   │   ├── App.vue           # Real-time metrics UI
│   │   └── main.js
│   └── package.json
│
├── tests/                     # Integration & load tests
│   ├── test-*.sh             # Functional test suite
│   ├── run-all-tests.sh      # Test runner
│   └── load-test-2k-qps.js   # Load testing tool
│
├── docs/                      # Documentation
│   ├── ARCHITECTURE.md       # Detailed system design
│   ├── ARCHITECTURE_SHORT.md # Concise architecture summary
│   ├── SETUP_GUIDE.md        # Development setup & deployment
│   ├── TODO.md               # Future enhancements
│   └── DEPLOYMENT.md         # AWS production deployment
│
├── docker-compose.*.yml       # Deployment scenarios
└── README.md                  # This file
```

## Prerequisites

- Node.js >= 18
- Docker and Docker Compose
- npm or yarn

## Quick Start

### Local Development Mode

**Best for:** Rapid iteration, debugging, development

```bash
# 1. Start PostgreSQL + Redis in Docker
docker-compose -f docker-compose.support.yml up -d

# 2. Install dependencies
cd codebase
npm install

# 3. Configure environment
cp .env.example .env

# 4. Run services locally (3 terminals or use tmux)
npm run build:api && npm run start:api        # Terminal 1 - API on :3000
npm run build:worker && npm run start:worker  # Terminal 2 - Worker
npm run build:monitor && npm run start:monitor # Terminal 3 - Monitor on :3002

# 5. Optional: Start MonitorUI dashboard
cd ../monitorUI
npm install
npm run dev  # http://localhost:8081 → Select "Support + Local (3002)"

# 6. Run functional tests
cd ../tests
./run-all-tests.sh --env local

# 7. Run load test
node load-test-2k-qps.js --env support --qps 1000 --duration 60

# Stop
docker-compose -f docker-compose.support.yml down
```

**Ports:** PostgreSQL: 5433, Redis: 6380, API: 3000, Monitor: 3002, MonitorUI: 8081

---

### Dockerized Full Stack Mode

**Best for:** Production simulation, performance testing, integration testing

```bash
# 1. Start complete stack (1 API, 5 workers, PostgreSQL, Redis, Monitor)
docker-compose -f docker-compose.full.yml up --build -d

# 2. Check status
docker ps --filter "name=full"

# 3. Monitor via web UI
# Open http://localhost:8081 → Select "Full Stack (3012)"

# 4. Run functional tests
cd tests
./run-all-tests.sh --env full

# 5. Run load test
node load-test-2k-qps.js --env full --qps 1000 --duration 60

# View logs
docker-compose -f docker-compose.full.yml logs -f api

# Stop
docker-compose -f docker-compose.full.yml down
```

**Ports:** API: 3010, Monitor: 3012, PostgreSQL: 5433, Redis: 6380

**Expected Performance:** ~1,000-1,200 QPS (TypeORM) or ~1,400-1,700 QPS (Raw SQL mode)

---

### Load-Balanced Mode (High Throughput)

**Best for:** High-throughput testing, horizontal scaling validation

```bash
# 1. Start load-balanced stack (nginx + 2 APIs + 5 workers)
docker-compose -f docker-compose.loadbalanced.yml up --build -d

# 2. Run load test (target: 2K QPS)
node tests/load-test-2k-qps.js --env loadbalanced --qps 2000 --duration 60

# Stop
docker-compose -f docker-compose.loadbalanced.yml down
```

**Architecture:** nginx load balancer → 2 API instances (round-robin) + 5 workers (250 concurrent jobs)

**Expected Performance:** **1,704 QPS** (170% of 1K target) with Raw SQL mode ✅

---

## Testing

### Functional Tests

```bash
# Run all functional tests (local environment)
cd tests
./run-all-tests.sh --env local

# Run all tests (dockerized environment)
./run-all-tests.sh --env full

# Individual tests
./test-01-job-success.sh          # Job submission & completion
./test-02-retry-logic.sh          # Failure & retry with exponential backoff
./test-03-job-cancellation.sh     # PENDING job cancellation
./test-04-processing-cancellation.sh  # PROCESSING job cancellation
./test-05-concurrent-processing.sh    # Concurrent job processing
./test-06-stress-test.sh          # 1000 jobs stress test
./test-07-abandoned-job-recovery.sh   # Worker crash recovery (3-4 min)
```

### Load Tests

```bash
# Local development
node tests/load-test-2k-qps.js --env local --qps 1000 --duration 60

# Full stack (single API)
node tests/load-test-2k-qps.js --env full --qps 1000 --duration 60

# Load-balanced (2 APIs)
node tests/load-test-2k-qps.js --env loadbalanced --qps 2000 --duration 60
```

### MonitorUI Test Runner

The MonitorUI dashboard includes an integrated test button that runs automated system tests (100 jobs).

## API Endpoints

### API Server
- `POST /jobs` - Submit job
- `GET /jobs/:id` - Get job status
- `DELETE /jobs/:id` - Cancel job
- `GET /health` - Health check

### Worker Service
- `GET /health` - Health check
- `GET /stats` - Worker statistics

### Monitor Service
- `GET /health` - Health check
- `GET /metrics/jobs` - Job metrics (total, by status)
- `GET /metrics/queue` - Queue metrics (depth, active, waiting)
- `GET /metrics/workers` - Worker metrics (CPU, memory, active jobs)
- `GET /metrics/system` - System metrics (abandoned jobs, cleanup stats)
- `POST /debug/run_test` - Automated test (100 jobs)

### MonitorUI Dashboard
- **URL:** http://localhost:8081
- **Features:** Real-time metrics, auto-refresh (5s), integrated test runner, environment selector
- **Environments:** Local Dev (3002), Support + Local (3002), Full Stack (3012), Load-Balanced (3012)

## Configuration

Key environment variables (see `codebase/.env.example`):

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://jobsuser:jobspass@localhost:5432/jobsdb` |
| `DB_POOL_MAX` | Max database connections | `50` |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `API_PORT` | API server port | `3000` |
| `WORKER_CONCURRENCY` | Jobs per worker | `10` |
| `MAX_RETRY_ATTEMPTS` | Max retry attempts | `3` |
| `JOB_TIMEOUT_MINUTES` | Job timeout threshold | `5` |
| `HF_MODE` | High-Frequency Mode (suppress logs for load testing) | `false` |
| `USE_RAW_SQL` | Raw SQL for job insertion (~20-50% faster) | `false` |

## Documentation

### Architecture & Design
- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** - Comprehensive system design with detailed trade-offs, data flow diagrams, SQL schemas, and scalability considerations (100K+ QPS architecture)
- **[docs/ARCHITECTURE_SHORT.md](docs/ARCHITECTURE_SHORT.md)** - Concise architecture summary with key principles, component diagrams, and design decisions

### Setup & Deployment
- **[docs/SETUP_GUIDE.md](docs/SETUP_GUIDE.md)** - Detailed development setup, deployment scenarios (Support/Full/Load-Balanced), performance comparison, and troubleshooting
- **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** - AWS production deployment strategy (EKS/ECS, RDS, ElastiCache, CI/CD, monitoring, blue/green deployments)

### Testing
- **[docs/TESTING_INSTRUCTIONS.md](docs/TESTING_INSTRUCTIONS.md)** - Comprehensive testing guide with functional tests, load tests, and validation procedures
- **[docs/LOAD_TESTING.md](docs/LOAD_TESTING.md)** - Load testing methodology, performance benchmarks, and optimization strategies

### Development Notes
- **[docs/DEV_DEBRIEFING.md](docs/DEV_DEBRIEFING.md)** - Development journey, challenges faced, and lessons learned

### Planning
- **[docs/TODO.md](docs/TODO.md)** - Prioritized roadmap for future enhancements (observability, security, advanced features, performance optimizations)
