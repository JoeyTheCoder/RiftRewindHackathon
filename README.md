# 🎮 That’s My Duo  
### Rift Rewind Hackathon 2025 – Riot Games × AWS  
**Developer:** Sapphirix (Switzerland)  
**Status:** ✅ Complete & Deployed  
**🌐 Live Site:** [https://tmd.sapphirix.ch](https://tmd.sapphirix.ch)

---

## 🧠 Overview

**That’s My Duo** is an AI-powered League of Legends companion that analyzes how you and your friends play together.  
It fetches real match data from the Riot Games API, calculates detailed synergy metrics, and generates short, narrative insights using **AWS Bedrock (Claude 3 Haiku)** — helping players reflect, learn, and celebrate their duo performance.

> *“Who’s your perfect duo? That’s My Duo finds out.”*

---

## ✨ Features

- 🧩 **Duo Synergy Analysis** — winrate, champion pairs, role effectiveness, vision, and damage contribution  
- 🧠 **AI-Generated Insights** — 3-sentence summaries powered by Claude 3 Haiku via AWS Bedrock  
- 📈 **Player Statistics** — match history, top champions, roles, and frequent teammates  
- 📱 **Mobile-Responsive Design** — built with Angular 19 + Tailwind CSS 4  
- ☁️ **Serverless Deployment** — AWS Lambda + API Gateway + S3 + Cloudflare CDN  
- 🧮 **Job-Based Processing** — avoids Lambda timeouts for large match histories  

---

## 🧱 Architecture Overview

```
Browser (Angular) → Cloudflare CDN → S3 (Frontend)
        ↓ HTTPS
 API Gateway (HTTP) → Lambda (Express.js) → Riot API
                                   ↓
                               AWS S3 / Secrets Manager / Bedrock
```

**Frontend:** Angular 19, Tailwind CSS 4, RxJS  
**Backend:** Node.js 20 / Express 5 (serverless-express)  
**AI:** AWS Bedrock – Claude 3 Haiku  
**Infra:** AWS SAM template (Lambda + API Gateway + S3 + Secrets Manager)

---

## ☁️ AWS Services Used

| Service | Purpose |
|----------|----------|
| **AWS Lambda** | Serverless execution of the backend API |
| **Amazon API Gateway (HTTP API)** | Exposes endpoints for the frontend |
| **Amazon S3** | Hosts static frontend & stores cached match data |
| **AWS Secrets Manager** | Securely stores Riot API key |
| **AWS Bedrock (Claude 3 Haiku)** | Generates narrative duo insights |
| **AWS SAM / CloudFormation** | Infrastructure as code deployment |
| **Cloudflare CDN** | Global delivery + custom domain for frontend |

---

## 🧮 Methodology

1. **Data Ingestion** – Match history fetched from the Riot Games API (up to 100 games).  
2. **Statistical Analysis** – Duo synergy metrics computed: combined K+A, kill participation, role and champion pairings, vision, damage share, and win rates.  
3. **AI Narration** – Metrics formatted into structured prompts and sent to **Claude 3 Haiku** through **AWS Bedrock Runtime**.  
4. **Frontend Visualization** – Results rendered in a clean, mobile-friendly interface with champion icons, progress stats, and AI-written insights.

---

## 📊 Example Insight

> *“This duo thrives on aggressive bot-lane play, averaging 28 combined kills + assists per game.  
> Their strongest combo, **Jinx + Thresh**, wins 80% of matches, with superior vision control.  
> They excel when games stay under 30 minutes — keep the pace fast!”*

---

## 💡 What I Learned

- **Lambda timeout** limits solved with async job system.  
- **Claude 3 Haiku** delivers fast, cheap narrative generation.  
- **Unified FS/S3 storage layer** made local development seamless.  
- AWS SAM greatly simplified deploying and linking all services.  

---

## 🚀 Quick Start (Local)

```bash
# 1. Clone
git clone https://github.com/<yourusername>/thats-my-duo.git
cd thats-my-duo

# 2. Install
pnpm install

# 3. Backend
cd packages/backend
cp .env.example .env
# Fill in RIOT_API_KEY=RGAPI-xxxxx
pnpm dev

# 4. Frontend
cd ../frontend
pnpm dev
# Open http://localhost:4200
```

---

## 🌐 Live Demo

**App:** [https://tmd.sapphirix.ch](https://tmd.sapphirix.ch)  
**Video:** [YouTube – That’s My Duo (Demo)](https://youtu.be/0YB8-iK7B9I)  

---

## ⚖️ License

This project is open-source under the **MIT License**.  
See the [LICENSE](./LICENSE) file for details.

---

## 🏷️ AWS Resource Tag

```
Key:   rift-rewind-hackathon
Value: 2025
```

---

### 👏 Built for Rift Rewind Hackathon 2025  
*Turning League data into meaningful, AI-powered stories.*
