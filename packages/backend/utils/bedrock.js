const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');

/**
 * Call Bedrock model (supports both Claude and Amazon Titan)
 * @param {Object} params
 * @param {string} params.region - AWS region
 * @param {string} params.modelId - Bedrock model ID
 * @param {string} params.prompt - User prompt text
 * @returns {Promise<string>} - Generated text
 */
async function invokeBedrockModel({ region, modelId, prompt }) {
  const client = new BedrockRuntimeClient({ region });
  
  let body;
  
  // Different API formats for different models
  if (modelId.startsWith('anthropic.')) {
    // Claude Messages API format
    body = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: prompt }]
        }
      ]
    };
  } else if (modelId.startsWith('amazon.titan-text')) {
    // Amazon Titan format
    body = {
      inputText: prompt,
      textGenerationConfig: {
        maxTokenCount: 1024,
        temperature: 0.7,
        topP: 0.9
      }
    };
  } else {
    throw new Error(`Unsupported model: ${modelId}`);
  }

  const command = new InvokeModelCommand({
    modelId,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify(body)
  });

  const response = await client.send(command);
  const responseBody = JSON.parse(new TextDecoder().decode(response.body));
  
  // Extract text based on model type
  if (modelId.startsWith('anthropic.')) {
    // Claude Messages API returns content in array format
    if (responseBody.content && Array.isArray(responseBody.content) && responseBody.content[0]?.text) {
      return responseBody.content[0].text;
    }
  } else if (modelId.startsWith('amazon.titan-text')) {
    // Amazon Titan format
    if (responseBody.results && responseBody.results[0]?.outputText) {
      return responseBody.results[0].outputText;
    }
  }
  
  throw new Error('Unexpected Bedrock response format: ' + JSON.stringify(responseBody));
}

/**
 * Generate player insights using AI
 * @param {Object} summary - PlayerSummary object
 * @returns {Promise<string>} - AI-generated insights text
 */
async function generatePlayerInsights(summary) {
  const { ENABLE_BEDROCK, BEDROCK_REGION, BEDROCK_MODEL_ID } = require('./env').validate();
  
  if (!ENABLE_BEDROCK) {
    return 'AI insights are disabled in this environment.';
  }

  const prompt = buildPlayerPrompt(summary);
  
  try {
    return await invokeBedrockModel({
      region: BEDROCK_REGION,
      modelId: BEDROCK_MODEL_ID,
      prompt
    });
  } catch (error) {
    console.error('Bedrock player insights error:', error);
    throw new Error(`Failed to generate player insights: ${error.message}`);
  }
}

/**
 * Generate duo insights using AI
 * @param {Object} duoSummary - DuoSummary object
 * @param {Object} names - Optional player names
 * @param {string} names.A - Player A name
 * @param {string} names.B - Player B name
 * @returns {Promise<string>} - AI-generated insights text
 */
async function generateDuoInsights(duoSummary, names = {}) {
  const { ENABLE_BEDROCK, BEDROCK_REGION, BEDROCK_MODEL_ID } = require('./env').validate();
  
  if (!ENABLE_BEDROCK) {
    return 'AI insights are disabled in this environment.';
  }

  const prompt = buildDuoPrompt(duoSummary, names);
  
  try {
    return await invokeBedrockModel({
      region: BEDROCK_REGION,
      modelId: BEDROCK_MODEL_ID,
      prompt
    });
  } catch (error) {
    console.error('Bedrock duo insights error:', error);
    throw new Error(`Failed to generate duo insights: ${error.message}`);
  }
}

/**
 * Build player analysis prompt
 */
function buildPlayerPrompt(summary) {
  const { riotId, region, profile, topChampions, roles, playstyle, frequentTeammates, meta } = summary;
  const name = `${riotId.gameName}#${riotId.tagLine}`;
  const winrate = profile.recentWinrate ? 
    Math.round((profile.recentWinrate.wins / profile.recentWinrate.matches) * 100) : 0;
  
  const lines = [];
  lines.push('You are an expert League of Legends coach. Analyze this player\'s recent ranked performance and playstyle.');
  lines.push('Be concise and actionable. Use 3–5 short bullets tied to the provided stats (no generic advice).');
  lines.push('Include strengths and 2–3 targeted improvements.\n');
  lines.push(`Player: ${name} (${region})`);
  lines.push(`Recent matches: ${meta.sampleSize}, winrate: ${winrate}%`);
  
  if (playstyle) {
    lines.push(`\nPlaystyle Metrics:`);
    lines.push(`- Avg KDA: ${playstyle.avgKDA}`);
    if (playstyle.avgKillParticipation !== null) {
      lines.push(`- Kill Participation: ${Math.round(playstyle.avgKillParticipation * 100)}%`);
    }
    lines.push(`- Vision Score: ${playstyle.avgVisionScore}/game`);
    if (playstyle.avgTeamDamageShare !== null) {
      lines.push(`- Team Damage Share: ${Math.round(playstyle.avgTeamDamageShare * 100)}%`);
    }
  }

  if (topChampions && topChampions.length) {
    lines.push(`\nTop Champions:`);
    topChampions.slice(0, 5).forEach(c => {
      const wr = c.games > 0 ? Math.round((c.wins / c.games) * 100) : 0;
      lines.push(`- ${c.champion}: ${c.wins}W/${c.games}G (${wr}% WR)`);
    });
  }

  if (roles && roles.length) {
    lines.push(`\nRole Distribution:`);
    roles.slice(0, 3).forEach(r => {
      const pct = meta.sampleSize > 0 ? Math.round((r.games / meta.sampleSize) * 100) : 0;
      lines.push(`- ${r.teamPosition}: ${r.games} games (${pct}%)`);
    });
  }

  if (frequentTeammates && frequentTeammates.length > 0) {
    const topDuo = frequentTeammates[0];
    lines.push(`\nMost frequent duo: ${topDuo.summonerName}#${topDuo.tagLine} (${topDuo.gamesTogether} games together)`);
  }

  return lines.join('\n');
}

/**
 * Build duo synergy prompt
 */
function buildDuoPrompt(summary, names = {}) {
  const { duoKey, sampleSize, wins, synergy, championPairsTop, rolePairs, gameTexture, lowSample } = summary;
  const winrate = sampleSize > 0 ? Math.round((wins / sampleSize) * 100) : 0;
  
  const nameA = names.A || 'Player A';
  const nameB = names.B || 'Player B';
  
  const lines = [];
  lines.push('You are an expert League of Legends duo coach.');
  lines.push('Provide concise, actionable synergy advice for these two players.');
  lines.push('Use 3–5 short bullets. Cover strongest champion/role pairings, coordination strengths, lane/vision habits,');
  lines.push('and 2–3 specific improvements to raise win rate. Tie each point to the supplied stats.\n');
  
  lines.push(`Players: ${nameA} + ${nameB}`);
  lines.push(`Region: ${duoKey.region}`);
  lines.push(`Games together: ${sampleSize}, wins: ${wins}, winrate: ${winrate}%`);
  
  if (lowSample) {
    lines.push(`Note: Low sample size (fewer than 5 games)`);
  }

  if (synergy) {
    lines.push(`\nSynergy Metrics:`);
    if (synergy.avgCombinedKA !== undefined) {
      lines.push(`- Combined K+A per game: ${synergy.avgCombinedKA}`);
    }
    if (synergy.avgKillParticipationA !== null && synergy.avgKillParticipationB !== null) {
      lines.push(`- Kill Participation: ${Math.round(synergy.avgKillParticipationA * 100)}% / ${Math.round(synergy.avgKillParticipationB * 100)}%`);
    }
    if (synergy.avgVisionScoreA !== undefined && synergy.avgVisionScoreB !== undefined) {
      lines.push(`- Vision Scores: ${synergy.avgVisionScoreA} / ${synergy.avgVisionScoreB}`);
    }
    if (synergy.avgTeamDamagePctA !== null && synergy.avgTeamDamagePctB !== null) {
      lines.push(`- Team Damage Share: ${Math.round(synergy.avgTeamDamagePctA * 100)}% / ${Math.round(synergy.avgTeamDamagePctB * 100)}%`);
    }
  }

  if (championPairsTop && championPairsTop.length) {
    lines.push(`\nTop Champion Pairs:`);
    championPairsTop.slice(0, 3).forEach(c => {
      const wr = c.games > 0 ? Math.round((c.wins / c.games) * 100) : 0;
      lines.push(`- ${c.pair[0]} + ${c.pair[1]}: ${c.wins}W/${c.games}G (${wr}% WR)`);
    });
  }

  if (rolePairs && rolePairs.length) {
    lines.push(`\nTop Role Pairs:`);
    rolePairs.slice(0, 2).forEach(r => {
      const wr = r.games > 0 ? Math.round((r.wins / r.games) * 100) : 0;
      lines.push(`- ${r.pair[0]} + ${r.pair[1]}: ${r.wins || 0}W/${r.games}G (${wr}% WR)`);
    });
  }

  if (gameTexture) {
    lines.push(`\nGame Texture:`);
    if (gameTexture.avgGameDurationMin) {
      lines.push(`- Avg game length: ${gameTexture.avgGameDurationMin} minutes`);
    }
    if (gameTexture.sidePreference) {
      const total = gameTexture.sidePreference.blue + gameTexture.sidePreference.red;
      const bluePct = total > 0 ? Math.round((gameTexture.sidePreference.blue / total) * 100) : 50;
      lines.push(`- Side preference: ${bluePct}% Blue, ${100 - bluePct}% Red`);
    }
  }

  return lines.join('\n');
}

module.exports = { 
  generatePlayerInsights, 
  generateDuoInsights,
  invokeBedrockModel // for direct use if needed
};


