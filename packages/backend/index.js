require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const app = express();
const port = process.env.PORT || 3000;

// Enable CORS for Angular frontend
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:4200',
  credentials: true
}));

// Parse JSON bodies
app.use(express.json());

// ============================================================================
// SHARED UTILITIES
// ============================================================================

// Simple in-memory cache for account lookups (PUUID -> account info)
const accountCache = new Map();
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

// Ranked queue allowlist
const QUEUE_ALLOWLIST = [420, 440]; // 420 = RANKED_SOLO_5x5, 440 = RANKED_FLEX_SR

// Default and bounds for recency filter
const DUO_SINCE_DAYS_DEFAULT = parseInt(process.env.DUO_SINCE_DAYS_DEFAULT || '60', 10);
const SINCE_DAYS_MIN = 1;
const SINCE_DAYS_MAX = 180;

// Valid regions for League of Legends
const VALID_REGIONS = ['na1', 'euw1', 'eun1', 'kr', 'jp1', 'br1', 'la1', 'la2', 'oc1', 'tr1', 'ru', 'ph2', 'sg2', 'th2', 'tw2', 'vn2'];

// Map platform region to account API regional routing
function getAccountRegion(region) {
  if (['na1', 'br1', 'la1', 'la2', 'oc1'].includes(region)) return 'americas';
  if (['euw1', 'eun1', 'tr1', 'ru'].includes(region)) return 'europe';
  if (['kr', 'jp1'].includes(region)) return 'asia';
  if (['ph2', 'sg2', 'th2', 'tw2', 'vn2'].includes(region)) return 'sea';
  return 'americas'; // default fallback
}

// Validate input parameters
function validateRiotIdParams(region, gameName, tagLine) {
  if (!VALID_REGIONS.includes(region)) {
    return { 
      valid: false, 
      status: 400,
      error: 'Invalid region', 
      message: `Region must be one of: ${VALID_REGIONS.join(', ')}` 
    };
  }

  if (!gameName || gameName.trim().length === 0) {
    return { 
      valid: false,
      status: 400,
      error: 'Invalid game name', 
      message: 'Game name is required' 
    };
  }
  
  if (!tagLine || tagLine.trim().length === 0) {
    return { 
      valid: false,
      status: 400,
      error: 'Invalid tag line', 
      message: 'Tag line is required' 
    };
  }

  return { valid: true };
}

// Get PUUID from Riot ID
async function resolvePuuid(region, gameName, tagLine, apiKey) {
  const accountRegion = getAccountRegion(region);
  const response = await axios.get(
    `https://${accountRegion}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
    { headers: { 'X-Riot-Token': apiKey } }
  );
  return response.data.puuid;
}

// Helper to get start time in Unix seconds from sinceDays
function getStartTime(sinceDays) {
  const daysAgo = new Date();
  daysAgo.setDate(daysAgo.getDate() - sinceDays);
  return Math.floor(daysAgo.getTime() / 1000);
}

// Validate and parse sinceDays parameter
function parseSinceDays(sinceDaysParam) {
  if (!sinceDaysParam) {
    return DUO_SINCE_DAYS_DEFAULT;
  }
  
  const parsed = parseInt(sinceDaysParam, 10);
  if (isNaN(parsed) || parsed < SINCE_DAYS_MIN || parsed > SINCE_DAYS_MAX) {
    return null; // Invalid
  }
  
  return parsed;
}

// Handle Riot API errors consistently
function handleRiotApiError(error, gameName, tagLine, region, res) {
  console.error('Riot API error:', error.message);
  
  if (error.response) {
    if (error.response.status === 404) {
      return res.status(404).json({ 
        error: 'Player not found', 
        message: `No player found with Riot ID "${gameName}#${tagLine}" in region ${region.toUpperCase()}` 
      });
    } else if (error.response.status === 429) {
      return res.status(429).json({ 
        error: 'Rate limit exceeded', 
        message: 'Too many requests. Please try again later.' 
      });
    } else if (error.response.status === 403) {
      return res.status(403).json({ 
        error: 'API key invalid', 
        message: 'Invalid or expired Riot API key' 
      });
    }
  }
  
  return res.status(500).json({ 
    error: 'Internal server error', 
    message: 'Failed to fetch data from Riot API' 
  });
}

// ============================================================================
// ROUTES
// ============================================================================

app.get('/', (req, res) => {
  res.json({ message: 'That\'s My Duo Backend is running!' });
});

// Get account info by PUUID
app.get('/api/account/:region/:puuid', async (req, res) => {
  const { region, puuid } = req.params;

  // Validate region
  if (!VALID_REGIONS.includes(region)) {
    return res.status(400).json({ 
      error: 'Invalid region', 
      message: `Region must be one of: ${VALID_REGIONS.join(', ')}` 
    });
  }

  // Validate PUUID
  if (!puuid || puuid.trim().length === 0) {
    return res.status(400).json({ 
      error: 'Invalid PUUID', 
      message: 'PUUID is required' 
    });
  }

  // Check cache first
  const cacheKey = `${region}:${puuid}`;
  const cached = accountCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return res.json({
      success: true,
      data: cached.data,
      cached: true
    });
  }

  const RIOT_API_KEY = process.env.RIOT_API_KEY;
  if (!RIOT_API_KEY) {
    return res.status(500).json({ 
      error: 'Server configuration error', 
      message: 'Riot API key not configured' 
    });
  }

  try {
    const accountRegion = getAccountRegion(region);
    const response = await axios.get(
      `https://${accountRegion}.api.riotgames.com/riot/account/v1/accounts/by-puuid/${puuid}`,
      { headers: { 'X-Riot-Token': RIOT_API_KEY } }
    );

    const data = {
      puuid: response.data.puuid,
      gameName: response.data.gameName,
      tagLine: response.data.tagLine
    };

    // Store in cache
    accountCache.set(cacheKey, {
      data: data,
      timestamp: Date.now()
    });

    res.json({
      success: true,
      data: data
    });
  } catch (error) {
    console.error('Error fetching account by PUUID:', error.message);
    
    if (error.response?.status === 404) {
      return res.status(404).json({ 
        error: 'Account not found', 
        message: 'No account found with this PUUID' 
      });
    }
    
    return res.status(500).json({ 
      error: 'Internal server error', 
      message: 'Failed to fetch account data' 
    });
  }
});

// Get duo partners for a summoner
app.get('/api/duo/partners/:region/:gameName/:tagLine', async (req, res) => {
  const startTimestamp = Date.now();
  const { region, gameName, tagLine } = req.params;
  
  // Validate inputs
  const validation = validateRiotIdParams(region, gameName, tagLine);
  if (!validation.valid) {
    return res.status(validation.status).json({ 
      error: validation.error, 
      message: validation.message 
    });
  }

  // Parse and validate sinceDays
  const sinceDays = parseSinceDays(req.query.sinceDays);
  if (sinceDays === null) {
    return res.status(400).json({
      error: 'Invalid sinceDays',
      message: `sinceDays must be between ${SINCE_DAYS_MIN} and ${SINCE_DAYS_MAX}`
    });
  }

  const RIOT_API_KEY = process.env.RIOT_API_KEY;
  if (!RIOT_API_KEY) {
    return res.status(500).json({ 
      error: 'Server configuration error', 
      message: 'Riot API key not configured' 
    });
  }

  try {
    // Step 1: Resolve PUUID
    const puuid = await resolvePuuid(region, gameName, tagLine, RIOT_API_KEY);
    const accountRegion = getAccountRegion(region);

    // Step 2: Get match IDs with recency filter (ranked games only via startTime)
    const startTime = getStartTime(sinceDays);
    const matchIdsResponse = await axios.get(
      `https://${accountRegion}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?startTime=${startTime}&count=100`,
      { headers: { 'X-Riot-Token': RIOT_API_KEY } }
    );

    const matchIds = matchIdsResponse.data;

    // Handle case: zero matches
    if (!matchIds || matchIds.length === 0) {
      const duration = Date.now() - startTimestamp;
      console.log(`duo.partners ${region} ${gameName}#${tagLine} queues=[${QUEUE_ALLOWLIST}] since=${sinceDays} scanned=0 uniquePartners=0 dur=${duration}ms`);
      
      return res.json({
        success: true,
        data: {
          partners: [],
          meta: {
            filteredQueues: QUEUE_ALLOWLIST,
            sinceDays: sinceDays,
            scanned: 0
          }
        }
      });
    }

    // Step 3: For each match, filter ranked only and count teammates
    const teammateCount = new Map();
    const batchSize = 3; // Smaller batch size for development API key
    let scannedMatches = 0;
    let rankedMatches = 0;

    // Helper function to delay between batches
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    for (let i = 0; i < matchIds.length; i += batchSize) {
      const batch = matchIds.slice(i, i + batchSize);
      
      const matchPromises = batch.map(matchId =>
        axios.get(
          `https://${accountRegion}.api.riotgames.com/lol/match/v5/matches/${matchId}`,
          { headers: { 'X-Riot-Token': RIOT_API_KEY } }
        ).catch(err => {
          console.warn(`Failed to fetch match ${matchId}:`, err.message);
          return null;
        })
      );

      const matchResponses = await Promise.all(matchPromises);
      
      // Add delay between batches to respect rate limits
      if (i + batchSize < matchIds.length) {
        await delay(500); // 500ms delay between batches
      }

      // Process each match response
      for (const response of matchResponses) {
        if (!response || !response.data) continue;

        const match = response.data;
        scannedMatches++;

        // Filter: only ranked queues
        if (!QUEUE_ALLOWLIST.includes(match.info.queueId)) {
          continue;
        }

        rankedMatches++;

        // Find which team the player was on
        const playerParticipant = match.info.participants.find(p => p.puuid === puuid);
        if (!playerParticipant) continue;

        const playerTeamId = playerParticipant.teamId;

        // Count teammates (same team, excluding self)
        for (const participant of match.info.participants) {
          if (participant.puuid !== puuid && participant.teamId === playerTeamId) {
            const currentCount = teammateCount.get(participant.puuid) || 0;
            teammateCount.set(participant.puuid, currentCount + 1);
          }
        }
      }
    }

    // Step 4: Sort by count descending and take top 10
    const sortedPartners = Array.from(teammateCount.entries())
      .map(([puuid, games]) => ({ puuid, games }))
      .sort((a, b) => b.games - a.games)
      .slice(0, 10);

    const duration = Date.now() - startTimestamp;
    console.log(`duo.partners ${region} ${gameName}#${tagLine} queues=[${QUEUE_ALLOWLIST}] since=${sinceDays} scanned=${scannedMatches} rankedMatches=${rankedMatches} uniquePartners=${sortedPartners.length} dur=${duration}ms`);

    // Return results
    res.json({
      success: true,
      data: {
        partners: sortedPartners,
        meta: {
          filteredQueues: QUEUE_ALLOWLIST,
          sinceDays: sinceDays,
          scanned: scannedMatches
        }
      }
    });

  } catch (error) {
    return handleRiotApiError(error, gameName, tagLine, region, res);
  }
});

// Get duo stats for two players
app.get('/api/duo/stats/:region/:puuidA/:puuidB', async (req, res) => {
  const startTimestamp = Date.now();
  const { region, puuidA, puuidB } = req.params;

  // Validate region
  if (!VALID_REGIONS.includes(region)) {
    return res.status(400).json({ 
      error: 'Invalid region', 
      message: `Region must be one of: ${VALID_REGIONS.join(', ')}` 
    });
  }

  // Validate PUUIDs
  if (!puuidA || !puuidB || puuidA.trim().length === 0 || puuidB.trim().length === 0) {
    return res.status(400).json({ 
      error: 'Invalid PUUIDs', 
      message: 'Both puuidA and puuidB are required' 
    });
  }
  
  // Parse and validate sinceDays
  const sinceDays = parseSinceDays(req.query.sinceDays);
  if (sinceDays === null) {
    return res.status(400).json({ 
      error: 'Invalid sinceDays',
      message: `sinceDays must be between ${SINCE_DAYS_MIN} and ${SINCE_DAYS_MAX}`
    });
  }

  // Parse limit (default 100)
  const limit = Math.min(parseInt(req.query.limit || '100', 10), 200);

  const RIOT_API_KEY = process.env.RIOT_API_KEY;
  if (!RIOT_API_KEY) {
    return res.status(500).json({ 
      error: 'Server configuration error', 
      message: 'Riot API key not configured' 
    });
  }

  try {
    const accountRegion = getAccountRegion(region);
    const startTime = getStartTime(sinceDays);

    // Get match IDs for player A with recency filter
    const matchIdsResponse = await axios.get(
      `https://${accountRegion}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuidA}/ids?startTime=${startTime}&count=${limit}`,
      { headers: { 'X-Riot-Token': RIOT_API_KEY } }
    );

    const matchIds = matchIdsResponse.data;

    // Initialize stats
    let scannedMatches = 0;
    let duoMatches = 0;
    let wins = 0;
    let losses = 0;
    const kdaA = { kills: 0, deaths: 0, assists: 0 };
    const kdaB = { kills: 0, deaths: 0, assists: 0 };

    if (matchIds && matchIds.length > 0) {
      const batchSize = 3;
      const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

      for (let i = 0; i < matchIds.length; i += batchSize) {
        const batch = matchIds.slice(i, i + batchSize);
        
        const matchPromises = batch.map(matchId =>
          axios.get(
            `https://${accountRegion}.api.riotgames.com/lol/match/v5/matches/${matchId}`,
            { headers: { 'X-Riot-Token': RIOT_API_KEY } }
          ).catch(err => {
            console.warn(`Failed to fetch match ${matchId}:`, err.message);
            return null;
          })
        );

        const matchResponses = await Promise.all(matchPromises);
        
        if (i + batchSize < matchIds.length) {
          await delay(500);
        }

        // Process each match
        for (const response of matchResponses) {
          if (!response || !response.data) continue;

          const match = response.data;
          scannedMatches++;

          // Filter: only ranked queues
          if (!QUEUE_ALLOWLIST.includes(match.info.queueId)) {
            continue;
          }

          // Check if both players are in this match
          const participantA = match.info.participants.find(p => p.puuid === puuidA);
          const participantB = match.info.participants.find(p => p.puuid === puuidB);

          if (!participantA || !participantB) continue;

          // Check if they're on the same team
          if (participantA.teamId !== participantB.teamId) continue;

          // This is a duo match!
          duoMatches++;

          // Track win/loss
          if (participantA.win) {
            wins++;
          } else {
            losses++;
          }

          // Accumulate KDA
          kdaA.kills += participantA.kills;
          kdaA.deaths += participantA.deaths;
          kdaA.assists += participantA.assists;

          kdaB.kills += participantB.kills;
          kdaB.deaths += participantB.deaths;
          kdaB.assists += participantB.assists;
        }
      }
    }

    const duration = Date.now() - startTimestamp;
    const winrate = duoMatches > 0 ? Math.round((wins / duoMatches) * 100) : 0;

    console.log(`duo.stats ${region} ${puuidA.substring(0, 8)}.../${puuidB.substring(0, 8)}... queues=[${QUEUE_ALLOWLIST}] since=${sinceDays} scanned=${scannedMatches} duoMatches=${duoMatches} dur=${duration}ms`);

    // Return results
    res.json({
      success: true,
      data: {
        sampleSize: duoMatches,
        wins: wins,
        losses: losses,
        winrate: winrate,
        kdaA: kdaA,
        kdaB: kdaB,
        meta: {
          filteredQueues: QUEUE_ALLOWLIST,
          sinceDays: sinceDays,
          scanned: scannedMatches
        }
      }
    });

  } catch (error) {
    console.error('Error fetching duo stats:', error.message);
    return res.status(500).json({ 
      error: 'Internal server error', 
      message: 'Failed to fetch duo stats' 
    });
  }
});

app.get('/api/summoner/:region/:gameName/:tagLine', async (req, res) => {
  const { region, gameName, tagLine } = req.params;
  
  // Validate inputs
  const validation = validateRiotIdParams(region, gameName, tagLine);
  if (!validation.valid) {
    return res.status(validation.status).json({ 
      error: validation.error, 
      message: validation.message 
    });
  }

  const RIOT_API_KEY = process.env.RIOT_API_KEY;
    if (!RIOT_API_KEY) {
      return res.status(500).json({ 
        error: 'Server configuration error', 
        message: 'Riot API key not configured' 
      });
    }

  try {
    // Step 1: Get PUUID using Riot ID
    const accountRegion = getAccountRegion(region);
    const puuid = await resolvePuuid(region, gameName, tagLine, RIOT_API_KEY);
    
    // Get account data for the response
    const accountResponse = await axios.get(
      `https://${accountRegion}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
      { headers: { 'X-Riot-Token': RIOT_API_KEY } }
    );

    // Step 2: Get summoner data using PUUID
    const summonerResponse = await axios.get(
      `https://${region}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}`,
      {
        headers: {
          'X-Riot-Token': RIOT_API_KEY
        }
      }
    );

    const summonerData = summonerResponse.data;

    // Step 3: Get additional data in parallel
    const [rankedResponse, matchIdsResponse, masteryResponse] = await Promise.allSettled([
      // Ranked information
      axios.get(
        `https://${region}.api.riotgames.com/lol/league/v4/entries/by-summoner/${summonerData.id}`,
        { headers: { 'X-Riot-Token': RIOT_API_KEY } }
      ),
      // Recent match IDs (last 20 games to ensure we get enough ranked ones)
      axios.get(
        `https://${accountRegion}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=20`,
        { headers: { 'X-Riot-Token': RIOT_API_KEY } }
      ),
      // Champion mastery (top 5)
      axios.get(
        `https://${region}.api.riotgames.com/lol/champion-mastery/v4/champion-masteries/by-puuid/${puuid}/top?count=5`,
        { headers: { 'X-Riot-Token': RIOT_API_KEY } }
      )
    ]);

    // Process ranked data
    let rankedInfo = null;
    if (rankedResponse.status === 'fulfilled' && rankedResponse.value.data.length > 0) {
      const soloQueueRank = rankedResponse.value.data.find(entry => entry.queueType === 'RANKED_SOLO_5x5');
      if (soloQueueRank) {
        rankedInfo = {
          tier: soloQueueRank.tier,
          rank: soloQueueRank.rank,
          leaguePoints: soloQueueRank.leaguePoints,
          wins: soloQueueRank.wins,
          losses: soloQueueRank.losses,
          winRate: Math.round((soloQueueRank.wins / (soloQueueRank.wins + soloQueueRank.losses)) * 100)
        };
      }
    }

    // Process champion mastery data
    let championMastery = [];
    if (masteryResponse.status === 'fulfilled') {
      championMastery = masteryResponse.value.data.map(mastery => ({
        championId: mastery.championId,
        championLevel: mastery.championLevel,
        championPoints: mastery.championPoints,
        lastPlayTime: mastery.lastPlayTime
      }));
    }

    // Step 4: Get detailed match data for recent games
    let recentMatches = [];
    if (matchIdsResponse.status === 'fulfilled' && matchIdsResponse.value.data.length > 0) {
      const matchIds = matchIdsResponse.value.data;
      
      const matchPromises = matchIds.map(matchId =>
        axios.get(
          `https://${accountRegion}.api.riotgames.com/lol/match/v5/matches/${matchId}`,
          { headers: { 'X-Riot-Token': RIOT_API_KEY } }
        ).catch(err => ({ error: err.message }))
      );

      const matchResponses = await Promise.all(matchPromises);
      
      recentMatches = matchResponses
        .filter(response => !response.error && response.data)
        .map(response => {
          const match = response.data;
          const participant = match.info.participants.find(p => p.puuid === puuid);
          
          if (!participant) return null;

          // Filter: only ranked queues (420 = Ranked Solo, 440 = Ranked Flex)
          if (!QUEUE_ALLOWLIST.includes(match.info.queueId)) {
            return null;
          }

          return {
            matchId: match.metadata.matchId,
            gameCreation: match.info.gameCreation,
            gameDuration: match.info.gameDuration,
            gameMode: match.info.gameMode,
            queueId: match.info.queueId,
            win: participant.win,
            championId: participant.championId,
            championName: participant.championName,
            kills: participant.kills,
            deaths: participant.deaths,
            assists: participant.assists,
            kda: participant.deaths === 0 ? (participant.kills + participant.assists) : 
                 Math.round(((participant.kills + participant.assists) / participant.deaths) * 100) / 100,
            totalDamageDealtToChampions: participant.totalDamageDealtToChampions,
            visionScore: participant.visionScore,
            cs: participant.totalMinionsKilled + participant.neutralMinionsKilled,
            gold: participant.goldEarned,
            teamPosition: participant.teamPosition || 'UNKNOWN'
          };
        })
        .filter(match => match !== null)
        .sort((a, b) => b.gameCreation - a.gameCreation) // Sort by most recent first
        .slice(0, 5); // Take only the 5 most recent ranked games
    }

    // Calculate recent performance stats
    let recentPerformance = null;
    if (recentMatches.length > 0) {
      const wins = recentMatches.filter(match => match.win).length;
      const totalKills = recentMatches.reduce((sum, match) => sum + match.kills, 0);
      const totalDeaths = recentMatches.reduce((sum, match) => sum + match.deaths, 0);
      const totalAssists = recentMatches.reduce((sum, match) => sum + match.assists, 0);
      
      recentPerformance = {
        gamesPlayed: recentMatches.length,
        wins: wins,
        losses: recentMatches.length - wins,
        winRate: Math.round((wins / recentMatches.length) * 100),
        averageKDA: totalDeaths === 0 ? (totalKills + totalAssists) : 
                   Math.round(((totalKills + totalAssists) / totalDeaths) * 100) / 100,
        averageKills: Math.round((totalKills / recentMatches.length) * 10) / 10,
        averageDeaths: Math.round((totalDeaths / recentMatches.length) * 10) / 10,
        averageAssists: Math.round((totalAssists / recentMatches.length) * 10) / 10
      };
    }

    // Format and return the enhanced response
    res.json({
      success: true,
      data: {
        // Basic summoner info
        id: summonerData.id,
        accountId: summonerData.accountId,
        puuid: summonerData.puuid,
        name: summonerData.name,
        profileIconId: summonerData.profileIconId,
        revisionDate: summonerData.revisionDate,
        summonerLevel: summonerData.summonerLevel,
        region: region,
        gameName: accountResponse.data.gameName,
        tagLine: accountResponse.data.tagLine,
        
        // Enhanced data
        rankedInfo: rankedInfo,
        championMastery: championMastery,
        recentMatches: recentMatches,
        recentPerformance: recentPerformance
      }
    });

  } catch (error) {
    return handleRiotApiError(error, gameName, tagLine, region, res);
  }
});

app.listen(port, () => {
  console.log(`🚀 Backend server running on http://localhost:${port}`);
});
