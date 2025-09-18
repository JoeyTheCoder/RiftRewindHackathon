# 🎭 That’s My Duo – Rift Rewind Hackathon 2025

## 📌 Overview

**That's My Duo** is an AI-powered League of Legends companion that uncovers how you and your friends *really* play together.  

**How it works:**
1. **Enter your summoner name** → We analyze your recent match history via Riot API
2. **Choose your duo partner** → Pick from your most frequent teammates, or search for any specific player
3. **Get your duo recap** → AI-powered insights about your synergy, performance, and playstyle together

By highlighting champion/role synergies, performance trends, and group dynamics, we turn raw match data into playful, narrative-driven insights using **AWS Bedrock**. Think of it as **Spotify Wrapped for League Duos** — fun, shareable, and personal.

---

## ✨ Core Features

- **Champion & Role Synergy** → Discover which pairings and lanes are your duo’s strongest.  
- **Performance Trends** → Win rates, KDA, vision, and damage stats when you play together vs. solo.  
- **Group Dynamics** → Extend synergy beyond duos to trios or Clash squads.  
- **Generative AI Recaps** → AWS Bedrock narrates your duo highlights with archetypes and hype commentary.  
- **Social Sharing** → Generate Duo Cards and recap posters for Discord, Twitter, or TikTok.  

---

## 🛠️ Tech Stack  

### Frontend

- [Angular](https://angular.io/) + [TailwindCSS](https://tailwindcss.com/) → Responsive web UI with shareable visuals.  

### Backend

- [Express.js](https://expressjs.com/) → REST API connecting the frontend with Riot API and data processing.  

### Data Sources

- [Riot Games API](https://developer.riotgames.com/apis) → Core match history and player stats.  
- (Optional) Mobalytics / OP.gg → Research for additional meta context and data enrichment.  

### AI

- [AWS Bedrock](https://aws.amazon.com/bedrock/) → Generative AI for narrative recaps and duo archetypes.  

### Hosting / Infra

- **Frontend:** AWS Amplify or S3 + CloudFront.  
- **Backend:** AWS Lambda or ECS/Fargate.  
- **Data:** AWS DynamoDB or RDS (optional, for caching precomputed stats).  

---

## 🚀 MVP Roadmap

1. **Integrate Riot API** → Fetch match history for a single summoner name.  
2. **Teammate Discovery** → Identify frequent duo partners from match history and enable manual player search.  
3. **Analyze Duo Stats** → Compute champion/role winrates and performance metrics for selected duo pairs.  
4. **Generate Recaps** → Use AWS Bedrock to turn stats into fun narratives.  
5. **Frontend UI** → Build Angular components for teammate selection, synergy stats, recaps, and "Duo Cards."  
6. **Group Synergy (optional)** → Expand analysis to 3–5 player groups.  
7. **Social Features** → Add "Download as Image" for sharing duo recaps.  

---

## ❓ Open Questions

- **Data Layer**: Stick with Riot API only for MVP, or also pull Mobalytics/OP.gg context?  
- **AI Layer**: Precompute stats + use Bedrock for narrative polish (cheap, controlled), or push raw data directly to prompts?  
- **Hosting**: Use Amplify/Lambda for speed, or custom Nginx/EC2 since we’re Linux-fluent?  
- **UX & Pitch**: Keep the tone **fun/meme-style** (“That’s my Duo energy 😤”) or **analytical/coach-style**?  

---

## 📄 License

This project will be open source under the **MIT License** (or Apache 2.0, TBD).  
