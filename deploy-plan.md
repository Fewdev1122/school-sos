# School SOS - Deployment Plan

## Overview
Deployment uses Cloudflare Workers (backend API) and Cloudflare Pages (frontend SPA).

## Prerequisites (manual)
- Cloudflare account
- Cloudflare API Token with Workers + D1 + Pages permissions
- Node.js 18+

## Step 1: Create D1 Database

```bash
cd backend
npx wrangler d1 create school-sos-db
```

Update `wrangler.toml` with the returned `database_id`:
```toml
[[d1_databases]]
binding = "DB"
database_name = "school-sos-db"
database_id = "<your-database-id>"
migrations_dir = "migrations"
```

## Step 2: Apply Migrations

```bash
npx wrangler d1 migrations apply school-sos-db
```

## Step 3: Deploy Backend

```bash
cd backend
npm run deploy
```

## Step 4: Deploy Frontend

```bash
cd frontend
npm run build
npx wrangler pages deploy dist --project-name school-sos-frontend
```

## Step 5: Configure Frontend API URL

Update `vite.config.ts` or set environment variables for production API URL.

## Alternative: GitHub Actions CI/CD

### GitHub Secrets Required
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

### Workflow (`.github/workflows/deploy.yml`)

```yaml
name: Deploy
on:
  push:
    branches: [main]

jobs:
  backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: cd backend && npm ci && npm run deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}

  frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: cd frontend && npm ci && npm run build
      - uses: cloudflare/pages-action@v1
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          projectName: school-sos-frontend
          directory: frontend/dist
```

## Manual Deployment (local CLI)

1. Login to Cloudflare: `npx wrangler login`
2. Create D1 DB
3. Apply migrations
4. Deploy backend
5. Build + deploy frontend

## Verification

After deployment:
- Visit `https://school-sos-frontend.pages.dev/dashboard`
- Test report flow
- Verify API responds at the Workers URL

---

**⚠️ STOP**: Before executing any deployment step that requires Cloudflare login, API token, GitHub Secrets, or actual deployment, pause and notify the project manager/human operator.
