#!/usr/bin/env node
/**
 * Quick test script for local insights endpoints.
 * Run: node test-ai-endpoints.js
 */

const http = require('http');

const BASE_URL = 'http://localhost:3000';

// Test data from existing completed job
const TEST_JOB_ID = '626e5306-e678-4d8a-b39b-5767a6c98f4e';
const TEST_PUUID_A = 'QudX3SbO1vnQX8884qQpDFJFqd-DwiucEVL_iPQ9pZVejIvmh6LoYUgioiXtP2yYYMYpYTZrZmjzxA';
const TEST_PUUID_B = 'fBo38EwUp8ygyf0lGLU0_x0lJFpLuELb1EvZ1iDinY2o630-Lhy3HciDRrGdDRbdwKgw1eNw2yL0RA';
const TEST_REGION = 'EUW';

function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      method,
      hostname: 'localhost',
      port: 3000,
      path,
      headers: {
        'Content-Type': 'application/json',
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, body: json });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function testPlayerAI() {
  console.log('\n🧪 Testing POST /api/player/ai');
  console.log('━'.repeat(60));
  
  try {
    const response = await makeRequest('POST', '/api/player/ai', {
      jobId: TEST_JOB_ID
    });
    
    console.log(`Status: ${response.status}`);
    console.log('Response:', JSON.stringify(response.body, null, 2));
    
    if (response.status === 200 && response.body.text) {
      console.log('✅ Player insights endpoint works!');
      console.log('\nGenerated Insights:');
      console.log('─'.repeat(60));
      console.log(response.body.text);
      console.log('─'.repeat(60));
    } else {
      console.log('⚠️  Endpoint returned unexpected response');
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

async function testDuoAI() {
  console.log('\n🧪 Testing POST /api/duo/ai');
  console.log('━'.repeat(60));
  
  try {
    const response = await makeRequest('POST', '/api/duo/ai', {
      puuidA: TEST_PUUID_A,
      puuidB: TEST_PUUID_B,
      region: TEST_REGION,
      names: {
        A: 'xSidestepcityx',
        B: 'Sapphirix'
      }
    });
    
    console.log(`Status: ${response.status}`);
    console.log('Response:', JSON.stringify(response.body, null, 2));
    
    if (response.status === 200 && response.body.text) {
      console.log('✅ Duo insights endpoint works!');
      console.log('\nGenerated Insights:');
      console.log('─'.repeat(60));
      console.log(response.body.text);
      console.log('─'.repeat(60));
    } else {
      console.log('⚠️  Endpoint returned unexpected response');
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

async function runTests() {
  console.log('🚀 Insights Endpoint Test Suite');
  console.log('═'.repeat(60));
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Test Job ID: ${TEST_JOB_ID}`);
  console.log(`Test Player: xSidestepcityx#FFG (${TEST_REGION})`);
  console.log(`Test Duo Partner: Sapphirix#FFG`);
  
  await testPlayerAI();
  await testDuoAI();
  
  console.log('\n═'.repeat(60));
  console.log('✅ Test suite complete!');
  console.log('\n💡 Notes:');
  console.log('   - These endpoints now generate stat-driven narrative summaries locally');
  console.log('   - No cloud AI provider is required for the production portfolio version');
}

// Run tests
runTests().catch(console.error);

