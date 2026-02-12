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
docker-compose up -d
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
- `npm run docker:up` - Start PostgreSQL and Redis
- `npm run docker:down` - Stop and remove containers
- `npm run docker:logs` - View container logs

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
- `GET /metrics/jobs` - Job metrics
- `GET /metrics/queue` - Queue metrics
- `GET /metrics/workers` - Worker metrics
- `GET /metrics/system` - System metrics

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
  │   │   └── monitor/       # Monitoring, cron jobs, metrics
  │   ├── config/            # Configuration files (TODO Phase 2)
  │   └── common/            # Shared DTOs, interfaces, entities (TODO Phase 2)
  └── package.json

docker-compose.yml     # PostgreSQL and Redis containers
ARCHITECTURE.md        # System design document
TODO.md               # Future enhancements
README.md            # This file
```

**Structure Benefits:**
- Apps are thin entry points, business logic lives in `/services`
- Services can be imported by any app (better code reuse)
- Clear separation of concerns
- Follows NestJS best practices

## Configuration

Environment variables (see `.env.example`):

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://jobsuser:jobspass@localhost:5432/jobsdb` |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `API_PORT` | API server port | `3000` |
| `WORKER_CONCURRENCY` | Jobs processed concurrently per worker | `10` |
| `WORKER_STATS_PORT` | Worker stats endpoint port | `3001` |
| `MONITOR_PORT` | Monitor service port | `3002` |
| `MONITOR_CRON_SCHEDULE` | Abandoned job check schedule | `*/2 * * * *` |
| `MAX_RETRY_ATTEMPTS` | Max retry attempts for failed jobs | `3` |
| `JOB_TIMEOUT_MINUTES` | Job timeout threshold | `5` |

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
