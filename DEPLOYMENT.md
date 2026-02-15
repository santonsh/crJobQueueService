# Deployment Scenarios Quick Reference

This document provides a quick reference for the three deployment scenarios available for testing and development.

## Overview

| Scenario | Use Case | API Port | Monitor Port | Postgres Port | Redis Port |
|----------|----------|----------|--------------|---------------|------------|
| **Support** | Local development | 3000 (local) | 3002 (local) | 5433 | 6380 |
| **Full** | Single API Docker | 3010 | 3012 | 5433 | 6380 |
| **Load-Balanced** | High-throughput testing | 3010 (nginx) | 3012 | 5433 | 6380 |

---

## 1. Support Services Only

**When to use:** Local development, debugging, rapid iteration

### Start Services
```bash
docker-compose -f docker-compose.support.yml up -d
```

### Run Locally
```bash
# Terminal 1 - API
npm run build:api && npm run start:api

# Terminal 2 - Worker
npm run build:worker && npm run start:worker

# Terminal 3 - Monitor
npm run build:monitor && npm run start:monitor
```

### Load Test
```bash
node tests/load-test-2k-qps.js --env support --qps 1000 --duration 30
```

### MonitorUI
- Open http://localhost:8081
- Select "Support + Local (3002)" in environment dropdown

### Stop
```bash
docker-compose -f docker-compose.support.yml down
```

---

## 2. Full Stack (Single API)

**When to use:** Testing complete Docker deployment, single API performance testing

### Start Services
```bash
docker-compose -f docker-compose.full.yml up --build -d
```

### Check Status
```bash
docker ps --filter "name=full"
```

### Load Test
```bash
# TypeORM (default)
node tests/load-test-2k-qps.js --env full --qps 1000 --duration 30

# With Raw SQL (for comparison)
# First update docker-compose.full.yml: USE_RAW_SQL: "true", then rebuild
```

### MonitorUI
- Open http://localhost:8081
- Select "Full Stack (3012)" in environment dropdown

### View Logs
```bash
docker-compose -f docker-compose.full.yml logs -f api
```

### Stop
```bash
docker-compose -f docker-compose.full.yml down
```

---

## 3. Load-Balanced (2× API)

**When to use:** High-throughput testing, horizontal scaling validation, production simulation

### Start Services
```bash
docker-compose -f docker-compose.loadbalanced.yml up --build -d
```

### Check Status
```bash
docker ps --filter "name=loadbalanced"

# Should show:
# - loadbalanced-nginx-1
# - loadbalanced-api-1-1, loadbalanced-api-2-1
# - loadbalanced-worker-1-1 through loadbalanced-worker-5-1
# - loadbalanced-postgres-1, loadbalanced-redis-1
# - loadbalanced-monitor-1
```

### Load Test
```bash
# Raw SQL mode (1,704 QPS)
node tests/load-test-2k-qps.js --env loadbalanced --qps 2000 --duration 60

# Backward compatible
node tests/load-test-2k-qps.js --docker --qps 2000 --duration 60
```

### MonitorUI
- Open http://localhost:8081
- Select "Load-Balanced (3012)" in environment dropdown

### View Logs
```bash
# All API logs
docker-compose -f docker-compose.loadbalanced.yml logs -f api-1 api-2

# nginx logs
docker-compose -f docker-compose.loadbalanced.yml logs -f nginx

# All logs
docker-compose -f docker-compose.loadbalanced.yml logs -f
```

### Stop
```bash
docker-compose -f docker-compose.loadbalanced.yml down
```

---

## Switching Between Scenarios

### Stop Current Scenario
```bash
# Stop whichever is running
docker-compose -f docker-compose.support.yml down
docker-compose -f docker-compose.full.yml down
docker-compose -f docker-compose.loadbalanced.yml down
```

### Start New Scenario
```bash
# Pick one
docker-compose -f docker-compose.<scenario>.yml up -d
```

---

## Database Management

### Connect to PostgreSQL
```bash
# Support/Full/Load-balanced (all use same port)
docker exec -it support-postgres psql -U jobsuser -d jobsdb
# or
docker exec -it full-postgres-1 psql -U jobsuser -d jobsdb
# or
docker exec -it loadbalanced-postgres-1 psql -U jobsuser -d jobsdb
```

### Check Job Count
```bash
docker exec -it loadbalanced-postgres-1 psql -U jobsuser -d jobsdb -c "SELECT COUNT(*) FROM jobs;"
```

### Clear Jobs Table
```bash
docker exec -it loadbalanced-postgres-1 psql -U jobsuser -d jobsdb -c "TRUNCATE TABLE jobs;"
```

---

## Performance Comparison

Based on load testing results:

| Configuration | QPS | vs 1K Target | Notes |
|---------------|-----|--------------|-------|
| Support (local) + Raw SQL | ~1,400 QPS | 140% ✅ | Best for development |
| Full (1 API) + TypeORM | ~1,000 QPS | 100% ✅ | Baseline |
| Full (1 API) + Raw SQL | ~1,200 QPS | 120% ✅ | +20% improvement |
| Load-balanced + TypeORM | 1,281 QPS | 128% ✅ | 2 APIs |
| Load-balanced + Raw SQL | **1,704 QPS** | **170%** ✅ | **Best throughput** |

### To Enable Raw SQL Mode

Edit the docker-compose file and set:
```yaml
USE_RAW_SQL: "true"
```

Then rebuild:
```bash
docker-compose -f docker-compose.<scenario>.yml up --build -d
```

---

## Troubleshooting

### Port Already in Use
```bash
# Check what's using the port
lsof -i :3010

# Kill process
kill -9 <PID>
```

### Database Schema Missing
```bash
# Check if tables exist
docker exec -it <postgres-container> psql -U jobsuser -d jobsdb -c "\dt"

# If missing, ensure TYPEORM_SYNCHRONIZE=true in docker-compose
```

### MonitorUI Not Connecting
1. Check environment selector matches your deployment
2. Verify monitor service is running: `curl http://localhost:3012/health`
3. Check browser console for CORS errors

### Load Test Fails with 0% Success Rate
1. Verify database schema exists
2. Check API logs: `docker-compose -f docker-compose.<scenario>.yml logs api`
3. Ensure correct `--env` flag matches your deployment

---

## Quick Commands Cheat Sheet

```bash
# Start load-balanced
docker-compose -f docker-compose.loadbalanced.yml up --build -d

# Run load test
node tests/load-test-2k-qps.js --env loadbalanced --qps 2000 --duration 60

# Check job count
docker exec -it loadbalanced-postgres-1 psql -U jobsuser -d jobsdb -c "SELECT status, COUNT(*) FROM jobs GROUP BY status;"

# View API logs
docker-compose -f docker-compose.loadbalanced.yml logs -f api-1 api-2

# Stop everything
docker-compose -f docker-compose.loadbalanced.yml down

# Clean up (including volumes)
docker-compose -f docker-compose.loadbalanced.yml down -v
```

---

**Last Updated:** 2026-02-14
