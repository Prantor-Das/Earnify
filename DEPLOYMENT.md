# Earnify Deployment Guide

Complete guide for deploying Earnify to production with Vercel (frontend), Render/Railway (backend), and Soroban contracts on Stellar.

---

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Database Setup](#database-setup)
3. [Frontend Deployment (Vercel)](#frontend-deployment-vercel)
4. [Backend Deployment (Render/Railway)](#backend-deployment-renderrailway)
5. [Contract Deployment](#contract-deployment)
6. [Environment Variables](#environment-variables)
7. [Post-Deployment Setup](#post-deployment-setup)

---

## Prerequisites

### Required Tools
- **pnpm** (already in use)
- **Rust** & **Soroban CLI** for contract deployment
  ```bash
  # Install Rust
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
  
  # Add wasm32v1-none target
  rustup target add wasm32v1-none
  
  # Install Stellar CLI
  cargo install --locked stellar-cli --features opt
  ```
- **Node.js 18+** for local development

### Accounts Needed
- **Neon Postgres** (free tier available) - Database
- **Vercel** - Frontend hosting
- **Render** or **Railway** - Backend hosting
- **Stellar Testnet** account with XLM for testing
- **GitHub** - Repository for CI/CD deployments

---

## Database Setup

### Option 1: Neon Postgres (Recommended - Free Tier)

1. **Create Neon Account**
   - Go to [neon.tech](https://neon.tech)
   - Sign up with GitHub
   - Create a project (free tier)

2. **Get Connection String**
   - Copy the connection string from Neon dashboard
   - Format: `postgresql://user:password@host/database?sslmode=require`

3. **Migrate Database**
   ```bash
   export DATABASE_URL="your-neon-connection-string"
   ./scripts/db-deploy.sh
   ```

### Option 2: Railway/Render Postgres
Both platforms offer free trial PostgreSQL instances.

---

## Frontend Deployment (Vercel)

### 1. Prepare Web App

Update [apps/web/vercel.json](apps/web/vercel.json):
```json
{
  "buildCommand": "pnpm --filter @earnify/web build",
  "outputDirectory": "apps/web/.next",
  "framework": "nextjs",
  "env": {
    "NEXT_PUBLIC_API_URL": {
      "description": "API base URL"
    }
  }
}
```

### 2. Deploy to Vercel

**Option A: CLI**
```bash
cd apps/web
npm i -g vercel
vercel --prod
```

**Option B: GitHub Integration**
1. Push code to GitHub
2. Go to [vercel.com](https://vercel.com)
3. Import repository
4. Select `apps/web` as root directory
5. Configure environment variables (see below)
6. Deploy

### 3. Vercel Environment Variables

Set in Vercel dashboard:

```
NEXT_PUBLIC_API_URL=https://api.earnify.com
NEXT_PUBLIC_STRIPE_KEY=[if applicable]
[other public vars]
```

### 4. Post-Deployment

- Domain configuration in Vercel dashboard
- Enable automatic deployments from GitHub

---

## Backend Deployment (Render/Railway)

### Option 1: Render (Free Tier)

**Step 1: Create Web Service**
1. Go to [render.com](https://render.com)
2. Click "New +" → "Web Service"
3. Connect GitHub repository
4. Configure:
   - **Build Command:** `pnpm install && pnpm build`
   - **Start Command:** `pnpm --filter @earnify/api start`
   - **Root Directory:** (leave empty - monorepo)

**Step 2: Set Environment Variables**
- See [Environment Variables](#environment-variables) section
- Important: Include `DATABASE_URL` from Neon

**Step 3: Database Connection**
- Link to PostgreSQL instance or use Neon URL directly

**Step 4: Deploy**
- Push to GitHub → automatic deployment

---

### Option 2: Railway (Free Trial)

**Step 1: Create Service**
1. Go to [railway.app](https://railway.app)
2. Create new project
3. Add GitHub repository

**Step 2: Configuration**
- Create `railway.json`:
```json
{
  "build": {
    "builder": "nixpacks",
    "buildCommand": "pnpm install && pnpm build"
  }
}
```

**Step 3: Set Variables**
- Add all environment variables in Railway dashboard

**Step 4: Configure Start Command**
```
pnpm --filter @earnify/api start
```

---

## Contract Deployment

### Critical: Include Contracts in Backend Build

Your backend needs contract-related dependencies. Update backend `package.json`:

```json
{
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "postinstall": "npm run setup-contracts"
  }
}
```

### Important Files for Deployment

Backend must include/access:
- `contracts/earnify-campaign/` (Rust contract source)
- `scripts/deploy-contract.sh`
- Environment variables for contract deployment

### Backend Build Strategy

Add to [apps/api/package.json](apps/api/package.json):

```json
{
  "scripts": {
    "setup-contracts": "node scripts/validate-contracts.js",
    "deploy-contract": "bash scripts/deploy-contract.sh"
  },
  "devDependencies": {
    "@stellar/stellar-sdk": "^13.3.0"
  }
}
```

### Deployment Flow for New Campaigns

Create [scripts/validate-contracts.js](scripts/validate-contracts.js):

```javascript
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTRACT_DIR = path.join(__dirname, '../contracts/earnify-campaign');

if (!fs.existsSync(CONTRACT_DIR)) {
  console.error('❌ Contract directory not found');
  process.exit(1);
}

console.log('✅ Contracts available for deployment');
console.log(`Contract path: ${CONTRACT_DIR}`);
```

---

## Environment Variables

### Database
```
DATABASE_URL=postgresql://user:pass@neon.techdb/earnify
PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK=1
```

### Frontend (Vercel)
```
NEXT_PUBLIC_API_URL=https://api.earnify.com
NEXT_PUBLIC_APP_NAME=Earnify
```

### Backend (Render/Railway)
```
NODE_ENV=production
DATABASE_URL=postgresql://user:pass@db-host/earnify
PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK=1

# Stellar/Soroban (for contract deployment)
STELLAR_ADMIN_SECRET=SXXXXXX...
STELLAR_NETWORK=testnet
SOROBAN_RPC_HOST=https://soroban-testnet.stellar.org
SOROBAN_FRIENDBOT_URL=https://friendbot.stellar.org

# API Configuration
API_PORT=3001
API_URL=https://api.earnify.com
CORS_ORIGIN=https://earnify.vercel.app
```

### Secrets Management

**Store securely:**
- `STELLAR_ADMIN_SECRET` - Never commit
- `DATABASE_URL` - Use platform's secret manager
- JWT secrets
- API keys

Use platform-specific secret management:
- **Vercel:** Environment variables (encrypted)
- **Render:** Secret files
- **Railway:** Environment variables

---

## Post-Deployment Setup

### 1. Database Migrations

After backend deployment:

```bash
# Via Render/Railway shell or SSH
DATABASE_URL="prod-connection-string" ./scripts/db-deploy.sh
```

Or add to deployment scripts automatically:

**Render pre-deployment script:**
```bash
#!/bin/bash
set -euo pipefail
export DATABASE_URL="${DATABASE_URL}"
./scripts/db-deploy.sh
pnpm --filter @earnify/db db:seed
```

### 2. Contract Deployment

For production deployment:

```bash
export STELLAR_ADMIN_SECRET="your-production-secret"
export STELLAR_NETWORK="public"  # or "testnet"
./scripts/deploy-contract.sh
```

Store returned `SOROBAN_CONTRACT_ID` in backend environment variables.

### 3. Verify Deployments

**Frontend:**
```bash
curl https://earnify.vercel.app
# Check 200 response
```

**Backend:**
```bash
curl https://api.earnify.com/health
# Should return health status
```

**Database:**
```bash
# From backend shell
psql $DATABASE_URL -c "SELECT version();"
```

### 4. Setup Domain Names

- **Frontend:** `earnify.com` → Vercel
- **Backend:** `api.earnify.com` → Render/Railway
- Configure DNS records (A, CNAME as needed)

### 5. Enable Monitoring

- **Vercel:** Built-in analytics & error tracking
- **Render/Railway:** Monitor resource usage
- **Database:** Neon dashboard for query performance
- **Contracts:** Stellar testnet explorer for transactions

---

## Troubleshooting

### Backend Build Fails

**Problem:** "Cannot find contracts"
**Solution:** 
- Ensure `contracts/` directory is included in deployment
- Check `.renderignore`/`.railwayignore` - don't exclude contracts/

**Problem:** "Prisma not found"
**Solution:**
```bash
pnpm --filter @earnify/db db:generate
# Before deployment
```

### Contract Deployment Fails

**Problem:** "stellar CLI not found"
**Solution:**
- Backend build must not require CLI
- Move contract deployment to separate CI/CD job
- Or: Cache Stellar CLI in build

### Database Connection Error

**Problem:** "Cannot connect to DATABASE_URL"
**Solution:**
- Verify connection string format
- Check PostgreSQL is public/accessible
- Verify Neon firewall rules
- Test locally: `psql $DATABASE_URL`

### Vercel Build Fails

**Problem:** "Could not find apps/web"
**Solution:**
```
Root Directory: apps/web
Build Command: pnpm build
Output Directory: .next
```

---

## CI/CD Pipeline Recommendation

Add GitHub Actions for automated deployment:

**.github/workflows/deploy.yml:**
```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v3
        with:
          node-version: 18
          cache: 'pnpm'
      
      - run: pnpm install
      - run: pnpm build
      
      # Deploy frontend
      - uses: vercel/action@master
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          scope: ${{ secrets.VERCEL_ORG_ID }}
      
      # Deploy backend (Render)
      - run: curl ${{ secrets.RENDER_DEPLOY_HOOK }}
```

---

## Security Checklist

- [ ] Database backups enabled
- [ ] Environment variables use secrets manager
- [ ] CORS properly configured
- [ ] Rate limiting enabled
- [ ] SSL/TLS certificates valid
- [ ] Database has SSL required
- [ ] API authentication tokens secured
- [ ] Contract deployment keys separate from code
- [ ] Monitoring & alerts configured
- [ ] Error logs don't expose secrets

---

## Next Steps

1. Set up Neon Postgres database
2. Deploy frontend to Vercel
3. Deploy backend to Render/Railway
4. Configure environment variables
5. Run database migrations
6. Deploy Soroban contract to testnet
7. Test end-to-end workflow
8. Set up monitoring & backups
9. Configure custom domains
10. Enable CI/CD

