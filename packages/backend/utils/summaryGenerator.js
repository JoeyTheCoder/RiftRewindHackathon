const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');

/**
 * Generate player summary from match data
 * Following the spec from project instructions
 * 
 * @param {Object} params
 * @param {string} params.jobOutdir - Directory containing raw JSON files
 * @param {string} params.gameName - Player's game name
 * @param {string} params.tagLine - Player's tag line
 * @param {string} params.region - Region
 * @returns {Promise<Object>} - Player summary
 */
async function generatePlayerSummary(params) {
  const { jobOutdir, gameName, tagLine, region } = params;

  console.log(`📊 Generating player summary for ${gameName}#${tagLine}...`);
  console.log(`   Looking in directory: ${jobOutdir}`);

  // Use WSL to list and read files directly (bypasses filesystem sync issues)
  const wslPath = jobOutdir.replace(/\\/g, '/').replace(/^([A-Z]):/, (_, drive) => 
    `/mnt/${drive.toLowerCase()}`
  );
  
  console.log(`   WSL path: ${wslPath}`);
  
  // List files using WSL
  let filesOutput;
  try {
    filesOutput = execSync(`wsl ls "${wslPath}"`, { encoding: 'utf8' });
  } catch (error) {
    throw new Error(`Failed to list files in WSL directory: ${error.message}`);
  }
  
  const files = filesOutput.trim().split('\n').filter(f => f);
  console.log(`   Found ${files.length} files via WSL:`, files);
  
  const accountFile = files.find(f => f.startsWith('account_'));
  const summonerFile = files.find(f => f.startsWith('summoner_'));
  const matchesFile = files.find(f => f.startsWith('matches_') && !f.includes('summary'));
  
  console.log(`   account: ${accountFile}, summoner: ${summonerFile}, matches: ${matchesFile}`);
  
  if (!accountFile || !matchesFile) {
    throw new Error(`Missing required data files. Found: account=${!!accountFile}, matches=${!!matchesFile}`);
  }

  // Read the JSON files using WSL cat
  console.log(`   Reading files via WSL...`);
  const accountData = JSON.parse(
    execSync(`wsl cat "${wslPath}/${accountFile}"`, { encoding: 'utf8' })
  );
  const matchesData = JSON.parse(
    execSync(`wsl cat "${wslPath}/${matchesFile}"`, { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 }) // 50MB buffer for large match files
  );
  
  let summonerData = null;
  let leagueData = null;
  
  if (summonerFile) {
    summonerData = JSON.parse(
      execSync(`wsl cat "${wslPath}/${summonerFile}"`, { encoding: 'utf8' })
    );
    
    // Try to find league entries file
    const leagueFile = files.find(f => f.startsWith('league_entries_'));
    if (leagueFile) {
      leagueData = JSON.parse(
        execSync(`wsl cat "${wslPath}/${leagueFile}"`, { encoding: 'utf8' })
      );
    }
  }

  const puuid = accountData.puuid;

  // Filter matches to only ranked (420 = Solo/Duo, 440 = Flex)
  const rankedMatches = matchesData.filter(match => {
    const queueId = match.info?.queueId;
    return queueId === 420 || queueId === 440;
  });

  console.log(`   Found ${rankedMatches.length} ranked matches (filtered from ${matchesData.length} total)`);

  // Build the summary
  const summary = {
    riotId: { gameName, tagLine },
    region: region.toUpperCase(),
    puuid,
    profile: buildProfile(summonerData, leagueData, rankedMatches, puuid),
    topChampions: calculateTopChampions(rankedMatches, puuid),
    roles: calculateRoles(rankedMatches, puuid),
    frequentTeammates: calculateFrequentTeammates(rankedMatches, puuid),
    meta: {
      queueFilter: [420, 440],
      sampleSize: rankedMatches.length,
      generatedAt: Date.now()
    }
  };

  return summary;
}

/**
 * Build profile section
 */
function buildProfile(summonerData, leagueData, rankedMatches, puuid) {
  const profile = {};

  if (summonerData) {
    profile.profileIconId = summonerData.profileIconId;
    profile.summonerLevel = summonerData.summonerLevel;
  }

  // Parse rank data
  if (leagueData && Array.isArray(leagueData)) {
    profile.rank = {};
    
    for (const entry of leagueData) {
      const queueType = entry.queueType; // "RANKED_SOLO_5x5" or "RANKED_FLEX_SR"
      profile.rank[queueType] = {
        tier: entry.tier,
        rank: entry.rank,
        lp: entry.leaguePoints,
        wins: entry.wins,
        losses: entry.losses
      };
    }
  }

  // Calculate recent winrate from matches
  const wins = rankedMatches.filter(match => {
    const participant = match.info.participants.find(p => p.puuid === puuid);
    return participant?.win === true;
  }).length;

  profile.recentWinrate = {
    matches: rankedMatches.length,
    wins
  };

  return profile;
}

/**
 * Calculate top champions
 */
function calculateTopChampions(matches, puuid) {
  const championStats = {};

  for (const match of matches) {
    const participant = match.info.participants.find(p => p.puuid === puuid);
    if (!participant) continue;

    const champ = participant.championName;
    if (!championStats[champ]) {
      championStats[champ] = { champion: champ, games: 0, wins: 0 };
    }

    championStats[champ].games++;
    if (participant.win) {
      championStats[champ].wins++;
    }
  }

  // Sort by games played, return top champions
  return Object.values(championStats)
    .sort((a, b) => b.games - a.games)
    .slice(0, 10);
}

/**
 * Calculate role distribution
 */
function calculateRoles(matches, puuid) {
  const roleStats = {};

  for (const match of matches) {
    const participant = match.info.participants.find(p => p.puuid === puuid);
    if (!participant) continue;

    const role = participant.teamPosition || 'UNKNOWN';
    if (!roleStats[role]) {
      roleStats[role] = { teamPosition: role, games: 0 };
    }

    roleStats[role].games++;
  }

  // Sort by games played
  return Object.values(roleStats)
    .sort((a, b) => b.games - a.games);
}

/**
 * Calculate frequent teammates (Top 10)
 */
function calculateFrequentTeammates(matches, puuid) {
  const teammateStats = {};

  for (const match of matches) {
    const participants = match.info.participants;
    const player = participants.find(p => p.puuid === puuid);
    if (!player) continue;

    const playerTeam = player.teamId;
    const timestamp = match.info.gameCreation || match.info.gameEndTimestamp || 0;

    // Find all teammates (same team, not self)
    const teammates = participants.filter(p => 
      p.teamId === playerTeam && p.puuid !== puuid
    );

    for (const teammate of teammates) {
      const tPuuid = teammate.puuid;
      
      if (!teammateStats[tPuuid]) {
        teammateStats[tPuuid] = {
          puuid: tPuuid,
          summonerName: teammate.riotIdGameName || teammate.summonerName || 'Unknown',
          tagLine: teammate.riotIdTagline || '',
          gamesTogether: 0,
          winsTogether: 0,
          lastPlayedAt: 0,
          rolePairs: {},
          championPairs: {}
        };
      }

      const stats = teammateStats[tPuuid];
      stats.gamesTogether++;
      if (player.win) stats.winsTogether++;
      if (timestamp > stats.lastPlayedAt) stats.lastPlayedAt = timestamp;

      // Track role pairs
      const rolePair = [player.teamPosition || 'UNKNOWN', teammate.teamPosition || 'UNKNOWN'].sort().join('-');
      stats.rolePairs[rolePair] = (stats.rolePairs[rolePair] || 0) + 1;

      // Track champion pairs
      const champPair = [player.championName, teammate.championName].sort().join('-');
      stats.championPairs[champPair] = (stats.championPairs[champPair] || 0) + 1;
    }
  }

  // Convert to array and sort by games together
  const teammates = Object.values(teammateStats)
    .sort((a, b) => b.gamesTogether - a.gamesTogether)
    .slice(0, 10); // Top 10

  // Format the output
  return teammates.map(tm => {
    // Top role pairs
    const topRolePairs = Object.entries(tm.rolePairs)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([pair]) => pair.split('-'));

    // Top champion pairs
    const topChampionPairs = Object.entries(tm.championPairs)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([pair]) => pair.split('-'));

    return {
      puuid: tm.puuid,
      summonerName: tm.summonerName,
      tagLine: tm.tagLine,
      gamesTogether: tm.gamesTogether,
      winsTogether: tm.winsTogether,
      lastPlayedAt: tm.lastPlayedAt,
      topRolePairs,
      topChampionPairs
    };
  });
}

module.exports = {
  generatePlayerSummary
};

