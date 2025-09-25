const express = require('express');
const cors = require('cors');
const app = express();
const port = 3000;

// Enable CORS for Angular frontend
app.use(cors({
  origin: 'http://localhost:4200',
  credentials: true
}));

// Parse JSON bodies
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ message: 'That\'s My Duo Backend is running!' });
});

app.get('/api/summoner/:region/:gameName/:tagLine', async (req, res) => {
  const { region, gameName, tagLine } = req.params;
  
  // Validate region parameter
  const validRegions = ['na1', 'euw1', 'eun1', 'kr', 'jp1', 'br1', 'la1', 'la2', 'oc1', 'tr1', 'ru', 'ph2', 'sg2', 'th2', 'tw2', 'vn2'];
  if (!validRegions.includes(region)) {
    return res.status(400).json({ 
      error: 'Invalid region', 
      message: `Region must be one of: ${validRegions.join(', ')}` 
    });
  }

  // Validate Riot ID components
  if (!gameName || gameName.trim().length === 0) {
    return res.status(400).json({ 
      error: 'Invalid game name', 
      message: 'Game name is required' 
    });
  }
  
  if (!tagLine || tagLine.trim().length === 0) {
    return res.status(400).json({ 
      error: 'Invalid tag line', 
      message: 'Tag line is required' 
    });
  }

  try {
    const axios = require('axios');
    const RIOT_API_KEY = process.env.RIOT_API_KEY || 'RGAPI-7544e18b-50aa-4b4b-9341-30cbc15abe9d';
    
    if (!RIOT_API_KEY) {
      return res.status(500).json({ 
        error: 'Server configuration error', 
        message: 'Riot API key not configured' 
      });
    }

    // Map region to account API region
    const getAccountRegion = (region) => {
      if (['na1', 'br1', 'la1', 'la2', 'oc1'].includes(region)) return 'americas';
      if (['euw1', 'eun1', 'tr1', 'ru'].includes(region)) return 'europe';
      if (['kr', 'jp1'].includes(region)) return 'asia';
      return 'americas'; // default
    };

    // Step 1: Get PUUID using Riot ID
    const accountRegion = getAccountRegion(region);
    const accountResponse = await axios.get(
      `https://${accountRegion}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
      {
        headers: {
          'X-Riot-Token': RIOT_API_KEY
        }
      }
    );

    const { puuid } = accountResponse.data;

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
      // Recent match IDs (last 10 ranked games)
      axios.get(
        `https://${accountRegion}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?queue=420&start=0&count=10`,
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
      const matchIds = matchIdsResponse.value.data.slice(0, 5); // Get details for last 5 games
      
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

          return {
            matchId: match.metadata.matchId,
            gameCreation: match.info.gameCreation,
            gameDuration: match.info.gameDuration,
            gameMode: match.info.gameMode,
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
        .filter(match => match !== null);
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
    console.error('Error fetching summoner data:', error.message);
    
    if (error.response) {
      // Riot API returned an error
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
    
    // Generic server error
    res.status(500).json({ 
      error: 'Internal server error', 
      message: 'Failed to fetch summoner data' 
    });
  }
});

app.listen(port, () => {
  console.log(`🚀 Backend server running on http://localhost:${port}`);
});
