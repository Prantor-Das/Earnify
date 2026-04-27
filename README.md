# Earnify

**Turn Social Media Marketing Into Fair, Transparent Earnings**

[![Stellar](https://img.shields.io/badge/Blockchain-Stellar-purple)](https://stellar.org)

> A decentralized platform that transforms social media marketing into a fair earning opportunity. Founders deposit marketing budgets on Stellar blockchain, creators promote products on social platforms, and automated smart contracts distribute earnings based on engagement - no middlemen, complete transparency.

---

## Table of Contents

- [Overview](#-overview)
- [Key Features](#-key-features)
- [Architecture](#-architecture)
- [Tech Stack](#-tech-stack)
- [Getting Started](#-getting-started)
- [Live Demo](#-live-demo)
- [Demo Video](#-demo-video)
- [User Wallets](#-verified-user-wallets)
- [User Feedback](#-user-feedback)
- [Future Roadmap](#-future-roadmap-based-on-user-feedback)
- [Smart Contract Details](#-smart-contract-details)
- [API Documentation](#-api-documentation)
- [Contributing](#-contributing)

---

## Overview

### The Problem

Traditional social media marketing is broken:
- **Influencers:** Opaque pricing, fake followers, unpredictable ROI
- **Creators:** Unfair payment structures, delayed payouts, platform fees
- **Founders:** Difficulty measuring authentic engagement, high agency costs

### Our Solution

Earnify creates a **transparent, performance-based marketing ecosystem** where:

1. **Founders** deposit campaign budgets into Stellar smart contracts
2. **Creators** post authentic content on their social channels
3. **Smart algorithms** track real engagement (likes, shares, comments, views)
4. **Blockchain** automatically distributes earnings based on performance
5. **Everyone wins** with zero middleman fees and complete transparency

### How It Works

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│   Founder   │────────>│   Campaign   │<────────│   Creator   │
│  (Deposit)  │         │ Smart Contract│         │   (Post)    │
└─────────────┘         └──────────────┘         └─────────────┘
       │                        │                        │
       │                        │                        │
       ▼                        ▼                        ▼
  Budget Locked          Engagement Track          Content Created
  (Stellar)              (AI Verification)         (X/LinkedIn/IG)
       │                        │                        │
       └────────────────────────┴────────────────────────┘
                                │
                                ▼
                      Automated Payout Distribution
                    (Proportional to Engagement)
```

---

## Key Features

### For Creators

- **Fair Earnings:** Get paid based on actual engagement, not follower count
- **Instant Payouts:** Automated smart contract distributions
- **Live Tracking:** Real-time dashboard showing your performance
- **Transparent:** Every transaction visible on Stellar blockchain
- **Global Access:** Anyone with a social account can participate

### For Founders

- **Budget Control:** Set campaign budgets with precision
- **Real Metrics:** Track authentic engagement, not vanity metrics
- **Brand Guidelines:** Specify content requirements and platforms
- **Fraud Prevention:** AI-powered verification detects fake engagement
- **Low Costs:** No agency fees or middleman commissions

### Platform Features

- **AI Verification:** Detects AI-generated content and fake engagement
- **Leaderboards:** Gamified rankings motivate quality content
- **Multi-Platform:** Supports X (Twitter), LinkedIn, Instagram
- **Responsive Design:** Works seamlessly on desktop and mobile
- **Real-Time Updates:** WebSocket notifications for campaign changes
- **Advanced Analytics:** Comprehensive dashboards for all users

---

## Architecture

### System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                             │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │           Next.js 15 (App Router + Server Actions)       │  │
│  │  ┌────────────┐  ┌──────────────┐  ┌─────────────────┐  │  │
│  │  │  Campaign  │  │   Creator    │  │     Founder     │  │  │
│  │  │   Browser  │  │  Dashboard   │  │    Dashboard    │  │  │
│  │  └────────────┘  └──────────────┘  └─────────────────┘  │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTPS / WebSocket
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      API LAYER (Express)                        │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Authentication  │  Campaign Routes  │  Post Verification │  │
│  │  (Passport OAuth)│  (CRUD Operations)│  (Content Tracking)│  │
│  └──────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │           Business Logic & Services                       │  │
│  │  • Engagement Fetcher    • AI Detection (Groq LLM)       │  │
│  │  • Scoring Engine        • Verification Engine           │  │
│  │  • Payout Service        • Leaderboard Service           │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │                   │
                    ▼                   ▼
┌──────────────────────────┐  ┌────────────────────────┐
│    DATABASE LAYER        │  │   BLOCKCHAIN LAYER     │
│  ┌────────────────────┐  │  │  ┌──────────────────┐  │
│  │   PostgreSQL       │  │  │  │ Stellar Testnet  │  │
│  │   (Neon Cloud)     │  │  │  │                  │  │
│  │   • Users          │  │  │  │ Soroban Smart    │  │
│  │   • Campaigns      │  │  │  │ Contracts        │  │
│  │   • Posts          │  │  │  │                  │  │
│  │   • Transactions   │  │  │  │ • Budget Lock    │  │
│  │   • Engagement     │  │  │  │ • Payout Dist.   │  │
│  └────────────────────┘  │  │  │ • Verification   │  │
│                          │  │  └──────────────────┘  │
│     Prisma ORM           │  │                        │
└──────────────────────────┘  └────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                    BACKGROUND JOBS                              │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  • Engagement Cron (Fetch social metrics every 6 hours)  │  │
│  │  • Payout Processor (Calculate & distribute earnings)    │  │
│  │  • AI Fraud Detection (Verify content authenticity)      │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                  EXTERNAL SERVICES                              │
│  • X (Twitter) API       • LinkedIn API      • Instagram Graph │
│  • Groq LLM (AI)         • Redis (Cache)     • Stellar RPC    │
└─────────────────────────────────────────────────────────────────┘
```

### Database Schema (Prisma)

```prisma
model User {
  id              String    @id @default(cuid())
  email           String    @unique
  name            String?
  role            Role      @default(USER)
  stellarAddress  String?   @unique
  campaigns       Campaign[]
  posts           Post[]
  createdAt       DateTime  @default(now())
}

model Campaign {
  id                String    @id @default(cuid())
  title             String
  description       String
  budget            Float
  remainingBudget   Float
  startDate         DateTime
  endDate           DateTime
  status            CampaignStatus
  platforms         Platform[]
  contractId        String?   @unique
  contractHash      String?
  founderId         String
  founder           User      @relation(fields: [founderId], references: [id])
  posts             Post[]
  guidelines        Json?
  createdAt         DateTime  @default(now())
}

model Post {
  id              String    @id @default(cuid())
  url             String    @unique
  platform        Platform
  content         String?
  views           Int       @default(0)
  likes           Int       @default(0)
  shares          Int       @default(0)
  comments        Int       @default(0)
  engagementScore Float     @default(0)
  isVerified      Boolean   @default(false)
  aiCheckPassed   Boolean   @default(false)
  earningAmount   Float     @default(0)
  payoutStatus    PayoutStatus @default(PENDING)
  campaignId      String
  campaign        Campaign  @relation(fields: [campaignId], references: [id])
  userId          String
  user            User      @relation(fields: [userId], references: [id])
  createdAt       DateTime  @default(now())
}

enum Role {
  USER
  FOUNDER
  ADMIN
}

enum CampaignStatus {
  DRAFT
  ACTIVE
  PAUSED
  COMPLETED
  CANCELLED
}

enum Platform {
  TWITTER
  LINKEDIN
  INSTAGRAM
}

enum PayoutStatus {
  PENDING
  PROCESSING
  COMPLETED
  FAILED
}
```

### Smart Contract Architecture (Soroban)

**Contract: `earnify-campaign`**

```rust
// Core Functions
pub fn initialize(env: Env, admin: Address) -> Result<(), Error>
pub fn create_campaign(
    env: Env,
    campaign_id: String,
    budget: i128,
    founder: Address
) -> Result<(), Error>
pub fn submit_post(
    env: Env,
    campaign_id: String,
    post_id: String,
    creator: Address,
    engagement_score: u32
) -> Result<(), Error>
pub fn distribute_payout(
    env: Env,
    campaign_id: String,
    post_id: String,
    amount: i128
) -> Result<(), Error>
pub fn get_campaign_balance(
    env: Env,
    campaign_id: String
) -> Result<i128, Error>

// Data Structures
struct Campaign {
    id: String,
    founder: Address,
    total_budget: i128,
    remaining_budget: i128,
    status: CampaignStatus,
}

struct Post {
    id: String,
    campaign_id: String,
    creator: Address,
    engagement_score: u32,
    payout_amount: i128,
    verified: bool,
}
```

### Data Flow

**Campaign Creation Flow:**
```
User (Founder) → Frontend → API → Database → Soroban Contract
                                      ↓
                                 Budget Locked
                                      ↓
                                Campaign Active
```

**Engagement & Payout Flow:**
```
Creator Posts → API Receives URL → Engagement Fetcher
                                         ↓
                              Scrape Social Platform
                                         ↓
                              AI Verification (Groq)
                                         ↓
                              Scoring Engine
                                         ↓
                              Update Database
                                         ↓
                          Payout Service (Every 24h)
                                         ↓
                          Soroban Contract Distribution
                                         ↓
                          XLM Sent to Creator Wallet
```

---

## Tech Stack

### Frontend
- **Framework:** Next.js 16 (App Router)
- **Language:** TypeScript
- **Styling:** TailwindCSS + Custom Design System
- **State Management:** React Context + Server Actions
- **Blockchain:** Stellar SDK (Freighter Wallet)
- **Real-time:** Socket.IO Client
- **Forms:** React Hook Form + Zod Validation

### Backend
- **Runtime:** Node.js 20+
- **Framework:** Express 5
- **Language:** TypeScript
- **Authentication:** Passport.js (Google OAuth 2.0)
- **Database ORM:** Prisma
- **Caching:** Upstash Redis
- **Jobs:** Node-Cron
- **WebSockets:** Socket.IO

### Blockchain
- **Network:** Stellar (Testnet for MVP)
- **Smart Contracts:** Soroban (Rust)
- **SDK:** @stellar/stellar-sdk v13
- **Wallet:** Freighter Integration

### Database & Storage
- **Primary DB:** PostgreSQL (Neon)
- **Caching:** Redis (Upstash)
- **File Storage:** Cloudinary / AWS S3 (future)

### External APIs
- **AI/ML:** Groq LLM (Content Verification)
- **Social APIs:**
  - X (Twitter) API v2
  - LinkedIn API
  - Instagram Graph API
- **Web Scraping:** Cheerio + Axios

### DevOps & Deployment
- **Package Manager:** pnpm (Monorepo)
- **Monorepo Tool:** pnpm Workspaces
- **CI/CD:** GitHub Actions
- **Hosting:**
  - Frontend: Vercel
  - Backend: Vercel Functions / Railway / Render
  - Database: Neon
- **Monitoring:** Sentry (Error Tracking)

---

## Getting Started

### Prerequisites

- **Node.js:** v20 or higher
- **pnpm:** v10.33.0+ (install via `npm install -g pnpm`)
- **PostgreSQL:** Database URL (we use Neon)
- **Rust:** For Soroban contracts (install via [rustup](https://rustup.rs/))
- **Stellar CLI:** `cargo install --locked stellar-cli --features opt`
- **Stellar Account:** Testnet account with XLM

### Installation

1. **Clone Repository**
```bash
git clone https://github.com/yourusername/earnify.git
cd earnify
```

2. **Install Dependencies**
```bash
pnpm install
```

3. **Setup Environment Variables**
```bash
cp .env.example .env
```

Edit `.env` with your credentials:
```env
# Database
DATABASE_URL="postgresql://user:password@host:5432/earnify?sslmode=require"

# Stellar
STELLAR_NETWORK="testnet"
STELLAR_ADMIN_SECRET="S..."
STELLAR_HORIZON_URL="https://horizon-testnet.stellar.org"
STELLAR_SOROBAN_RPC_URL="https://soroban-testnet.stellar.org"
SOROBAN_CONTRACT_ID="C..." # Project default/test contract id (set by deploy script)

# OAuth
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
NEXTAUTH_SECRET="your-secret-key"

# Redis
UPSTASH_REDIS_URL="your-redis-url"
UPSTASH_REDIS_TOKEN="your-redis-token"

# Social APIs
TWITTER_API_KEY="your-twitter-key"
LINKEDIN_API_KEY="your-linkedin-key"
INSTAGRAM_API_KEY="your-instagram-key"

# AI
GROQ_API_KEY="your-groq-api-key"

# App
NEXT_PUBLIC_API_URL="http://localhost:5000"
PORT=5000
```

4. **Run Setup Script**
```bash
chmod +x scripts/setup.sh
./scripts/setup.sh
```

This will:
- Generate Prisma client
- Run database migrations
- Seed initial data
- Start development servers

5. **Deploy Smart Contract** (Optional - for testing)
```bash
chmod +x scripts/deploy-contract.sh
./scripts/deploy-contract.sh
```

### Development Commands

```bash
# Start all services (API + Web)
pnpm dev

# Start frontend only
pnpm dev:web

# Start backend only
pnpm dev:api

# Build for production
pnpm build

# Database operations
pnpm db:generate    # Generate Prisma client
pnpm db:migrate     # Run migrations
pnpm db:seed        # Seed database

# Smart contract
pnpm soroban:invoke <contractId> <method> <secret> '["arg1", arg2]'
```

### Project Structure

```
earnify/
├── apps/
│   ├── api/                 # Express backend
│   │   ├── src/
│   │   │   ├── routes/      # API endpoints
│   │   │   ├── services/    # Business logic
│   │   │   ├── jobs/        # Cron jobs
│   │   │   └── middleware/  # Auth, error handling
│   │   └── package.json
│   └── web/                 # Next.js frontend
│       ├── app/             # App router pages
│       ├── components/      # React components
│       ├── styles/          # Global styles
│       └── package.json
├── contracts/
│   └── earnify-campaign/    # Soroban smart contracts
│       └── src/lib.rs
├── packages/
│   ├── db/                  # Prisma schema & migrations
│   │   └── prisma/
│   └── shared/              # Shared types & utilities
├── scripts/                 # Deployment & setup scripts
└── package.json
```

---

## Live Demo

**Platform URL:** []()

**Deployment Details:**
- **Frontend:** Deployed on Vercel (Next.js App)
- **Backend API:** Deployed on Vercel Functions
- **Database:** PostgreSQL on Neon
- **Blockchain:** Stellar Testnet
- **Smart Contracts:** Soroban (Stellar)

**Test Credentials:**
- Role: Creator/Founder (OAuth via Google)
- Network: Stellar Testnet
- Explorer: [Stellar Expert](https://stellar.expert/explorer/testnet)

---

## Demo Video

**Full MVP Demo:** [Watch on YouTube]()

**Walkthrough Includes:**
1. Creator registration & wallet connection
2. Founder campaign creation with budget deposit
3. Posting content on X/LinkedIn/Instagram
4. Real-time engagement tracking
5. Leaderboard & analytics dashboard
6. Automated payout distribution

---

## Verified User Wallets

Below are 5+ verified Stellar testnet wallet addresses.

- `GBJUG47XA3RMURCIXWSR3JGPVIFQRJRBW7WF5SNKHZ33IO3IC53B7G4C`
- `GBZOOB75QVA2S2FWMJDWIYDQPXF6TKL5OJKMEIR3MVNQ5RFKLKJBCSFN`
- `GBXNK7OB3RZ7GFLYRMB6HEQELYFXO24KICDUXT24CFE3XS7MMVMEXBUK`
- `GBI5CUCM23XS3Q3T534XKTR5QAFPUIZ6U6SRZFB7ADGWOLRD7PKLOSWP`
- `GAIH3ULLFQ4DGSECF2AR555KZ4KNDGEKN4AFI4SU2M7B43MGK3QJZNSR`
- `GCRZFG2VFVFRP5454SMUETCNXHWI2DIMVTPF7YAHCCKQTVV64VXLEAIO`

**Smart Contract Address:**
- **Contract ID:** `CBPHL5FJUTF4MFG46LMIM6QB6CCSQYPECB7XPF2LTWXL4LWRQEYXRTJN`
- **Campaign Contract ID(example):** `CC6XIDL2Y4653227FROEM2YX7Y5ANZBNMCAFQ4JHCZ7QY5M53DAYUZF5`
- Each campaign has a different contract ID
---

## User Feedback

**Feedback Report:** [View on Google Docs →](https://docs.google.com/spreadsheets/d/1-Q9381iqetqjVIQmu8F8rM13YSdMmEJNq9iHOGsi-KA/edit?usp=sharing)

## Future Roadmap & Development Plans
 
Our roadmap focuses on scaling the platform, enhancing user experience, and expanding blockchain capabilities.
 
#### 1. Platform Expansion & Integrations  
Broaden support beyond current social platforms.  
**Key Features:**  
- TikTok, YouTube, Reddit, Medium/Substack integrations  
- Unified engagement tracking across platforms  
- Standardized real-time webhook system  
**Expected Impact:** 3x platform coverage, expanded creator ecosystem  

#### 2. Performance & Real-Time Infrastructure  
Upgrade backend for faster, scalable performance.  
**Key Features:**  
- Event-driven architecture and microservices  
- Live dashboard updates with SSE/WebSockets  
- Redis caching, CDN, and database optimization  
**Expected Impact:** 90% lower latency, real-time engagement tracking  

#### 3. AI-Powered Automation  
Use AI/ML to improve matching, fraud detection, and insights.  
**Key Features:**  
- Smart campaign-creator matching  
- Fraud detection and compliance automation  
- Predictive analytics for earnings/content performance  
**Expected Impact:** Better campaign quality and higher fraud prevention accuracy  

#### 4. Blockchain, Mobile & Enterprise Growth  
Expand platform accessibility and monetization.  
**Key Features:**  
- Native mobile apps for iOS/Android  
- Utility token and governance launch  
- Multi-chain wallet/blockchain support  
- White-label enterprise platform  
**Expected Impact:** Higher user retention, enterprise adoption, Web3 market expansion  
---

## Smart Contract Details

### Contract Functions

**View Functions (No Transaction Fees):**
```typescript
// Get campaign details
getCampaign(campaignId: string): Campaign

// Get creator earnings
getCreatorEarnings(creatorAddress: string, campaignId: string): number

// Get total payouts distributed
getTotalPayouts(campaignId: string): number
```

**State-Changing Functions (Requires Gas):**
```typescript
// Initialize contract
initialize(admin: Address)

// Create new campaign
createCampaign(
  campaignId: string,
  budget: number,
  founderAddress: Address
)

// Submit post for payout
submitPost(
  campaignId: string,
  postId: string,
  creatorAddress: Address,
  engagementScore: number
)

// Distribute earnings
distributePayout(
  campaignId: string,
  postId: string,
  amount: number
)

// Withdraw remaining budget (founder only)
withdrawRemainingBudget(campaignId: string)

// Pause/Resume campaign (admin only)
pauseCampaign(campaignId: string)
resumeCampaign(campaignId: string)
```

### Contract Security

- **Access Control:** Role-based permissions (admin, founder, creator)
- **Reentrancy Protection:** Checks-Effects-Interactions pattern
- **Integer Overflow:** Safe math operations
- **Emergency Pause:** Admin can halt contract in case of exploit
- **Immutable Logic:** Core payout algorithm cannot be changed

---

## API Documentation

### Base URL
```
Production: https://api.earnify.app
Testnet: https://api-testnet.earnify.app
Local: http://localhost:3000
```

### Authentication

All protected endpoints require JWT token:
```http
Authorization: Bearer <your_jwt_token>
```

### Endpoints

#### Authentication

**POST** `/auth/google`
```json
// Login via Google OAuth
Response: {
  "user": { "id", "email", "name", "role", "stellarAddress" },
  "token": "jwt_token"
}
```

**POST** `/auth/logout`
```json
// Logout user (clears session)
Response: { "success": true }
```

---

#### Campaigns

**GET** `/campaigns`
```http
Query Params:
  - status: active|completed|paused
  - platform: twitter|linkedin|instagram
  - limit: number (default 20)
  - offset: number (default 0)

Response: {
  "campaigns": [...],
  "total": 150,
  "page": 1
}
```

**GET** `/campaigns/:id`
```json
// Get campaign details
Response: {
  "id", "title", "description", "budget",
  "remainingBudget", "status", "platforms",
  "founder", "posts", "analytics"
}
```

**POST** `/campaigns` (Founder only)
```json
Request: {
  "title": "Launch Campaign for Product X",
  "description": "...",
  "budget": 5000,
  "platforms": ["twitter", "linkedin"],
  "startDate": "2026-05-01",
  "endDate": "2026-05-31",
  "guidelines": { "hashtags": ["#ProductX"], "mentions": ["@ProductX"] }
}

Response: {
  "campaign": {...},
  "contractId": "CBQH...",
  "txHash": "abc123..."
}
```

**PATCH** `/campaigns/:id` (Founder only)
```json
// Update campaign (only if not started)
Request: { "title": "New Title" }
Response: { "campaign": {...} }
```

---

#### Posts

**GET** `/posts`
```http
Query Params:
  - campaignId: string
  - userId: string
  - status: verified|pending|rejected
  - sortBy: earnings|engagement|date

Response: {
  "posts": [...],
  "total": 50
}
```

**POST** `/posts`
```json
// Submit post for campaign
Request: {
  "campaignId": "cm123",
  "url": "https://twitter.com/user/status/123",
  "platform": "twitter"
}

Response: {
  "post": {...},
  "status": "pending_verification"
}
```

**GET** `/posts/:id/engagement`
```json
// Get live engagement metrics
Response: {
  "views": 1500,
  "likes": 230,
  "shares": 45,
  "comments": 18,
  "engagementScore": 1793,
  "lastUpdated": "2026-04-26T10:30:00Z"
}
```

---

#### Dashboard

**GET** `/dashboard/creator`
```json
// Creator dashboard stats
Response: {
  "totalEarnings": 450.5,
  "activePosts": 8,
  "pendingPayouts": 125.0,
  "completedPayouts": 325.5,
  "topPosts": [...],
  "recentActivity": [...]
}
```

**GET** `/dashboard/founder`
```json
// Founder dashboard stats
Response: {
  "totalSpent": 12500,
  "activeCampaigns": 3,
  "totalReach": 150000,
  "engagementRate": 0.045,
  "topCampaigns": [...],
  "recentPosts": [...]
}
```

---

#### Leaderboard

**GET** `/leaderboard`
```http
Query Params:
  - period: daily|weekly|monthly|all-time
  - campaignId: string (optional)
  - limit: number (default 100)

Response: {
  "leaderboard": [
    { "rank": 1, "user": {...}, "earnings": 580, "posts": 15 },
    ...
  ]
}
```

---

## Contributing

We welcome contributions! Please see our [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Development Workflow

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

### Code Standards

- **TypeScript:** Strict mode enabled
- **Linting:** ESLint + Prettier
- **Testing:** Minimum 70% coverage for new features
- **Commits:** Conventional Commits format

---

## License

This project is licensed under the **MIT License** - see [LICENSE](LICENSE) file.

---

## Acknowledgments

- **Stellar Development Foundation** for blockchain infrastructure
- **Soroban** team for smart contract framework
- **Early users** who provided invaluable feedback
- **Open source community** for amazing tools

---

**Report Bugs:** [GitHub Issues](https://github.com/yourusername/earnify/issues)

---

<div align="center">

**Built with ❤️ by the Earnify Team**

[![Stellar](https://img.shields.io/badge/Powered%20by-Stellar-purple?style=for-the-badge)](https://stellar.org)
[![Soroban](https://img.shields.io/badge/Smart%20Contracts-Soroban-blue?style=for-the-badge)](https://soroban.stellar.org)

[⬆ Back to Top](#earnify-)

</div>
