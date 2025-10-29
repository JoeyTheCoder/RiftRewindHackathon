# That's My Duo - AWS Deployment Summary

## Project Overview
**That's My Duo** is a League of Legends companion application that analyzes player match history and duo synergy using AI. It's a full-stack monorepo application built for the Rift Rewind Hackathon 2025.

## Architecture Summary

### **Backend (Node.js/Express)**
- **Location**: `packages/backend/`
- **Runtime**: Node.js >=18.0.0
- **Port**: 3000 (configurable via `PORT` env var)
- **Key Dependencies**:
  - express 5.1.0
  - axios (Riot API integration)
  - cors
  - dotenv (environment configuration)
  - uuid (job management)

### **Frontend (Angular 19)**
- **Location**: `packages/frontend/`
- **Framework**: Angular 19.2 with Tailwind CSS 4.1
- **Dev Port**: 4200
- **Build Output**: `dist/duo-frontend/`
- **Proxy**: Routes `/api/*` to backend (localhost:3000)

### **Package Management**
- PNPM workspace (>=8.0.0)
- Monorepo structure with workspace-level scripts

## Key AWS Deployment Requirements

### 1. **Environment Variables (Backend)**
Critical environment variables that must be configured:

```env
# Required
RIOT_API_KEY=RGAPI-xxxxx          # Riot Games API key (REQUIRED)

# Server Configuration
PORT=3000                          # Backend port
NODE_ENV=production                # Environment mode

# CORS Configuration
FRONTEND_URL=https://your-frontend-domain.com  # Frontend URL for CORS

# Data Storage
DATA_DIR=./data                    # Local data storage directory
```

**⚠️ Security Note**: The application will fail to start without `RIOT_API_KEY`. Store this securely using AWS Secrets Manager or Parameter Store.

### 2. **Data Storage Architecture**
The backend currently uses **local filesystem storage** with the following structure:
```
data/
├── jobs/           # Job status tracking (JSON files)
├── temp/           # Temporary match data per job
│   └── {jobId}/
│       ├── account_*.json
│       ├── matches_*.json
│       ├── summoner_*.json
│       └── summary.player.json
└── EUW/            # Cached player data by region
```

**AWS Consideration**: This requires persistent storage. Options:
- **EFS (Elastic File System)**: For shared filesystem across instances
- **EBS Volumes**: For single-instance deployments
- **S3**: Refactor to use object storage (recommended for scalability)

### 3. **API Endpoints**
The backend exposes these REST endpoints:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/test` | GET | Health check |
| `/api/start` | POST | Start player data fetch job |
| `/api/status/:jobId` | GET | Get job status |
| `/api/result/:jobId` | GET | Get player summary |
| `/api/duo/:puuidA/:puuidB` | GET | Get duo synergy analysis |

### 4. **External Dependencies**
- **Riot Games API**: Backend makes extensive API calls to:
  - Account-v1 (PUUID resolution)
  - Summoner-v4 (summoner data)
  - Match-v5 (match history)
  - League-v4 (ranked data)
- **Rate Limits**: Subject to Riot API rate limits (consider API Gateway throttling)

### 5. **Compute Requirements**
- **Backend**: 
  - CPU: Moderate (match data processing)
  - Memory: 512MB-1GB minimum (processes large JSON match arrays)
  - Async job processing (non-blocking)
- **Frontend**:
  - Static files after build (~500KB-1MB)
  - Can be served from S3 + CloudFront

### 6. **Platform-Specific Considerations**
⚠️ **Windows/WSL Dependency**: The current backend implementation uses WSL commands (`wsl ls`, `wsl cat`) for file operations. This is a **critical blocker** for Linux-based AWS deployments.

**Required Changes for AWS**:
- Refactor `utils/summaryGenerator.js` (lines 23-73)
- Refactor `utils/duoSummaryGenerator.js` (lines 17-44)
- Replace `execSync('wsl ...')` with standard Node.js `fs` operations

## Recommended AWS Architecture

### **Option 1: Serverless (Recommended)**
```
┌─────────────────────────────────────────────────────────┐
│  CloudFront CDN                                         │
│  ├─ Static Assets (S3) ──► Angular Frontend            │
│  └─ /api/* ──► API Gateway                             │
│                   │                                      │
│                   ├─ Lambda (Start Job)                 │
│                   ├─ Lambda (Get Status)                │
│                   ├─ Lambda (Get Result)                │
│                   └─ Lambda (Duo Analysis)              │
│                              │                           │
│                              ├─ DynamoDB (Job Tracking) │
│                              ├─ S3 (Match Data Storage) │
│                              └─ Secrets Manager (API Key)│
└─────────────────────────────────────────────────────────┘
```

**Benefits**:
- Auto-scaling
- Pay-per-request pricing
- No server management
- Built-in high availability

**Changes Required**:
1. Refactor job management to use DynamoDB instead of local JSON files
2. Replace filesystem storage with S3
3. Remove WSL dependencies
4. Split Express routes into Lambda handlers

### **Option 2: Container-Based (ECS/Fargate)**
```
┌─────────────────────────────────────────────────────────┐
│  ALB (Application Load Balancer)                        │
│  ├─ /api/* ──► ECS Service (Fargate)                   │
│  │             └─ Backend Container                     │
│  │                ├─ EFS Mount (/data)                  │
│  │                └─ Secrets Manager (API Key)          │
│  │                                                       │
│  └─ /* ──► S3 + CloudFront ──► Frontend                │
└─────────────────────────────────────────────────────────┘
```

**Benefits**:
- Minimal code changes
- Easier migration path
- Container portability

**Requirements**:
1. Create Dockerfile for backend
2. Setup EFS for persistent storage
3. Configure ALB health checks
4. Remove WSL dependencies

### **Option 3: EC2 with Load Balancer**
Simple lift-and-shift approach, but requires more operational overhead.

## Pre-Deployment Checklist

### **Code Changes Required**
- [ ] Remove WSL dependencies from file operations
- [ ] Add Dockerfile for backend (if using containers)
- [ ] Configure production build for Angular frontend
- [ ] Update CORS configuration for production URLs
- [ ] Implement proper error handling and logging
- [ ] Add health check endpoint enhancements

### **Infrastructure Setup**
- [ ] Choose AWS region (consider latency to Riot API servers)
- [ ] Setup VPC and security groups
- [ ] Configure IAM roles and policies
- [ ] Setup Secrets Manager for `RIOT_API_KEY`
- [ ] Configure persistent storage (EFS/S3)
- [ ] Setup CloudWatch logging and monitoring
- [ ] Configure domain and SSL certificates (ACM)
- [ ] Setup CI/CD pipeline (CodePipeline, GitHub Actions, etc.)

### **Security Considerations**
- [ ] Never commit `.env` files or API keys
- [ ] Use AWS Secrets Manager for sensitive credentials
- [ ] Enable HTTPS only (no HTTP)
- [ ] Configure proper CORS origins
- [ ] Implement API rate limiting
- [ ] Setup CloudWatch alarms for errors
- [ ] Enable AWS WAF for DDoS protection (if public-facing)

### **Post-Deployment Monitoring**
- [ ] Setup CloudWatch dashboards
- [ ] Configure log aggregation
- [ ] Monitor Riot API rate limits
- [ ] Track response times and error rates
- [ ] Setup cost alerts

## AWS Bedrock Integration (Planned)
The project mentions AI-powered duo analysis using AWS Bedrock, but this is **not yet implemented**.

**When implementing**:
- Use AWS SDK v3 for Bedrock Runtime
- Model recommendation: Claude 3 or Titan for text generation
- Add environment variables for model configuration
- Consider cost optimization (prompt caching, streaming)

## Estimated AWS Costs (Monthly)

### Serverless Option (Low Traffic)
- Lambda: ~$5-10 (first 1M requests free)
- API Gateway: ~$3.50/million requests
- S3: ~$1-5 (storage + requests)
- CloudFront: ~$1-10
- DynamoDB: ~$1-5 (on-demand)
- **Total: ~$10-30/month**

### Container Option (ECS Fargate)
- Fargate (0.25 vCPU, 0.5GB): ~$15/month
- EFS: ~$5-10
- ALB: ~$16/month
- S3 + CloudFront: ~$5-10
- **Total: ~$40-50/month**

## Build & Deployment Commands

### Local Build
```bash
# Install dependencies
pnpm install

# Build frontend for production
cd packages/frontend
pnpm build

# Start backend (requires .env)
cd packages/backend
pnpm dev
```

### Production Build
```bash
# Root-level build command
pnpm build

# Frontend output: packages/frontend/dist/duo-frontend/
# Backend: No build step (Node.js runtime)
```

## Critical Notes
1. **WSL Dependency**: Must be removed before AWS deployment
2. **File Storage**: Current implementation is not cloud-native (needs S3 migration)
3. **No Containerization**: No Dockerfile exists yet
4. **Development State**: AI features (AWS Bedrock) not implemented
5. **Rate Limiting**: No built-in rate limiting (relies on Riot API limits)

---

**Project Status**: Early development, hackathon project  
**Tech Stack**: Angular 19 + Node.js/Express + AWS Bedrock (planned)  
**License**: MIT

