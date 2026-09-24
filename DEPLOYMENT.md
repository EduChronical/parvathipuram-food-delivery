# Deployment

## Build
```bash
npm install
npm run validate
```

## Database
Provision PostgreSQL with persistent storage and Redis. Set DATABASE_URL and REDIS_URL. For a new database:
```bash
npm run db:migrate
npm run db:seed
npm run bootstrap:admin -w @ppm/database
```

## API
Build:
```bash
npm run build -w @ppm/core
npm run db:generate
npm run build -w @ppm/database
npm run build -w @ppm/api
```
Start:
```bash
npm run start -w @ppm/api
```
Health path: /health.

## Portals
Build each workspace and set NEXT_PUBLIC_API_URL to the public HTTPS API URL:
```bash
npm run build -w @ppm/customer-web
npm run build -w @ppm/restaurant-portal
npm run build -w @ppm/delivery-portal
npm run build -w @ppm/admin-portal
```

## Worker
Run the API worker process separately for notification jobs:
```bash
node apps/api/dist/worker.js
```

## Rollback
Keep the prior application deployment available until health, auth and order smoke tests pass. Roll back the application version first; database rollback must be performed only with a tested backward migration or point-in-time restore.

## Backup
Use automated PostgreSQL snapshots plus periodic restore drills. Version/object-lock important object storage according to retention policy. Keep credentials in the cloud secret store, not repository files.

## Current cloud topology
On constrained Railway plans, the customer PWA and API can run in one service; restaurant, delivery and admin portals run as separate web services. Redis is optional for a single API replica because order SSE has an in-process fallback; configure REDIS_URL for multi-replica fan-out and BullMQ workers.
