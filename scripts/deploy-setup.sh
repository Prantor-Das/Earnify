#!/usr/bin/env bash
# Quick deployment setup script
# This automates some of the initial setup steps

set -euo pipefail

echo "🚀 Earnify Deployment Setup"
echo "============================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Step 1: Validate environment
echo -e "${BLUE}Step 1: Validating environment${NC}"
echo ""

if ! command -v pnpm &> /dev/null; then
    echo -e "${RED}✗ pnpm not found. Install with: npm install -g pnpm@10.33.0${NC}"
    exit 1
fi
echo -e "${GREEN}✓ pnpm installed${NC}"

if ! command -v node &> /dev/null; then
    echo -e "${RED}✗ Node.js not found. Install Node.js 18+${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Node.js installed${NC}"

# Step 2: Validate contracts
echo ""
echo -e "${BLUE}Step 2: Validating contracts${NC}"
node scripts/validate-contracts.js || exit 1

# Step 3: Check for environment variables
echo ""
echo -e "${BLUE}Step 3: Checking environment variables${NC}"

if [[ ! -f ".env" && ! -f ".env.local" ]]; then
    echo -e "${YELLOW}⚠ No .env file found${NC}"
    echo "Copy .env.example to .env and fill in your secrets:"
    echo "  cp .env.example .env"
    echo ""
fi

# Database check
if [[ -z "${DATABASE_URL:-}" ]]; then
    if grep -q "^DATABASE_URL=" .env 2>/dev/null; then
        export DATABASE_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)"
    fi
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
    echo -e "${YELLOW}⚠ DATABASE_URL not set${NC}"
    echo "Set it in your .env file or export it:"
    echo "  export DATABASE_URL='your-neon-connection-string'"
else
    echo -e "${GREEN}✓ DATABASE_URL configured${NC}"
fi

# Stellar check
if [[ -z "${STELLAR_ADMIN_SECRET:-}" ]]; then
    if grep -q "^STELLAR_ADMIN_SECRET=" .env 2>/dev/null; then
        STELLAR_ADMIN_SECRET="$(grep '^STELLAR_ADMIN_SECRET=' .env | cut -d= -f2-)"
    fi
fi

if [[ -z "${STELLAR_ADMIN_SECRET:-}" ]]; then
    echo -e "${YELLOW}⚠ STELLAR_ADMIN_SECRET not set${NC}"
    echo "Will be needed for contract deployment"
else
    echo -e "${GREEN}✓ STELLAR_ADMIN_SECRET configured${NC}"
fi

# Step 4: Offer deployment options
echo ""
echo -e "${BLUE}Step 3: Choose deployment target${NC}"
echo ""
echo "Available options:"
echo "  1) Prepare for Vercel (Frontend)"
echo "  2) Prepare for Render (Backend)"
echo "  3) Prepare for Railway (Backend)"
echo "  4) Both Vercel + Render"
echo "  5) Both Vercel + Railway"
echo "  6) All (Vercel + DB + Render + Contracts)"
echo "  0) Skip"
echo ""

read -p "Enter choice (0-6): " choice || choice="0"

case $choice in
    1)
        echo -e "${BLUE}📦 Vercel Frontend Setup${NC}"
        echo "1. Go to https://vercel.com"
        echo "2. Import repository"
        echo "3. Set root directory to: apps/web"
        echo "4. Build: pnpm build"
        echo "5. Output: .next"
        echo ""
        echo "Environment variables:"
        echo "  NEXT_PUBLIC_API_BASE_URL: https://api.earnify.com"
        ;;
    2)
        echo -e "${BLUE}📦 Render Backend Setup${NC}"
        echo "1. Go to https://render.com"
        echo "2. New Web Service → GitHub"
        echo "3. Import repository"
        echo "4. Name: earnify-api"
        echo "5. Build: pnpm install && pnpm --filter @earnify/db db:generate && pnpm build"
        echo "6. Start: pnpm --filter @earnify/api start"
        echo ""
        echo "Use render.yaml config in project root"
        ;;
    3)
        echo -e "${BLUE}📦 Railway Backend Setup${NC}"
        echo "1. Go to https://railway.app"
        echo "2. New Project → GitHub repo"
        echo "3. Framework detection should pick up Node.js"
        echo "4. Check railway.json config"
        echo ""
        echo "Start command: pnpm --filter @earnify/api start"
        ;;
    4)
        echo -e "${BLUE}📦 Vercel + Render Setup${NC}"
        echo "See options 1 and 2 above"
        ;;
    5)
        echo -e "${BLUE}📦 Vercel + Railway Setup${NC}"
        echo "See options 1 and 3 above"
        ;;
    6)
        echo -e "${BLUE}📦 Full Stack Deployment${NC}"
        echo ""
        echo "Phase 1: Database"
        echo "  1. Create Neon account: https://neon.tech"
        echo "  2. Get connection string"
        echo "  3. Set DATABASE_URL in .env"
        echo "  4. Run: ./scripts/db-deploy.sh"
        echo ""
        echo "Phase 2: Frontend (Vercel)"
        echo "  1. Go to https://vercel.com → Import"
        echo "  2. Root: apps/web"
        echo "  3. Env: NEXT_PUBLIC_API_BASE_URL"
        echo ""
        echo "Phase 3: Backend (Render/Railway)"
        echo "  1. Choose platform, connect GitHub"
        echo "  2. Set all environment variables"
        echo "  3. Deploy"
        echo ""
        echo "Phase 4: Contracts"
        echo "  1. Ensure Rust + Stellar CLI installed"
        echo "  2. Run: ./scripts/deploy-contract.sh"
        echo "  3. Save contract ID in backend env"
        ;;
    *)
        echo "Skipping deployment setup"
        ;;
esac

echo ""
echo -e "${GREEN}✓ Setup complete!${NC}"
echo ""
echo "📚 For detailed instructions, see DEPLOYMENT.md"
echo "📋 Use DEPLOYMENT_CHECKLIST.md to track progress"
echo ""
