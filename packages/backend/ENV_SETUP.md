# Environment Setup

## Create your .env file

Create a file named `.env` in `packages/backend/` with the following content:

```env
# Riot Games API Configuration
RIOT_API_KEY=RGAPI-your-actual-api-key-here

# Server Configuration
PORT=3000
NODE_ENV=development

# CORS Configuration
FRONTEND_URL=http://localhost:4200

# Data Storage
DATA_DIR=./data
```

## Important Notes

1. **Replace `RGAPI-your-actual-api-key-here`** with your real Riot API key
2. The `.env` file is already in `.gitignore` so it won't be committed
3. Make sure your API key starts with `RGAPI-`
4. The backend will fail to start if `RIOT_API_KEY` is not set

## Verify Setup

After creating your `.env` file, test the backend:

```bash
cd packages/backend
pnpm dev
```

You should see:
```
✅ Data directory initialized: C:\Projekte\RiftRewindHackathon\packages\backend\data
🚀 Backend running on http://localhost:3000
📁 Data directory: C:\Projekte\RiftRewindHackathon\packages\backend\data
```

Then test the endpoint:
```bash
curl http://localhost:3000/api/test
```

Should return:
```json
{
  "message": "API connected",
  "config": {
    "dataDir": "...",
    "hasApiKey": true
  }
}
```

