#!/usr/bin/env node
/**
 * Regenerate player summary for an existing job
 * Usage: node scripts/regenerate-summary.js <jobId>
 */

const fs = require('fs').promises;
const path = require('path');
const { generatePlayerSummary } = require('../utils/summaryGenerator');

async function regenerateSummary(jobId) {
  const jobPath = path.join(__dirname, '..', 'data', 'jobs', `${jobId}.json`);
  
  try {
    const jobData = JSON.parse(await fs.readFile(jobPath, 'utf8'));
    
    if (jobData.status !== 'complete') {
      console.error('Job is not complete');
      process.exit(1);
    }
    
    const { gameName, tagLine, region } = jobData;
    const jobOutdir = jobData.result.outputDir;
    
    console.log(`Regenerating summary for ${gameName}#${tagLine} (${region})...`);
    
    const summary = await generatePlayerSummary({ jobOutdir, gameName, tagLine, region });
    
    // Update job file
    jobData.result.summary = summary;
    
    // Write updated summary to summary.player.json
    const summaryPath = path.join(jobOutdir, 'summary.player.json');
    await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2), 'utf8');
    
    // Write updated job file
    await fs.writeFile(jobPath, JSON.stringify(jobData, null, 2), 'utf8');
    
    console.log('✓ Summary regenerated successfully');
    console.log(`  - Playstyle: avgKDA=${summary.playstyle.avgKDA}, avgVision=${summary.playstyle.avgVisionScore}`);
    console.log(`  - Written to: ${summaryPath}`);
    
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

const jobId = process.argv[2];
if (!jobId) {
  console.log('Usage: node scripts/regenerate-summary.js <jobId>');
  process.exit(1);
}

regenerateSummary(jobId);


