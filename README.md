# Monorepo Starter

## Structure
- `apps/api`: TypeScript backend (Express)
- `apps/web`: Next.js frontend
- `packages/shared`: Zod schemas and shared types

## Prerequisites
- Node.js 20+
- npm 10+
- Docker

## Install
```bash
npm install
```

## Run development servers
```bash
npm run dev
```

## Run checks
```bash
npm run lint
npm run test
npm run build
```

## Start Postgres locally
```bash
docker compose up -d postgres
```

The API expects `DATABASE_URL` from `.env` (see `.env.example`).
