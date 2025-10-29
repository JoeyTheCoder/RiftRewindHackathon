const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');

async function callBedrock({ region, modelId, inputText }) {
  const client = new BedrockRuntimeClient({ region });
  // Default to text models that accept JSON input with prompt
  const body = {
    inputText,
    // Some models expect different keys; this is a generic format compatible with many Cohere/Claude-like routes via Converse wrappers.
  };
  const resp = await client.send(new InvokeModelCommand({
    modelId,
    contentType: 'application/json',
    accept: 'application/json',
    body: Buffer.from(JSON.stringify(body))
  }));
  const json = JSON.parse(Buffer.from(await resp.body.transformToByteArray()).toString());
  // Try common fields
  return json.outputText || json.generation || json.output || JSON.stringify(json);
}

function buildDuoPrompt(summary) {
  const { duoKey, sampleSize, wins, queueBreakdown, synergy, championPairsTop, rolePairs, gameTexture, lowSample } = summary;
  const winrate = sampleSize > 0 ? Math.round((wins / sampleSize) * 100) : 0;
  const lines = [];
  lines.push('Summarize duo synergy in 3 sentences.');
  lines.push('Be concise, actionable, and specific.');
  lines.push(`Games together: ${sampleSize}, winrate: ${winrate}%`);
  if (synergy) {
    if (synergy.avgCombinedKA !== undefined) lines.push(`Avg combined K+A: ${synergy.avgCombinedKA}`);
    if (synergy.avgVisionScoreA !== undefined && synergy.avgVisionScoreB !== undefined) {
      lines.push(`Vision scores A/B: ${synergy.avgVisionScoreA}/${synergy.avgVisionScoreB}`);
    }
  }
  if (championPairsTop && championPairsTop.length) {
    const top = championPairsTop.slice(0, 3).map(c => `${c.pair[0]}+${c.pair[1]} (${c.wins}/${c.games})`).join('; ');
    lines.push(`Top champ pairs: ${top}`);
  }
  if (rolePairs && rolePairs.length) {
    const topR = rolePairs.slice(0, 2).map(r => `${r.pair[0]}+${r.pair[1]} (${r.wins||0}/${r.games})`).join('; ');
    lines.push(`Top role pairs: ${topR}`);
  }
  if (gameTexture?.avgGameDurationMin) lines.push(`Avg game length: ${gameTexture.avgGameDurationMin} min`);
  if (lowSample) lines.push('Note: Low sample size.');
  return lines.join('\n');
}

module.exports = { callBedrock, buildDuoPrompt };


