# Backend API Testing Guide

## Prerequisites
- Backend running on `http://localhost:3000`
- Valid `RIOT_API_KEY` in `.env`
- WSL with `bash`, `jq`, and `curl` installed

## Test Endpoints

### 1. Test Connection
```powershell
curl.exe http://localhost:3000/api/test
```
Expected: `{"message":"API connected","config":{...}}`

### 2. Start Data Fetch Job
```powershell
curl.exe -X POST http://localhost:3000/api/start `
  -H "Content-Type: application/json" `
  -d '{\"gameName\":\"Sapphirix\",\"tagLine\":\"FFG\",\"region\":\"EUW\",\"limit\":20}'
```
Expected: `{"jobId":"..."}`

Save the `jobId` for next steps.

### 3. Check Job Status
```powershell
curl.exe http://localhost:3000/api/status/{jobId}
```
Replace `{jobId}` with the actual job ID from step 2.

Expected:
- While running: `{"status":"running", "progress":{...}}`
- When complete: `{"status":"complete", "resultPath":"...", "result":{...}}`

### 4. Get Player Summary
```powershell
curl.exe http://localhost:3000/api/result/{jobId}
```
Expected: Full player summary JSON with:
- `riotId`
- `profile` (with ranks, winrate)
- `topChampions`
- `roles`
- `frequentTeammates`
- `meta`

### 5. Get Duo Summary
First, extract a teammate PUUID from the player summary, then:

```powershell
curl.exe "http://localhost:3000/api/duo/{puuidA}/{puuidB}?region=EUW"
```
Replace `{puuidA}` with your PUUID and `{puuidB}` with a teammate's PUUID.

Expected: Duo summary JSON with:
- `duoKey`
- `sampleSize`
- `wins`
- `queueBreakdown`
- `rolePairs`
- `championPairsTop`
- `synergy`
- `gameTexture`

## Testing Caching

### Test Player Data Caching
1. Run step 2 (start job) for a player
2. Wait for completion
3. Run step 2 again with the **same player** within 10 minutes
4. Should return immediately with `{"jobId":"...", "cached": true}`
5. The returned `jobId` is from the previous cached job

### Test Duo Summary Caching
1. Get a duo summary (step 5)
2. Request the same duo summary again within 10 minutes
3. Console should log: `✅ Using cached duo summary...`
4. Response should be instant

## Expected Console Logs (Backend)

### Successful Job Flow:
```
🎮 Fetching data for Sapphirix#FFG (EUW)
📊 Generating player summary...
   Found 20 matches
   Filtered to 18 ranked matches (420/440)
   Found 8 unique teammates
✅ Summary saved: C:\...\summary.player.json
✅ Cached to C:\...\data\EUW\{puuid}\latest
```

### Cached Request:
```
✅ Using cached data for Sapphirix#FFG
```

### Duo Summary Generation:
```
📊 Generating duo summary for {puuid1}... + {puuid2}...
   Found 12 duo matches together
✅ Duo summary saved: C:\...\summary.duo.json
```

## Common Issues

### Issue: `RIOT_API_KEY is not set`
- Ensure `.env` file exists in `packages/backend/`
- Check that `RIOT_API_KEY=RGAPI-...` is set correctly
- Restart the backend

### Issue: `bash: command not found` or `jq: command not found`
- Install in WSL: `wsl apk add bash jq curl`

### Issue: Job stuck in "running" status
- Check backend console for errors
- Verify Riot API key is valid
- Check for 429 (rate limit) errors

### Issue: `Player data not found` for duo endpoint
- Ensure you've fetched player data first (step 2-4)
- Check that the `puuid` matches exactly
- Verify the region is correct

## Files Created During Testing

After a successful test run, you should see:
```
packages/backend/data/
├── jobs/
│   └── {jobId}.json
├── temp/
│   └── {jobId}/
│       ├── account_{timestamp}.json
│       ├── summoner_{timestamp}.json
│       ├── league_entries_{timestamp}.json
│       ├── match_ids_{timestamp}.json
│       ├── matches_{timestamp}.json
│       └── summary.player.json
└── EUW/
    └── {puuid}/
        ├── latest/
        │   └── (all the above files)
        └── duos/
            └── {teammate_puuid}/
                └── summary.duo.json
```

## Integration Testing (Frontend + Backend)

1. Start backend: `cd packages/backend && npm run dev`
2. Start frontend: `cd packages/frontend && npm start`
3. Open `http://localhost:4200`
4. Submit a player search
5. View profile and top teammates
6. Click "View Duo Stats" on a teammate
7. Check that duo summary loads correctly

All features should work end-to-end! 🎉

