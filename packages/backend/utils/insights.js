function percent(value) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return null;
  }

  return Math.round(value * 100);
}

function roleName(role) {
  const names = {
    TOP: 'top lane',
    JUNGLE: 'jungle',
    MIDDLE: 'mid lane',
    BOTTOM: 'bot lane',
    UTILITY: 'support',
    SUPPORT: 'support',
    UNKNOWN: 'fill',
  };

  return names[role] || role?.toLowerCase() || 'fill';
}

function buildPlaystyleLine(playstyle) {
  if (!playstyle) {
    return null;
  }

  const parts = [`Average KDA sits at ${playstyle.avgKDA}`];
  const killParticipation = percent(playstyle.avgKillParticipation);
  const damageShare = percent(playstyle.avgTeamDamageShare);

  if (killParticipation !== null) {
    parts.push(`${killParticipation}% kill participation`);
  }

  parts.push(`${playstyle.avgVisionScore} vision per game`);

  if (damageShare !== null) {
    parts.push(`${damageShare}% team damage share`);
  }

  return `${parts.join(', ')}.`;
}

function buildImprovementLine(playstyle) {
  if (!playstyle) {
    return 'Keep building sample size before drawing hard conclusions.';
  }

  const killParticipation = percent(playstyle.avgKillParticipation);
  const damageShare = percent(playstyle.avgTeamDamageShare);

  if (killParticipation !== null && killParticipation < 45) {
    return 'The biggest improvement lever is earlier teamfight involvement; rotate sooner around contested objectives and skirmishes.';
  }

  if (playstyle.avgVisionScore !== undefined && playstyle.avgVisionScore < 20) {
    return 'Vision is the cleanest upgrade path; one more reset for wards before dragon or Baron setups will raise consistency fast.';
  }

  if (damageShare !== null && damageShare < 20) {
    return 'Damage share is a bit light, so cleaner lane priority and more confident windows to trade should increase impact.';
  }

  return 'The current profile looks stable, so the next gain is tightening champion select around the strongest comfort picks and role pairings.';
}

async function generatePlayerInsights(summary) {
  const lines = [];
  const playerName = `${summary.riotId.gameName}#${summary.riotId.tagLine}`;
  const sampleSize = summary.meta?.sampleSize || 0;
  const wins = summary.profile?.recentWinrate?.wins || 0;
  const matches = summary.profile?.recentWinrate?.matches || sampleSize;
  const winRate = matches > 0 ? Math.round((wins / matches) * 100) : 0;
  const topChampion = summary.topChampions?.[0];
  const mainRole = summary.roles?.[0];
  const frequentTeammate = summary.frequentTeammates?.[0];

  lines.push(`- ${playerName} is sitting at ${winRate}% win rate over ${sampleSize} ranked games, which gives a solid read on current form.`);

  if (topChampion) {
    const championWinRate = topChampion.games > 0 ? Math.round((topChampion.wins / topChampion.games) * 100) : 0;
    lines.push(`- ${topChampion.champion} is the clear comfort pick with ${topChampion.games} games and ${championWinRate}% wins, so that champion should stay central when the goal is consistency.`);
  }

  if (mainRole) {
    lines.push(`- Most games are played from ${roleName(mainRole.teamPosition)}, so matchup prep and champion depth there will pay off more than spreading practice across every role.`);
  }

  const playstyleLine = buildPlaystyleLine(summary.playstyle);
  if (playstyleLine) {
    lines.push(`- ${playstyleLine}`);
  }

  if (frequentTeammate) {
    const duoWinRate = frequentTeammate.gamesTogether > 0
      ? Math.round((frequentTeammate.winsTogether / frequentTeammate.gamesTogether) * 100)
      : 0;
    lines.push(`- The most reliable duo partner is ${frequentTeammate.summonerName}#${frequentTeammate.tagLine} with ${frequentTeammate.gamesTogether} shared matches and ${duoWinRate}% wins together.`);
  }

  lines.push(`- ${buildImprovementLine(summary.playstyle)}`);
  return lines.join('\n');
}

function buildDuoImprovementLine(summary) {
  const games = summary.sampleSize || 0;
  if (games < 5) {
    return 'The sample is still small, so prioritize getting more games together before changing too much.';
  }

  const kpA = percent(summary.synergy?.avgKillParticipationA);
  const kpB = percent(summary.synergy?.avgKillParticipationB);
  const visionA = summary.synergy?.avgVisionScoreA;
  const visionB = summary.synergy?.avgVisionScoreB;

  if ((kpA !== null && kpA < 45) || (kpB !== null && kpB < 45)) {
    return 'The duo can gain the most by syncing earlier on fights and objective timers so both players arrive on the same window more often.';
  }

  if ((visionA !== undefined && visionA < 20) || (visionB !== undefined && visionB < 20)) {
    return 'Map control is the easiest upgrade here; better ward timing before dragon setups should convert into cleaner mid-game wins.';
  }

  return 'The duo already has a workable baseline, so the next step is leaning harder into the best role pairings and champion combinations instead of forcing low-synergy drafts.';
}

async function generateDuoInsights(summary, names = {}) {
  const lines = [];
  const playerA = names.A || 'Player A';
  const playerB = names.B || 'Player B';
  const winRate = summary.sampleSize > 0 ? Math.round((summary.wins / summary.sampleSize) * 100) : 0;
  const topChampionPair = summary.championPairsTop?.[0];
  const topRolePair = summary.rolePairs?.[0];
  const sidePreference = summary.gameTexture?.sidePreference;

  lines.push(`- ${playerA} and ${playerB} have played ${summary.sampleSize} ranked games together with ${winRate}% wins, which points to ${winRate >= 50 ? 'a positive' : 'an uneven'} baseline synergy.`);

  if (topChampionPair) {
    const pairWinRate = topChampionPair.games > 0 ? Math.round((topChampionPair.wins / topChampionPair.games) * 100) : 0;
    lines.push(`- The strongest champion pairing is ${topChampionPair.pair[0]} plus ${topChampionPair.pair[1]}, delivering ${pairWinRate}% wins over ${topChampionPair.games} games.`);
  }

  if (topRolePair) {
    lines.push(`- The most natural map split is ${roleName(topRolePair.pair[0])} with ${roleName(topRolePair.pair[1])}, so draft and pathing should keep reinforcing that pattern.`);
  }

  if (summary.synergy) {
    const combinedKa = summary.synergy.avgCombinedKA;
    const kpA = percent(summary.synergy.avgKillParticipationA);
    const kpB = percent(summary.synergy.avgKillParticipationB);
    lines.push(`- Coordination shows up in ${combinedKa} combined kills plus assists per game${kpA !== null && kpB !== null ? ` and ${kpA}%/${kpB}% kill participation` : ''}.`);
  }

  if (sidePreference) {
    const totalSides = (sidePreference.blue || 0) + (sidePreference.red || 0);
    if (totalSides > 0) {
      const blueRate = Math.round(((sidePreference.blue || 0) / totalSides) * 100);
      lines.push(`- Match history is split ${blueRate}% blue side and ${100 - blueRate}% red side, which is useful context when reading small sample spikes.`);
    }
  }

  lines.push(`- ${buildDuoImprovementLine(summary)}`);
  return lines.join('\n');
}

module.exports = {
  generatePlayerInsights,
  generateDuoInsights,
};