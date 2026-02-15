# Jobs Service

Asynchronous job processing service built with NestJS, PostgreSQL, and BullMQ.

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed system design, trade-offs, and scalability considerations.

## Prerequisites

- Node.js >= 18
- Docker and Docker Compose
- npm or yarn

## Quick Start

### 1. Install Dependencies

```bash
cd codebase
npm install
```

### 2. Start Infrastructure (PostgreSQL & Redis)

From the project root:

```bash
npm run docker:up
```

Or manually:

```bash
docker-compose -f docker-compose.dev-support.yml up -d
```

This will start:
- PostgreSQL on `localhost:5432`
- Redis on `localhost:6379`

### 3. Configure Environment

From the `codebase` directory:

```bash
cd codebase
cp .env.example .env
```

The default configuration should work with the Docker Compose setup.

### 4. Start Services

From the `codebase` directory:

**Option A: Start all services in development mode (recommended)**
```bash
npm run start:dev
```

This starts all three services with hot-reload:
- API Server: http://localhost:3000
- Worker: http://localhost:3001
- Monitor: http://localhost:3002

**Option B: Start services individually**
```bash
# Terminal 1 - API Server
npm run start:dev:api

# Terminal 2 - Worker
npm run start:dev:worker

# Terminal 3 - Monitor
npm run start:dev:monitor
```

### 5. Start MonitorUI (Optional - Web Dashboard)

From the `monitorUI` directory:

```bash
cd monitorUI
npm install  # First time only
npm run dev
```

This starts the Vue.js monitoring dashboard:
- MonitorUI: http://localhost:8081

The dashboard provides:
- Real-time metrics visualization (auto-refresh every 5 seconds)
- System health monitoring
- Integrated test runner button
- Worker, queue, and job statistics

## Available Scripts

### Development
- `npm run start:dev` - Start all services in watch mode
- `npm run start:dev:api` - Start API server in watch mode
- `npm run start:dev:worker` - Start worker in watch mode
- `npm run start:dev:monitor` - Start monitor in watch mode

### Build
- `npm run build` - Build all services
- `npm run build:api` - Build API server
- `npm run build:worker` - Build worker
- `npm run build:monitor` - Build monitor

### Production
- `npm run start` - Start API server in production mode
- `npm run start:api` - Start API server
- `npm run start:worker` - Start worker
- `npm run start:monitor` - Start monitor

### Docker

Three deployment scenarios are available:

#### 1. **Support Services Only** (for local development)
Just PostgreSQL + Redis, run API/workers/monitor locally:

```bash
# Start support services
docker-compose -f docker-compose.support.yml up -d

# Run locally
npm run build:api && npm run start:api
npm run build:worker && npm run start:worker
npm run build:monitor && npm run start:monitor

# Run load test
node tests/load-test-2k-qps.js --env support --qps 1000 --duration 60

# Stop
docker-compose -f docker-compose.support.yml down
```

**Ports:** PostgreSQL: 5433, Redis: 6380

---

#### 2. **Full Stack** (single API instance)
Complete stack with 1 API instance:

```bash
# Start full stack (1× API, 5× Workers, PostgreSQL, Redis, Monitor)
docker-compose -f docker-compose.full.yml up --build

# Run load test
node tests/load-test-2k-qps.js --env full --qps 1000 --duration 60

# Stop
docker-compose -f docker-compose.full.yml down
```

**Ports:** API: 3010, Monitor: 3012, PostgreSQL: 5433, Redis: 6380

**Expected Performance:** ~1,000-1,700 QPS (depending on USE_RAW_SQL setting)

---

#### 3. **Load-Balanced** (2× API instances for high throughput)
High-availability setup with nginx load balancer:

```bash
# Start load-balanced stack (2× API, 5× Workers, nginx, PostgreSQL, Redis, Monitor)
docker-compose -f docker-compose.loadbalanced.yml up --build

# Run load test (supports backward-compatible --docker flag)
node tests/load-test-2k-qps.js --env loadbalanced --qps 2000 --duration 60
# or
node tests/load-test-2k-qps.js --docker --qps 2000 --duration 60

# Stop
docker-compose -f docker-compose.loadbalanced.yml down
```

**Architecture:**
- nginx load balancer (port 3010) → 2× API instances (round-robin)
- Single PostgreSQL + Redis (shared by all services)
- 5 workers (50 concurrent jobs each = 250 total capacity)
- Monitor service (port 3012)

**Ports:** nginx: 3010, Monitor: 3012, PostgreSQL: 5433, Redis: 6380

**Expected Performance:**
- TypeORM: 1,281 QPS (128% of 1K target) ✅
- Raw SQL: **1,704 QPS** (170% of 1K target) ✅

---

### Load Test Environment Flags

The load test script supports `--env` flag to specify deployment:

```bash
node tests/load-test-2k-qps.js --env <type>
```

Available environments:
- `local` - Local dev (API: 3000, Monitor: 3002) [default]
- `support` - Support services + local apps (API: 3000, Monitor: 3002)
- `full` - Full stack Docker (API: 3010, Monitor: 3012)
- `loadbalanced` - Load-balanced Docker (API: 3010, Monitor: 3012)

The `--docker` flag is an alias for `--env loadbalanced` (backward compatibility)

### Testing
- `npm test` - Run tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:cov` - Run tests with coverage

## API Endpoints

### API Server (Port 3000)
- `GET /health` - Health check

### Worker (Port 3001)
- `GET /health` - Health check
- `GET /stats` - Worker statistics

### Monitor (Port 3002)
- `GET /health` - Health check
- `GET /metrics/jobs` - Job metrics (total submissions, status counts)
- `GET /metrics/queue` - Queue metrics (depth, waiting, active)
- `GET /metrics/workers` - Worker metrics (CPU, memory, active jobs)
- `GET /metrics/system` - System metrics (abandoned jobs, cleanup stats)
- `POST /debug/run_test` - Automated system test (submits 100 jobs, validates completion)

### MonitorUI (Port 8081)
- Web-based dashboard for real-time monitoring
- Auto-refreshes metrics every 5 seconds
- Integrated test runner with visual feedback
- Responsive design with Vuetify components
- **Environment selector** - Switch between deployment scenarios:
  - Local Dev (3002)
  - Load-Balanced (3012)
  - Full Stack (3012)
  - Support + Local (3002)

## Project Structure

```
codebase/
  ├── src/
  │   ├── apps/              # Thin entry points (main.ts + app.module.ts only)
  │   │   ├── api/           # REST API server
  │   │   ├── worker/        # Job processor workers
  │   │   └── monitor/       # Monitor service
  │   ├── services/          # Business logic modules (shared across apps)
  │   │   ├── health/        # Health check service
  │   │   ├── worker-stats/  # Worker statistics service
  │   │   ├── monitor/       # Monitoring, cron jobs, metrics
  │   │   └── jobs/          # Job management service
  │   ├── config/            # Configuration files
  │   └── common/            # Shared DTOs, interfaces, entities
  └── package.json

monitorUI/              # Vue.js monitoring dashboard
  ├── src/
  │   ├── App.vue       # Main dashboard component
  │   └── main.js       # Application entry point
  └── package.json

tests/                  # Integration test scripts
docker-compose.yml      # PostgreSQL and Redis containers
ARCHITECTURE.md         # System design document
README.md              # This file
```

**Structure Benefits:**
- Apps are thin entry points, business logic lives in `/services`
- Services can be imported by any app (better code reuse)
- Clear separation of concerns between backend (NestJS) and frontend (Vue)
- Follows NestJS best practices

## Configuration

Environment variables (see `.env.example`):

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://jobsuser:jobspass@localhost:5432/jobsdb` |
| `DB_POOL_MAX` | Maximum database connections in pool | `50` |
| `DB_POOL_MIN` | Minimum idle database connections in pool | `10` |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `API_PORT` | API server port | `3000` |
| `WORKER_CONCURRENCY` | Jobs processed concurrently per worker | `10` |
| `WORKER_STATS_PORT` | Worker stats endpoint port | `3001` |
| `MONITOR_PORT` | Monitor service port | `3002` |
| `MONITOR_CRON_SCHEDULE` | Abandoned job check schedule | `*/2 * * * *` |
| `MAX_RETRY_ATTEMPTS` | Max retry attempts for failed jobs | `3` |
| `JOB_TIMEOUT_MINUTES` | Job timeout threshold | `5` |
| `HF_MODE` | High-Frequency Mode - Suppress per-request/job logs for load testing | `false` |
| `USE_RAW_SQL` | Use raw SQL for job insertion instead of TypeORM (~20-50% faster) | `false` |

## Development Workflow

1. **Start infrastructure**: `docker-compose up -d` (from project root)
2. **Install dependencies**: `cd codebase && npm install`
3. **Start in dev mode**: `npm run start:dev` (from codebase directory)
4. Make changes - services will auto-reload
5. Test your changes
6. **Stop infrastructure**: `docker-compose down` (from project root)

## Troubleshooting

### Services won't start
- Ensure Docker containers are running: `docker ps`
- Check container logs: `npm run docker:logs`
- Verify ports 3000, 3001, 3002, 5432, 6379 are not in use

### Database connection errors
- Ensure PostgreSQL container is healthy: `docker ps`
- Check DATABASE_URL in `.env` matches Docker Compose config

### Redis connection errors
- Ensure Redis container is healthy: `docker ps`
- Check REDIS_URL in `.env` matches Docker Compose config

## Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) - System architecture and design decisions
- [TODO.md](./TODO.md) - Future enhancements and improvements
- [DEPLOYMENT.md](./DEPLOYMENT.md) - Production deployment strategy (TBD)

## License

Proprietary - Tech Lead Assignment
