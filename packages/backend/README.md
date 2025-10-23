# Backend API Documentation

## Environment Setup

### Environment Variables

Create a `.env` file in the `packages/backend/` directory with the following variables:

```env
# Riot Games API Configuration
RIOT_API_KEY=your_personal_api_key_here

# Server Configuration
PORT=3000
NODE_ENV=development

# CORS Configuration
FRONTEND_URL=http://localhost:4200
```

### Setup Instructions

1. **Create your `.env` file:**
   ```bash
   cd packages/backend
   cp .env.example .env  # If you have the example file
   # OR create .env manually
   ```

2. **Add your Riot API key:**
   - Replace `your_personal_api_key_here` with your actual Riot API key
   - Your API key should start with `RGAPI-`

3. **Install dependencies:**
   ```bash
   pnpm install
   ```

4. **Start the development server:**
   ```bash
   pnpm dev
   ```

### Security Notes

- ✅ `.env` files are already included in `.gitignore`
- ✅ Never commit your actual API key to version control
- ✅ Use different `.env` files for different environments (dev, staging, prod)
- ✅ The backend will fail to start if `RIOT_API_KEY` is not provided

### Environment Variables Reference

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `RIOT_API_KEY` | Your personal Riot Games API key | None | ✅ Yes |
| `PORT` | Server port | 3000 | No |
| `NODE_ENV` | Environment mode | development | No |
| `FRONTEND_URL` | Frontend URL for CORS | http://localhost:4200 | No |

---

## API Endpoints

### 1. Get Duo Partners

**Endpoint:** `GET /api/duo/partners/:region/:gameName/:tagLine`

**Description:** Returns the top 10 teammates from the last 100 matches, sorted by number of games played together.

**Parameters:**
- `region` (string, required): Platform region code (e.g., `na1`, `euw1`, `kr`)
- `gameName` (string, required): Riot ID game name (e.g., `PlayerName`)
- `tagLine` (string, required): Riot ID tag line (e.g., `NA1`)

**Example Request:**
```bash
curl http://localhost:3000/api/duo/partners/na1/HideOnBush/KR1
```

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "partners": [
      {
        "puuid": "abc123...",
        "games": 45
      },
      {
        "puuid": "def456...",
        "games": 32
      }
    ],
    "totalMatches": 98,
    "analyzedMatches": 100
  }
}
```

**Empty Matches Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "partners": [],
    "totalMatches": 0,
    "message": "No recent matches found"
  }
}
```

**Error Responses:**

- `400 Bad Request` - Invalid region or missing parameters
  ```json
  {
    "error": "Invalid region",
    "message": "Region must be one of: na1, euw1, ..."
  }
  ```

- `404 Not Found` - Player doesn't exist
  ```json
  {
    "error": "Player not found",
    "message": "No player found with Riot ID \"PlayerName#TAG\" in region NA1"
  }
  ```

- `429 Too Many Requests` - Rate limit exceeded
  ```json
  {
    "error": "Rate limit exceeded",
    "message": "Too many requests. Please try again later."
  }
  ```

**Performance:**
- Expected response time: < 2 seconds locally
- Processes up to 100 matches in batches of 10
- Handles API failures gracefully

---

### 2. Get Summoner Profile

**Endpoint:** `GET /api/summoner/:region/:gameName/:tagLine`

**Description:** Returns comprehensive summoner data including ranked info, champion mastery, and recent match performance.

**Parameters:**
- `region` (string, required): Platform region code
- `gameName` (string, required): Riot ID game name
- `tagLine` (string, required): Riot ID tag line

**Example Request:**
```bash
curl http://localhost:3000/api/summoner/na1/PlayerName/NA1
```

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "summoner_id",
    "puuid": "player_puuid",
    "name": "PlayerName",
    "gameName": "PlayerName",
    "tagLine": "NA1",
    "profileIconId": 4568,
    "summonerLevel": 342,
    "region": "na1",
    "rankedInfo": {
      "tier": "DIAMOND",
      "rank": "II",
      "leaguePoints": 45,
      "wins": 125,
      "losses": 98,
      "winRate": 56
    },
    "championMastery": [...],
    "recentMatches": [...],
    "recentPerformance": {...}
  }
}
```

**Error Responses:** Same as duo partners endpoint

---

## Valid Regions

| Code | Region Name |
|------|-------------|
| `na1` | North America |
| `euw1` | Europe West |
| `eun1` | Europe Nordic & East |
| `kr` | Korea |
| `jp1` | Japan |
| `br1` | Brazil |
| `la1` | Latin America North |
| `la2` | Latin America South |
| `oc1` | Oceania |
| `tr1` | Turkey |
| `ru` | Russia |
| `ph2` | Philippines |
| `sg2` | Singapore |
| `th2` | Thailand |
| `tw2` | Taiwan |
| `vn2` | Vietnam |

---

## Testing

### Manual Testing - Duo Partners

```bash
# Test with a known player (replace with actual credentials)
curl "http://localhost:3000/api/duo/partners/na1/YourGameName/YourTag"

# Test with invalid region
curl "http://localhost:3000/api/duo/partners/invalid/Player/TAG"
# Expected: 400 Bad Request

# Test with non-existent player
curl "http://localhost:3000/api/duo/partners/na1/NonExistentPlayer123456/NA1"
# Expected: 404 Not Found

# Test with empty parameters
curl "http://localhost:3000/api/duo/partners/na1/ / "
# Expected: 400 Bad Request
```

### Expected Behavior

✅ **Valid request:** Returns status 200, sorted partner list by game count
✅ **Empty matches:** Returns status 200, empty partners array with message
✅ **Invalid inputs:** Returns status 400 with friendly error message
✅ **Non-existent player:** Returns status 404 with helpful message
✅ **Response time:** < 2 seconds for 100 matches locally

---

## Architecture Notes

### Shared Utilities

The backend uses shared utility functions for:
- **Region validation:** `validateRiotIdParams()`
- **Regional routing:** `getAccountRegion()`
- **PUUID resolution:** `resolvePuuid()`
- **Error handling:** `handleRiotApiError()`

### Performance Optimizations

- Batch processing: Fetches matches in groups of 10 to respect rate limits
- Minimal data: Only extracts PUUIDs and team info (not full match details)
- Early exit: Stops on empty match list
- Error resilience: Continues processing even if individual matches fail
