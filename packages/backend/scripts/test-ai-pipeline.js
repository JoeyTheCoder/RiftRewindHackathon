#!/usr/bin/env node
/**
 * Smoke test for AI insights pipeline
 * Usage: node scripts/test-ai-pipeline.js [jobId]
 */

const fs = require('fs');
const path = require('path');

// Color output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  gray: '\x1b[90m'
};

function log(msg, color = 'reset') {
  console.log(colors[color] + msg + colors.reset);
}

function pass(msg) {
  log('✓ ' + msg, 'green');
}

function fail(msg) {
  log('✗ ' + msg, 'red');
}

function info(msg) {
  log('ℹ ' + msg, 'blue');
}

async function testPlayerSummary(jobId) {
  log('\n📊 Testing PlayerSummary structure...', 'yellow');
  
  try {
    const jobPath = path.join(__dirname, '..', 'data', 'jobs', `${jobId}.json`);
    const jobData = JSON.parse(fs.readFileSync(jobPath, 'utf8'));
    
    if (!jobData.result?.summary) {
      fail('Job has no summary');
      return false;
    }
    
    const summary = jobData.result.summary;
    
    // Check required fields
    const required = ['riotId', 'region', 'puuid', 'profile', 'topChampions', 'roles', 'frequentTeammates', 'playstyle', 'meta'];
    for (const field of required) {
      if (!summary[field]) {
        fail(`Missing field: ${field}`);
        return false;
      }
    }
    pass('All required fields present');
    
    // Check playstyle structure
    const playstyle = summary.playstyle;
    const playstyleFields = ['avgKDA', 'avgVisionScore', 'totalGames', 'totalKills', 'totalDeaths', 'totalAssists'];
    for (const field of playstyleFields) {
      if (playstyle[field] === undefined) {
        fail(`Missing playstyle.${field}`);
        return false;
      }
    }
    pass('Playstyle metrics present');
    
    // Display sample data
    info(`  - Player: ${summary.riotId.gameName}#${summary.riotId.tagLine}`);
    info(`  - Sample size: ${summary.meta.sampleSize} games`);
    info(`  - Avg KDA: ${playstyle.avgKDA}`);
    info(`  - Avg Vision: ${playstyle.avgVisionScore}`);
    if (playstyle.avgKillParticipation !== null) {
      info(`  - Kill Participation: ${Math.round(playstyle.avgKillParticipation * 100)}%`);
    }
    if (playstyle.avgTeamDamageShare !== null) {
      info(`  - Team Damage Share: ${Math.round(playstyle.avgTeamDamageShare * 100)}%`);
    }
    
    // Check frequentTeammates structure
    if (summary.frequentTeammates.length > 0) {
      const tm = summary.frequentTeammates[0];
      const tmFields = ['puuid', 'summonerName', 'tagLine', 'gamesTogether', 'winsTogether', 'lastPlayedAt', 'topRolePairs', 'topChampionPairs'];
      for (const field of tmFields) {
        if (tm[field] === undefined) {
          fail(`Missing frequentTeammates[0].${field}`);
          return false;
        }
      }
      pass('FrequentTeammates structure valid');
      info(`  - Top duo: ${tm.summonerName}#${tm.tagLine} (${tm.gamesTogether} games)`);
    }
    
    return true;
  } catch (error) {
    fail(`Error reading job: ${error.message}`);
    return false;
  }
}

async function testDuoSummary(jobId) {
  log('\n🤝 Testing DuoSummary structure...', 'yellow');
  
  try {
    const jobPath = path.join(__dirname, '..', 'data', 'jobs', `${jobId}.json`);
    const jobData = JSON.parse(fs.readFileSync(jobPath, 'utf8'));
    
    if (!jobData.result?.summary?.frequentTeammates?.length) {
      info('No frequent teammates to test duo summary');
      return true;
    }
    
    const summary = jobData.result.summary;
    const puuidA = summary.puuid;
    const puuidB = summary.frequentTeammates[0].puuid;
    const region = summary.region;
    const matchesDir = jobData.outputDir;
    
    // Generate duo summary
    const { generateDuoSummary } = require('../utils/duoSummaryGenerator');
    const duoSummary = await generateDuoSummary({ puuidA, puuidB, matchesDir, region });
    
    // Check structure
    const required = ['duoKey', 'sampleSize', 'wins', 'queueBreakdown', 'rolePairs', 'championPairsTop', 'synergy', 'gameTexture', 'meta'];
    for (const field of required) {
      if (duoSummary[field] === undefined) {
        fail(`Missing field: ${field}`);
        return false;
      }
    }
    pass('All required fields present');
    
    // Check gameTexture.sidePreference
    if (!duoSummary.gameTexture.sidePreference) {
      fail('Missing gameTexture.sidePreference');
      return false;
    }
    if (duoSummary.gameTexture.sidePreference.blue === undefined || duoSummary.gameTexture.sidePreference.red === undefined) {
      fail('sidePreference missing blue/red');
      return false;
    }
    pass('Side preference tracking working');
    
    // Display sample data
    info(`  - Games together: ${duoSummary.sampleSize}`);
    info(`  - Win rate: ${Math.round((duoSummary.wins / duoSummary.sampleSize) * 100)}%`);
    info(`  - Blue side: ${duoSummary.gameTexture.sidePreference.blue} games`);
    info(`  - Red side: ${duoSummary.gameTexture.sidePreference.red} games`);
    
    return true;
  } catch (error) {
    fail(`Error generating duo summary: ${error.message}`);
    return false;
  }
}

async function testBedrockFunctions() {
  log('\n🤖 Testing Bedrock functions...', 'yellow');
  
  try {
    const { generatePlayerInsights, generateDuoInsights } = require('../utils/bedrock');
    
    if (typeof generatePlayerInsights !== 'function') {
      fail('generatePlayerInsights not exported');
      return false;
    }
    pass('generatePlayerInsights exported');
    
    if (typeof generateDuoInsights !== 'function') {
      fail('generateDuoInsights not exported');
      return false;
    }
    pass('generateDuoInsights exported');
    
    // Test with stub when disabled
    process.env.ENABLE_BEDROCK = 'false';
    
    const mockSummary = {
      riotId: { gameName: 'Test', tagLine: 'EUW' },
      region: 'EUW',
      profile: { recentWinrate: { matches: 10, wins: 5 } },
      topChampions: [],
      roles: [],
      playstyle: { avgKDA: 3.5, avgVisionScore: 20 },
      frequentTeammates: [],
      meta: { sampleSize: 10 }
    };
    
    const playerText = await generatePlayerInsights(mockSummary);
    if (playerText.includes('disabled')) {
      pass('generatePlayerInsights returns stub when disabled');
    } else {
      fail('generatePlayerInsights should return stub when disabled');
      return false;
    }
    
    const mockDuo = {
      duoKey: { puuidA: 'a', puuidB: 'b', region: 'EUW' },
      sampleSize: 5,
      wins: 3,
      synergy: {},
      championPairsTop: [],
      rolePairs: [],
      gameTexture: { sidePreference: { blue: 3, red: 2 } }
    };
    
    const duoText = await generateDuoInsights(mockDuo);
    if (duoText.includes('disabled')) {
      pass('generateDuoInsights returns stub when disabled');
    } else {
      fail('generateDuoInsights should return stub when disabled');
      return false;
    }
    
    return true;
  } catch (error) {
    fail(`Error testing Bedrock functions: ${error.message}`);
    return false;
  }
}

async function testEnvValidation() {
  log('\n⚙️  Testing environment validation...', 'yellow');
  
  try {
    const { validate } = require('../utils/env');
    
    // Save original env
    const originalEnv = { ...process.env };
    
    // Set minimal required env
    process.env.NODE_ENV = 'development';
    process.env.FRONTEND_URL = 'http://localhost:4200';
    process.env.DATA_BACKEND = 'fs';
    process.env.RIOT_API_KEY = 'RGAPI-test';
    process.env.ENABLE_BEDROCK = 'false';
    
    const config = validate();
    
    if (config.ENABLE_BEDROCK !== false) {
      fail('ENABLE_BEDROCK should be false');
      return false;
    }
    pass('Environment validation working');
    
    // Test Bedrock validation
    process.env.ENABLE_BEDROCK = 'true';
    try {
      validate();
      fail('Should require BEDROCK_REGION when enabled');
      return false;
    } catch (e) {
      if (e.code === 'ENV_MISSING_BEDROCK') {
        pass('Bedrock validation working');
      } else {
        fail(`Unexpected error: ${e.code}`);
        return false;
      }
    }
    
    // Restore env
    process.env = originalEnv;
    
    return true;
  } catch (error) {
    fail(`Error testing env validation: ${error.message}`);
    return false;
  }
}

async function main() {
  log('\n╔═══════════════════════════════════════╗', 'blue');
  log('║  AI Insights Pipeline Smoke Test     ║', 'blue');
  log('╚═══════════════════════════════════════╝', 'blue');
  
  const jobId = process.argv[2];
  
  if (!jobId) {
    log('\nUsage: node scripts/test-ai-pipeline.js <jobId>', 'gray');
    log('Example: node scripts/test-ai-pipeline.js 05aa4f67-39f6-4c5c-93c4-3996e7232262', 'gray');
    log('\nAvailable jobs:', 'gray');
    const jobsDir = path.join(__dirname, '..', 'data', 'jobs');
    if (fs.existsSync(jobsDir)) {
      const jobs = fs.readdirSync(jobsDir).filter(f => f.endsWith('.json')).slice(0, 5);
      jobs.forEach(job => log(`  - ${job.replace('.json', '')}`, 'gray'));
    }
    process.exit(1);
  }
  
  const results = [];
  
  // Run tests
  results.push(await testEnvValidation());
  results.push(await testBedrockFunctions());
  results.push(await testPlayerSummary(jobId));
  results.push(await testDuoSummary(jobId));
  
  // Summary
  const passed = results.filter(r => r).length;
  const total = results.length;
  
  log('\n' + '═'.repeat(40), 'blue');
  if (passed === total) {
    log(`✓ All ${total} tests passed!`, 'green');
    log('\n🚀 AI Insights pipeline is ready for deployment', 'blue');
    process.exit(0);
  } else {
    log(`✗ ${total - passed} of ${total} tests failed`, 'red');
    process.exit(1);
  }
}

main().catch(err => {
  fail(`Fatal error: ${err.message}`);
  console.error(err);
  process.exit(1);
});


