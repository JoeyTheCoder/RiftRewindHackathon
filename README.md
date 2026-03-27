# That's My Duo

Rift Rewind Hackathon 2025 project, adapted for long-term self-hosting.

## Overview

That's My Duo is a League of Legends companion app that analyzes how two players perform together.
It fetches live Riot API data, computes player and duo metrics, and turns those metrics into readable narrative summaries for a portfolio-friendly deployment that no longer depends on AWS.

## Stack

- Frontend: Angular 19, Tailwind CSS 4, RxJS
- Backend: Node.js 20, Express 5
- Data source: Riot Account-V1, Summoner-V4, Match-V5 APIs
- Deployment target: standard Linux webserver with Nginx or Apache in front of the Node backend
- CI/CD: GitHub Actions with SSH-based deploy

## What Changed After The Hackathon

- Removed AWS Lambda, API Gateway, S3, Secrets Manager, Bedrock, and SAM deployment files
- Switched the backend to filesystem-only storage for jobs and cached match data
- Switched production frontend API routing to same-origin /api requests
- Replaced Bedrock summaries with a local stat-driven narrative generator
- Added GitHub Actions workflows for CI and SSH deployment to a regular webserver

## Architecture

```text
Browser -> Nginx/Apache -> Angular static files
                     \
                      -> /api -> Express backend -> Riot API
                                     \
                                      -> local data/jobs cache
```

## Local Development

1. Install dependencies.

```bash
pnpm install
```

2. Configure backend env.

```bash
cd packages/backend
cp .env.example .env
```

3. Set at least these values in packages/backend/.env.

```env
NODE_ENV=development
PORT=3000
RIOT_API_KEY=RGAPI-your-key
FRONTEND_URL=http://localhost:4200
DATA_DIR=data
LOG_LEVEL=info
```

4. Start the backend and frontend.

```bash
pnpm --filter ./packages/backend dev
pnpm --filter ./packages/frontend dev
```

5. Open http://localhost:4200.

## Deployment Model

The production build expects the frontend and backend to share one origin.
Serve the Angular build as static files and reverse proxy /api to the Node app running on the same server.

Reference files included in this repository:

- deploy/nginx.thats-my-duo.conf.example
- deploy/thats-my-duo.service.example
- .github/workflows/ci.yml
- .github/workflows/deploy.yml

## GitHub Actions Secrets

The deploy workflow expects these repository secrets:

- SSH_HOST
- SSH_USER
- SSH_PORT
- SSH_PRIVATE_KEY
- FRONTEND_TARGET_DIR
- APP_ROOT
- BACKEND_ENV_FILE
- BACKEND_RESTART_COMMAND
- RIOT_API_KEY
- FRONTEND_URL

Example BACKEND_ENV_FILE value:

```env
NODE_ENV=production
PORT=3000
RIOT_API_KEY=RGAPI-your-production-key
FRONTEND_URL=https://your-domain.example
DATA_DIR=data
LOG_LEVEL=info
```

Example BACKEND_RESTART_COMMAND values:

- sudo systemctl restart thats-my-duo
- pm2 restart thats-my-duo

## Riot API Notes

- The Riot APIs used here are public HTTPS endpoints and do not depend on AWS.
- What matters is outbound internet access from your server and a valid Riot API key.
- Development keys expire every 24 hours.
- Personal keys are not allowed for a public site.
- A public portfolio deployment should use an approved production key if the app is accessible to other people.
- Riot rate limits are enforced per region, so high traffic can still throttle your backend even on your own server.

## Security Note

If a real Riot API key was ever committed or shared during development, rotate it before publishing this repository or deploying the app.

## License

MIT. See LICENSE.
