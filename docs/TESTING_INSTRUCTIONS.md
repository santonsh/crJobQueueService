# Testing Instructions

## Recent Fix

**Fixed Redis connection configuration issue** - The queue.config.ts was incorrectly parsing the REDIS_URL. This has been corrected and all services have been rebuilt.

**Action Required:** Restart all three services (API, Worker, Monitor) with the newly built code.

## Restart Services

### Step 1: Stop Running Services

In each terminal where services are running, press `Ctrl+C` to stop them.

Or kill all at once:
```bash
pkill -f "nest start"
```

### Step 2: Verify Docker is Running

```bash
docker ps
# Should see: jobs-postgres and jobs-redis
```

If not running:
```bash
docker-compose up -d
```

### Step 3: Start Services with New Code

**Terminal 1 - API:**
```bash
cd codebase
npm run start:dev:api
```

Wait for: "🚀 API Server is running on: http://localhost:3000"

**Terminal 2 - Worker:**
```bash
cd codebase
npm run start:dev:worker
```

Wait for: "⚙️  Worker is running on: http://localhost:3001"

**Terminal 3 - Monitor:**
```bash
cd codebase
npm run start:dev:monitor
```

Wait for: "📊 Monitor is running on: http://localhost:3002"

### Step 4: Verify Services

```bash
# API Health
curl http://localhost:3000/health

# Should return: {"status":"ok","timestamp":"...","uptime":...}
```

### Step 5: Manual Test - Submit a Job

```bash
curl -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "class": "test",
    "type": "delay",
    "payload": {
      "executionTime": 2000,
      "failureProb": 0
    }
  }'
```

**Expected response:**
```json
{
  "jobId": "some-uuid",
  "class": "test",
  "type": "delay",
  "status": "PENDING",
  ...
}
```

**If you get this, services are working!**

### Step 6: Run Test Script

```bash
./test-job-lifecycle.sh
```

## Troubleshooting

### Check API Logs

Look at the terminal where API is running for error messages. Common issues:

1. **Database connection error**: Check DATABASE_URL in `.env`
2. **Redis connection error**: Check REDIS_URL in `.env`
3. **TypeORM sync error**: Tables should auto-create on first run

### Verify Database Connection

```bash
docker exec -it jobs-postgres psql -U jobsuser -d jobsdb -c "\dt"
```

Should show the `jobs` table after API starts successfully.

### Check Environment Variables

```bash
cd codebase
cat .env
```

Should have:
- DATABASE_URL=postgresql://jobsuser:jobspass@localhost:5432/jobsdb
- REDIS_URL=redis://localhost:6379

## Next Steps After Services Restart

1. Run the test script: `./test-job-lifecycle.sh`
2. All tests should pass (except manual abandoned job test)
3. Check service logs for any errors
4. Verify database has job records: `docker exec -it jobs-postgres psql -U jobsuser -d jobsdb -c "SELECT * FROM jobs;"`
