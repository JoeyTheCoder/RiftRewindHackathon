require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;

const JobManager = require('./utils/jobManager');
const { executeRiotScript } = require('./utils/scriptExecutor');
const { generatePlayerSummary } = require('./utils/summaryGenerator');
const { generateDuoSummary } = require('./utils/duoSummaryGenerator');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, process.env.DATA_DIR || 'data');

// Ensure RIOT_API_KEY is set
if (!process.env.RIOT_API_KEY) {
  console.error('❌ ERROR: RIOT_API_KEY is not set in .env file');
  process.exit(1);
}

// Initialize job manager
const jobManager = new JobManager(DATA_DIR);

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:4200',
  credentials: true
}));
app.use(express.json());

// Initialize data directory on startup
async function initDataDirectory() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.mkdir(path.join(DATA_DIR, 'jobs'), { recursive: true });
    console.log('✅ Data directory initialized:', DATA_DIR);
  } catch (error) {
    console.error('❌ Failed to create data directory:', error);
    process.exit(1);
  }
}

// ============================================================================
// ENDPOINTS
// ============================================================================

// Simple test endpoint
app.get('/api/test', (req, res) => {
  res.json({ 
    message: 'API connected',
    config: {
      dataDir: DATA_DIR,
      hasApiKey: !!process.env.RIOT_API_KEY
    }
  });
});

/**
 * POST /api/start
 * Start a new job to fetch player data
 * Body: { gameName, tagLine, region, limit? }
 */
app.post('/api/start', async (req, res) => {
  try {
    const { gameName, tagLine, region, limit = 50 } = req.body;

    // Validate required fields
    if (!gameName || !tagLine || !region) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'gameName, tagLine, and region are required'
      });
    }

    // Cap limit at 100
    const cappedLimit = Math.min(Math.max(parseInt(limit) || 50, 1), 100);

    // CACHING DISABLED FOR NOW - causes too many issues
    // TODO: Re-enable after fixing directory structure
    // const cachedResult = await checkCachedSummary(gameName, tagLine, region.toUpperCase());
    // if (cachedResult) { ... }

    // Create job
    const jobId = await jobManager.createJob({
      gameName,
      tagLine,
      region: region.toUpperCase(),
      limit: cappedLimit
    });

    // Process job asynchronously (don't await)
    processJob(jobId).catch(error => {
      console.error(`Error processing job ${jobId}:`, error);
    });

    // Return job ID immediately
    res.json({ jobId });
  } catch (error) {
    console.error('Error creating job:', error);
    res.status(500).json({
      error: 'Failed to create job',
      message: error.message
    });
  }
});

/**
 * GET /api/status/:jobId
 * Get job status
 */
app.get('/api/status/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = await jobManager.getJob(jobId);

    if (!job) {
      return res.status(404).json({
        error: 'Job not found',
        message: `No job found with ID ${jobId}`
      });
    }

    // Return job status
    const response = {
      status: job.status,
      progress: {
        gameName: job.gameName,
        tagLine: job.tagLine,
        region: job.region,
        limit: job.limit
      }
    };

    if (job.status === 'complete' && job.result) {
      response.resultPath = `/api/result/${jobId}`;
      response.result = job.result;
    }

    if (job.status === 'error' && job.error) {
      response.error = job.error;
    }

    res.json(response);
  } catch (error) {
    console.error('Error fetching job status:', error);
    res.status(500).json({
      error: 'Failed to fetch job status',
      message: error.message
    });
  }
});

/**
 * GET /api/result/:jobId
 * Get player summary result
 */
app.get('/api/result/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = await jobManager.getJob(jobId);

    if (!job) {
      return res.status(404).json({
        error: 'Job not found',
        message: `No job found with ID ${jobId}`
      });
    }

    if (job.status !== 'complete') {
      return res.status(400).json({
        error: 'Job not complete',
        message: `Job is currently ${job.status}`,
        status: job.status
      });
    }

    if (!job.result || !job.result.summary) {
      return res.status(404).json({
        error: 'Result not found',
        message: 'Job completed but summary data is missing'
      });
    }

    res.json(job.result.summary);
  } catch (error) {
    console.error('Error fetching job result:', error);
    res.status(500).json({
      error: 'Failed to fetch job result',
      message: error.message
    });
  }
});

/**
 * GET /api/duo/:puuidA/:puuidB
 * Get duo summary for two players
 */
app.get('/api/duo/:puuidA/:puuidB', async (req, res) => {
  try {
    const { puuidA, puuidB } = req.params;
    const { region } = req.query;

    if (!region) {
      return res.status(400).json({
        error: 'Missing region parameter',
        message: 'Region query parameter is required'
      });
    }

    // Find the most recent completed job for this player
    const recentJob = await findRecentJobByPuuid(puuidA, region.toUpperCase());
    if (!recentJob) {
      return res.status(404).json({
        error: 'Player data not found',
        message: 'No recent data found for this player. Please search for them first.'
      });
    }

    console.log(`📊 Generating duo summary from job ${recentJob.id}`);
    const matchesDir = recentJob.outputDir;

    // Generate duo summary from job data
    const duoSummary = await generateDuoSummary({
      puuidA,
      puuidB,
      matchesDir,
      region: region.toUpperCase()
    });

    res.json(duoSummary);
  } catch (error) {
    console.error('Error fetching duo summary:', error);
    res.status(500).json({
      error: 'Failed to generate duo summary',
      message: error.message
    });
  }
});

// ============================================================================
// JOB PROCESSING & HELPER FUNCTIONS
// ============================================================================

/**
 * Check if we have cached summary data for a player (< 10 min old)
 * @param {string} gameName 
 * @param {string} tagLine 
 * @param {string} region 
 * @returns {Promise<Object|null>} - Cached job result or null
 */
async function checkCachedSummary(gameName, tagLine, region) {
  try {
    // Look for recent jobs with matching player info
    const jobsDir = path.join(DATA_DIR, 'jobs');
    const jobFiles = await fs.readdir(jobsDir);
    
    console.log(`   Found ${jobFiles.length} job files to check`);
    
    for (const file of jobFiles) {
      if (!file.endsWith('.json')) continue;
      
      const jobPath = path.join(jobsDir, file);
      const jobData = JSON.parse(await fs.readFile(jobPath, 'utf8'));
      
      console.log(`   Checking job: ${file}`, {
        savedName: jobData.gameName,
        savedTag: jobData.tagLine,
        savedRegion: jobData.region,
        status: jobData.status,
        age: jobData.completedAt ? Math.round((Date.now() - jobData.completedAt) / 1000) : 'N/A'
      });
      
      // Check if it matches our player and is recent
      if (jobData.gameName === gameName &&
          jobData.tagLine === tagLine &&
          jobData.region === region &&
          jobData.status === 'complete' &&
          jobData.completedAt &&
          (Date.now() - jobData.completedAt < 10 * 60 * 1000)) {
        
        console.log(`   ✅ Found cached job: ${jobData.id}`);
        return {
          jobId: jobData.id, // Job manager saves as 'id', not 'jobId'
          result: jobData.result
        };
      }
    }
    
    console.log(`   ❌ No matching cached job found`);
    return null;
  } catch (error) {
    console.error('❌ Error checking cache:', error);
    return null;
  }
}

/**
 * Find the most recent completed job for a player by PUUID
 * @param {string} puuid 
 * @param {string} region 
 * @returns {Promise<Object|null>} - Job data or null
 */
async function findRecentJobByPuuid(puuid, region) {
  try {
    const jobs = await jobManager.getAllJobs();
    
    // Find completed jobs for this region with matching PUUID in result
    const matchingJobs = jobs.filter(job => 
      job.status === 'complete' &&
      job.region === region &&
      job.result?.summary?.puuid === puuid
    );

    if (matchingJobs.length === 0) {
      return null;
    }

    // Return the most recent one
    matchingJobs.sort((a, b) => b.completedAt - a.completedAt);
    return matchingJobs[0];
  } catch (error) {
    console.error('Error finding recent job:', error);
    return null;
  }
}

/**
 * Process a job (fetch data from Riot API)
 * @param {string} jobId - Job ID
 */
async function processJob(jobId) {
  const job = await jobManager.getJob(jobId);
  if (!job) {
    throw new Error(`Job ${jobId} not found`);
  }

  try {
    await jobManager.markRunning(jobId);

    const { gameName, tagLine, region, limit } = job;

    // Create output directory for this job
    const jobOutdir = path.join(DATA_DIR, 'temp', jobId);
    await fs.mkdir(jobOutdir, { recursive: true });

    // Execute the Riot API script
    console.log(`🎮 Fetching data for ${gameName}#${tagLine} (${region})`);
    const scriptResult = await executeRiotScript({
      gameName,
      tagLine,
      region,
      count: limit,
      outdir: jobOutdir
    });

    // Generate player summary
    console.log(`📊 Generating player summary...`);
    const summary = await generatePlayerSummary({
      jobOutdir,
      gameName,
      tagLine,
      region
    });

    // Save summary to file
    // Don't worry about WSL sync for writes - just write and let it sync naturally
    const summaryPath = path.join(jobOutdir, 'summary.player.json');
    await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2), 'utf8');
    console.log(`✅ Summary saved: ${summaryPath}`);

    // Caching disabled - data stays in temp directory for now
    // The duo endpoint will find it via the job manager

    // Mark job as complete
    await jobManager.markComplete(jobId, {
      ...scriptResult,
      outputDir: jobOutdir,
      summary,
      summaryPath
    });

  } catch (error) {
    console.error(`Job ${jobId} failed:`, error);
    await jobManager.markError(jobId, error);
  }
}

// Start server
async function startServer() {
  await initDataDirectory();
  
  app.listen(PORT, () => {
    console.log(`🚀 Backend running on http://localhost:${PORT}`);
    console.log(`📁 Data directory: ${DATA_DIR}`);
  });
}

startServer().catch(console.error);
