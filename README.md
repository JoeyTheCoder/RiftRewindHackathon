# That’s My Duo – Rift Rewind Hackathon 2025  

## 🧩 Overview

**That’s My Duo** is a League of Legends companion that shows how you and your friends play together. It analyzes match history and generates fun AI-powered summaries about your duo’s synergy, performance, and playstyle.  

## ⚙️ Architecture  

### Frontend (Angular)

- Home screen + form to enter summoner name, tagline, and region  
- Displays player profile and early duo overview  
- **Current:** Riot API data integrated but needs cleaning and structure  

### Backend (Express.js)

- Core API and Riot data handling  
- Endpoints for summoner data and duo analysis  
- **Current:** Basic fetch works, logic for meaningful insights still missing  

### AI Integration (AWS Bedrock)

- Planned for generating duo recaps and narrative insights  
- **Status:** Not implemented yet  

## 🚧 Current Focus

- Improve data quality and usefulness from Riot API  
- Implement duo analysis logic  
- Integrate AI recap generation  

## 🌐 Environments (Local vs AWS)

Frontend (Angular)
- Dev: `ng serve` uses a proxy to the backend. The app now reads the API base from `src/environments/environment.ts`.
  - File: `packages/frontend/src/environments/environment.ts`
  - Value: `apiUrl: '/api'` (works with `packages/frontend/proxy.conf.json`)
- Prod: Build replaces env with `environment.prod.ts` via Angular `fileReplacements`.
  - File: `packages/frontend/src/environments/environment.prod.ts`
  - Set `apiUrl` to your deployed API Gateway, e.g. `https://<api-id>.execute-api.<region>.amazonaws.com/api`
  - Build: `pnpm --filter duo-frontend build` (or `ng build` inside frontend)

Backend (Express)
- Dev: `.env` in `packages/backend` (loaded by `dotenv`) controls config and CORS.
  - Recommended local values:
    - `NODE_ENV=development`
    - `FRONTEND_URL=http://localhost:4200`
    - `DATA_BACKEND=fs`
    - `RIOT_API_KEY=...`
    - `PORT=3000`
- Prod (AWS SAM): Values come from `template.yaml` parameters and `Globals.Function.Environment`.
  - `FRONTEND_URL` should be your S3/CloudFront site origin
  - `RIOT_SECRET_ID` references the Riot key in Secrets Manager

Dev workflow
- Start backend: `pnpm --filter duobackend dev`
- Start frontend: `pnpm --filter duo-frontend dev`
- Frontend calls `/api/...` which proxies to `http://localhost:3000` in dev and uses the API Gateway URL in prod.