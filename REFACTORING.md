# Project Structure Refactoring

## Summary

The project has been refactored to follow NestJS best practices, inspired by production-grade monorepo structures.

## What Changed

### Before (Old Structure)
```
apps/
  ├── api/src/
  │   ├── main.ts
  │   ├── app.module.ts
  │   ├── app.controller.ts    # ❌ Business logic in app
  │   └── app.service.ts       # ❌ Business logic in app
  ├── worker/src/
  │   └── ... (same pattern)
  └── monitor/src/
      └── ... (same pattern)

src/modules/                    # ❌ Not well organized
```

### After (New Structure) ✅
```
src/
  ├── apps/                    # ✅ Thin entry points only
  │   ├── api/
  │   │   ├── main.ts          # Entry point
  │   │   ├── app.module.ts    # Import services
  │   │   └── tsconfig.app.json
  │   ├── worker/
  │   └── monitor/
  │
  ├── services/                # ✅ All business logic here
  │   ├── health/
  │   │   ├── health.module.ts
  │   │   ├── health.controller.ts
  │   │   └── health.service.ts
  │   ├── worker-stats/
  │   │   ├── worker-stats.module.ts
  │   │   ├── worker-stats.controller.ts
  │   │   └── worker-stats.service.ts
  │   └── monitor/
  │       ├── monitor.module.ts
  │       ├── monitor.controller.ts
  │       └── monitor.service.ts
  │
  ├── config/                  # ✅ Ready for Phase 2
  └── common/                  # ✅ Ready for Phase 2
```

## Benefits

### 1. Thin Apps
Each app is just an entry point:
- `main.ts` - Bootstrap application
- `app.module.ts` - Import shared services

**Example: src/apps/api/app.module.ts**
```typescript
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    HealthModule,        // Shared service
    // TODO: JobsModule  // Phase 2
  ],
})
export class AppModule {}
```

### 2. Shared Services
Business logic in `/services` can be imported by any app:

```typescript
// API uses HealthModule
// Worker uses HealthModule + WorkerStatsModule
// Monitor uses HealthModule + MonitorModule
```

### 3. Better Code Reuse
- Worker and API both need health checks → import `HealthModule`
- Phase 2: Worker and API both need job operations → import `JobsModule`
- No code duplication

### 4. TypeScript Path Aliases
```json
{
  "paths": {
    "@/*": ["src/*"],
    "@/services/*": ["src/services/*"],
    "@/config/*": ["src/config/*"],
    "@/common/*": ["src/common/*"]
  }
}
```

**Usage:**
```typescript
import { HealthModule } from '@/services/health/health.module';
import { JobDto } from '@/common/dtos/job.dto';
```

## Services Overview

### Health Service (Shared)
- **Used by:** API, Worker, Monitor
- **Endpoints:** `GET /health`
- **Purpose:** Health check for all apps

### Worker Stats Service (Worker Only)
- **Used by:** Worker
- **Endpoints:** `GET /stats`
- **Purpose:** Worker metrics (active jobs, CPU, memory, uptime)

### Monitor Service (Monitor Only)
- **Used by:** Monitor
- **Endpoints:** `GET /metrics/jobs`, `GET /metrics/queue`, etc.
- **Cron Jobs:**
  - Every 2 minutes: Check abandoned jobs
  - Daily at 2 AM: TTL cleanup
- **Purpose:** Monitoring, metrics, recovery

## Verification

All services build successfully:

```bash
npm run build:api      # ✅ Success
npm run build:worker   # ✅ Success
npm run build:monitor  # ✅ Success
```

## Next Steps (Phase 2)

With this structure in place, Phase 2 will add:

### 1. Database Integration
```
src/config/
  ├── app.config.ts
  └── database.config.ts
```

### 2. Shared Entities & DTOs
```
src/common/
  ├── entities/
  │   └── job.entity.ts
  ├── dtos/
  │   ├── create-job.dto.ts
  │   └── job-response.dto.ts
  └── interfaces/
      └── job.interface.ts
```

### 3. Jobs Service (Shared)
```
src/services/jobs/
  ├── jobs.module.ts
  ├── jobs.service.ts       # CRUD operations, BullMQ integration
  └── jobs.controller.ts    # REST endpoints (used by API)
```

### 4. Processor Service (Worker Only)
```
src/services/processor/
  ├── processor.module.ts
  ├── processor.service.ts  # Job execution logic
  └── processors/
      └── test-job.processor.ts
```

## Best Practices Applied

✅ **Separation of concerns** - Apps vs services
✅ **Code reusability** - Shared services across apps
✅ **Clear boundaries** - Each service has single responsibility
✅ **TypeScript paths** - Clean imports with `@/` aliases
✅ **Monorepo structure** - Multiple apps, shared code
✅ **Scalable architecture** - Easy to add new services/apps

## Reference

This structure follows the pattern used in production NestJS projects:
- `/src/apps` - Entry points (main.ts + app.module.ts)
- `/src/services` - Business logic modules
- `/src/config` - Configuration
- `/src/common` - Shared code

Similar to: `/Users/antonshifman/Documents/monorepo/codebase/nestBe/src`
