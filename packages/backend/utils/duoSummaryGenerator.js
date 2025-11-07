const fs = require('fs').promises;
const path = require('path');

/**
 * Generate duo summary from cached match data
 * Only looks at matches where both players were on the same team
 * 
 * @param {Object} params
 * @param {string} params.puuidA - Player A's PUUID
 * @param {string} params.puuidB - Player B's PUUID (teammate)
 * @param {string} params.matchesDir - Directory containing matches JSON
 * @param {string} params.region - Region
 * @returns {Promise<Object>} - Duo summary
 */
async function generateDuoSummary(params) {
  const { puuidA, puuidB, matchesDir, region } = params;

  console.log(`📊 Generating duo summary for ${puuidA.substring(0, 8)}... + ${puuidB.substring(0, 8)}...`);

  // Find matches file
  let files;
  try {
    files = await fs.readdir(matchesDir);
  } catch (error) {
    throw new Error(`Failed to list files in directory: ${error.message}`);
  }
  const matchesFile = files.find(f => f.startsWith('matches_') && !f.includes('summary'));

  if (!matchesFile) {
    throw new Error('No matches file found');
  }

  // Read matches data
  const matchesData = JSON.parse(await fs.readFile(path.join(matchesDir, matchesFile), 'utf8'));

  // Filter to ranked matches only
  const rankedMatches = matchesData.filter(match => {
    const queueId = match.info?.queueId;
    return queueId === 420 || queueId === 440;
  });

  // Find matches where both players were on the same team
  const duoMatches = rankedMatches.filter(match => {
    const participants = match.info.participants;
    const playerA = participants.find(p => p.puuid === puuidA);
    const playerB = participants.find(p => p.puuid === puuidB);

    // Both must be in the match and on the same team
    return playerA && playerB && playerA.teamId === playerB.teamId;
  });

  console.log(`   Found ${duoMatches.length} duo matches together`);

  if (duoMatches.length === 0) {
    return {
      duoKey: { puuidA, puuidB, region },
      sampleSize: 0,
      wins: 0,
      message: 'No matches found playing together'
    };
  }

  // Calculate statistics
  const summary = {
    duoKey: { puuidA, puuidB, region },
    sampleSize: duoMatches.length,
    wins: 0,
    queueBreakdown: {},
    rolePairs: {},
    championPairsTop: [],
    synergy: {},
    gameTexture: {},
    meta: {
      queueFilter: [420, 440],
      generatedAt: Date.now()
    }
  };

  // Track data for calculations
  const championPairCounts = {};
  const rolePairCounts = {};
  const patchCounts = {};
  const sideCounts = { blue: 0, red: 0 };
  
  let totalGameDuration = 0;
  let totalCombinedKA = 0;
  let totalKPa = 0;
  let totalKPb = 0;
  let totalVisionA = 0;
  let totalVisionB = 0;
  let totalDamagePctA = 0;
  let totalDamagePctB = 0;
  let countWithData = 0;

  for (const match of duoMatches) {
    const info = match.info;
    const participants = info.participants;
    
    const playerA = participants.find(p => p.puuid === puuidA);
    const playerB = participants.find(p => p.puuid === puuidB);

    // Count wins
    if (playerA.win) summary.wins++;

    // Queue breakdown
    const queueId = info.queueId;
    if (!summary.queueBreakdown[queueId]) {
      summary.queueBreakdown[queueId] = { games: 0, wins: 0 };
    }
    summary.queueBreakdown[queueId].games++;
    if (playerA.win) summary.queueBreakdown[queueId].wins++;

    // Role pairs
    const roleA = playerA.teamPosition || 'UNKNOWN';
    const roleB = playerB.teamPosition || 'UNKNOWN';
    const rolePairKey = [roleA, roleB].sort().join('-');
    
    if (!rolePairCounts[rolePairKey]) {
      rolePairCounts[rolePairKey] = { pair: [roleA, roleB], games: 0, wins: 0 };
    }
    rolePairCounts[rolePairKey].games++;
    if (playerA.win) rolePairCounts[rolePairKey].wins++;

    // Champion pairs
    const champA = playerA.championName;
    const champB = playerB.championName;
    const champPairKey = [champA, champB].sort().join('-');
    
    if (!championPairCounts[champPairKey]) {
      championPairCounts[champPairKey] = { pair: [champA, champB], games: 0, wins: 0 };
    }
    championPairCounts[champPairKey].games++;
    if (playerA.win) championPairCounts[champPairKey].wins++;

    // Game duration
    totalGameDuration += info.gameDuration || 0;

    // Track side (blue=100, red=200)
    const side = playerA.teamId === 100 ? 'blue' : 'red';
    sideCounts[side]++;

    // Patch tracking
    const version = info.gameVersion || '';
    const patch = version.split('.').slice(0, 2).join('.');
    if (patch) {
      if (!patchCounts[patch]) {
        patchCounts[patch] = { games: 0, wins: 0 };
      }
      patchCounts[patch].games++;
      if (playerA.win) patchCounts[patch].wins++;
    }

    // Synergy stats (average over matches where data exists)
    const kA = playerA.kills || 0;
    const aA = playerA.assists || 0;
    const kB = playerB.kills || 0;
    const aB = playerB.assists || 0;

    totalCombinedKA += (kA + aA + kB + aB);

    if (playerA.challenges?.killParticipation !== undefined) {
      totalKPa += playerA.challenges.killParticipation;
      countWithData++;
    }
    if (playerB.challenges?.killParticipation !== undefined) {
      totalKPb += playerB.challenges.killParticipation;
    }

    totalVisionA += playerA.visionScore || 0;
    totalVisionB += playerB.visionScore || 0;

    if (playerA.challenges?.teamDamagePercentage !== undefined) {
      totalDamagePctA += playerA.challenges.teamDamagePercentage;
    }
    if (playerB.challenges?.teamDamagePercentage !== undefined) {
      totalDamagePctB += playerB.challenges.teamDamagePercentage;
    }
  }

  // Format role pairs
  summary.rolePairs = Object.values(rolePairCounts)
    .sort((a, b) => b.games - a.games);

  // Format champion pairs (top 10)
  summary.championPairsTop = Object.values(championPairCounts)
    .sort((a, b) => b.games - a.games)
    .slice(0, 10);

  // Calculate synergy averages
  const matchCount = duoMatches.length;
  summary.synergy = {
    avgCombinedKA: Math.round((totalCombinedKA / matchCount) * 10) / 10,
    avgKillParticipationA: countWithData > 0 ? Math.round((totalKPa / countWithData) * 100) / 100 : null,
    avgKillParticipationB: countWithData > 0 ? Math.round((totalKPb / countWithData) * 100) / 100 : null,
    avgVisionScoreA: Math.round((totalVisionA / matchCount) * 10) / 10,
    avgVisionScoreB: Math.round((totalVisionB / matchCount) * 10) / 10,
    avgTeamDamagePctA: countWithData > 0 ? Math.round((totalDamagePctA / countWithData) * 100) / 100 : null,
    avgTeamDamagePctB: countWithData > 0 ? Math.round((totalDamagePctB / countWithData) * 100) / 100 : null
  };

  // Game texture
  summary.gameTexture = {
    avgGameDurationMin: Math.round((totalGameDuration / matchCount / 60) * 10) / 10,
    sidePreference: {
      blue: sideCounts.blue,
      red: sideCounts.red
    },
    byPatch: Object.entries(patchCounts)
      .map(([patch, data]) => ({ patch, games: data.games, wins: data.wins }))
      .sort((a, b) => b.games - a.games)
  };

  // Low sample warning
  if (matchCount < 5) {
    summary.lowSample = true;
  }

  return summary;
}

module.exports = {
  generateDuoSummary
};

