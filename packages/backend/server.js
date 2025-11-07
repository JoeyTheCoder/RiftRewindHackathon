require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs').promises;
const pino = require('pino');
const pinoHttp = require('pino-http');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

const { validate } = require('./utils/env');
const { createFsStorage, createS3Storage } = require('./utils/storage');
const JobManager = require('./utils/jobManager');
const { generatePlayerSummary } = require('./utils/summaryGenerator');
const { generateDuoSummary } = require('./utils/duoSummaryGenerator');
const { createRiotClient } = require('./utils/riotClient');
const { generatePlayerInsights, generateDuoInsights } = require('./utils/bedrock');

async function resolveRiotApiKey(cfg, logger) {
  if (cfg.RIOT_API_KEY) return cfg.RIOT_API_KEY;
  if (!cfg.RIOT_SECRET_ID) {
    const e = new Error('Missing Riot credentials: set RIOT_SECRET_ID or RIOT_API_KEY');
    e.code = 'ENV_MISSING_RIOT_CREDS';
    throw e;
  }
  const client = new SecretsManagerClient({});
  const resp = await client.send(new GetSecretValueCommand({ SecretId: cfg.RIOT_SECRET_ID }));
  if (!resp.SecretString) {
    const e = new Error('Secret value is empty');
    e.code = 'RIOT_SECRET_EMPTY';
    throw e;
  }
  let value = resp.SecretString.trim();
  // Support either raw token or JSON like {"RIOT_API_KEY":"..."}
  try {
    const parsed = JSON.parse(value);
    value = parsed.RIOT_API_KEY || parsed.riotApiKey || value;
  } catch (_) {
    // not JSON, keep as-is
  }
  if (!/^RGAPI-/.test(value)) {
    const m = value.match(/RGAPI-[A-Za-z0-9-]+/);
    if (m) value = m[0];
  }
  logger?.info({ secretId: cfg.RIOT_SECRET_ID, length: value.length, looksValid: /^RGAPI-/.test(value) }, 'Loaded Riot API key from Secrets Manager');
  return value;
}

function createApp() {
  const app = express();
  const cfg = validate();
  const dataRoot = cfg.DATA_BACKEND === 's3' ? '/tmp' : __dirname;
  const DATA_DIR = path.join(dataRoot, cfg.DATA_DIR || 'data');

  // Logger
  const baseLogger = pino({ level: cfg.LOG_LEVEL || 'info' });
  app.use(pinoHttp({
    logger: baseLogger,
    genReqId: (req) => req.headers['x-request-id'] || undefined,
  }));

  // Storage
  const storage = cfg.DATA_BACKEND === 's3'
    ? createS3Storage({ bucket: cfg.S3_BUCKET, prefix: cfg.S3_PREFIX })
    : createFsStorage(DATA_DIR);

  // Initialize job manager
  const jobManager = new JobManager(DATA_DIR, storage);

  // Middleware
  // Support comma-separated list in FRONTEND_URL (e.g., "https://a.com,https://b.com")
  const allowedOrigins = String(cfg.FRONTEND_URL || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  app.use(cors({ origin: allowedOrigins.length ? allowedOrigins : cfg.FRONTEND_URL, credentials: true }));
  app.use(express.json());
  app.use('/api/', rateLimit({ windowMs: 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false }));
  app.use((req, _res, next) => {
    const jobId = req.params?.jobId || req.query?.jobId || req.headers['x-job-id'];
    if (jobId && req.log) req.log = req.log.child({ jobId });
    next();
  });

  // Initialize data directory when FS backend
  async function initDataDirectory() {
    if (storage.backend === 'fs') {
      await fs.mkdir(DATA_DIR, { recursive: true });
      await fs.mkdir(path.join(DATA_DIR, 'jobs'), { recursive: true });
    }
  }

  // Healthcheck
  app.get('/api/test', async (req, res) => {
    const t = Date.now();
    const key = `healthcheck/health-${t}.txt`;
    let writeable = false;
    try {
      await storage.writeText(key, 'ok');
      const v = await storage.readText(key);
      writeable = v.trim() === 'ok';
    } catch (e) {
      req.log?.warn({ err: e }, 'healthcheck read/write failed');
    } finally {
      try { await storage.deleteObject(key); } catch (_) {}
    }
    res.json({ ok: true, time: new Date().toISOString(), dataBackend: storage.backend, writeable });
  });

  // Start job
  app.post('/api/start', async (req, res) => {
    try {
      const { gameName, tagLine, region, limit = 50 } = req.body;
      if (!gameName || !tagLine || !region) {
        return res.status(400).json({ code: 'BAD_REQUEST', message: 'gameName, tagLine, and region are required' });
      }
      const cappedLimit = Math.min(Math.max(parseInt(limit) || 50, 1), 100);
      const jobId = await jobManager.createJob({ gameName, tagLine, region: region.toUpperCase(), limit: cappedLimit });
      processJob(jobId).catch(error => baseLogger.error({ err: error }, `Error processing job ${jobId}`));
      res.json({ jobId });
    } catch (error) {
      baseLogger.error({ err: error }, 'Error creating job');
      res.status(500).json({ code: 'CREATE_JOB_FAILED', message: error.message });
    }
  });

  // Job status
  app.get('/api/status/:jobId', async (req, res) => {
    try {
      const { jobId } = req.params;
      const job = await jobManager.getJob(jobId);
      if (!job) return res.status(404).json({ code: 'NOT_FOUND', message: `No job ${jobId}` });
      const response = {
        status: job.status,
        progress: job.progress || 0,
        progressMessage: job.progressMessage || 'Processing...',
        gameName: job.gameName,
        tagLine: job.tagLine,
        region: job.region,
        limit: job.limit
      };
      if (job.status === 'complete' && job.result) { response.resultPath = `/api/result/${jobId}`; response.result = job.result; response.progress = 100; response.progressMessage = 'Complete'; }
      if (job.status === 'error' && job.error) { response.error = job.error; }
      res.json(response);
    } catch (error) {
      baseLogger.error({ err: error }, 'Error fetching job status');
      res.status(500).json({ code: 'STATUS_FAILED', message: error.message });
    }
  });

  // Job result
  app.get('/api/result/:jobId', async (req, res) => {
    try {
      const { jobId } = req.params;
      const job = await jobManager.getJob(jobId);
      if (!job) return res.status(404).json({ code: 'NOT_FOUND', message: `No job ${jobId}` });
      if (job.status !== 'complete') { return res.status(400).json({ code: 'JOB_NOT_COMPLETE', status: job.status }); }
      if (!job.result || !job.result.summary) { return res.status(404).json({ code: 'RESULT_NOT_FOUND' }); }
      res.json(job.result.summary);
    } catch (error) {
      baseLogger.error({ err: error }, 'Error fetching job result');
      res.status(500).json({ code: 'RESULT_FAILED', message: error.message });
    }
  });

  // Duo summary from cached data
  app.get('/api/duo/:puuidA/:puuidB', async (req, res) => {
    try {
      const { puuidA, puuidB } = req.params;
      const { region } = req.query;
      if (!region) return res.status(400).json({ code: 'BAD_REQUEST', message: 'region required' });
      const recentJob = await findRecentJobByPuuid(puuidA, region.toUpperCase());
      if (!recentJob) return res.status(404).json({ code: 'NOT_FOUND', message: 'No recent data for player' });
      
      // Handle old jobs that don't have outputDir field
      const matchesDir = recentJob.outputDir || path.join(DATA_DIR, 'temp', recentJob.id);
      
      const duoSummary = await generateDuoSummary({ puuidA, puuidB, matchesDir, region: region.toUpperCase() });
      res.json(duoSummary);
    } catch (error) {
      baseLogger.error({ err: error }, 'Error fetching duo summary');
      res.status(500).json({ code: 'DUO_FAILED', message: error.message });
    }
  });

  // Bedrock AI summary for duo (feature flag)
  app.post('/api/duo/ai', async (req, res) => {
    try {
      if (!cfg.ENABLE_BEDROCK) {
        return res.json({ text: 'AI insights are disabled in this environment.' });
      }
      
      const { puuidA, puuidB, region, names } = req.body || {};
      if (!puuidA || !puuidB || !region) {
        return res.status(400).json({ 
          code: 'BAD_REQUEST', 
          message: 'puuidA, puuidB, and region are required' 
        });
      }
      
      const recentJob = await findRecentJobByPuuid(puuidA, region.toUpperCase());
      if (!recentJob) {
        return res.status(404).json({ 
          code: 'NOT_FOUND', 
          message: 'No recent data found. Fetch player first.' 
        });
      }
      
      const matchesDir = recentJob.outputDir || path.join(DATA_DIR, 'temp', recentJob.id);
      
      const duoSummary = await generateDuoSummary({ 
        puuidA, 
        puuidB, 
        matchesDir, 
        region: region.toUpperCase() 
      });
      
      const text = await generateDuoInsights(duoSummary, names);
      res.json({ text });
    } catch (error) {
      baseLogger.error({ err: error }, 'Duo AI insights error');
      res.status(500).json({ 
        code: 'BEDROCK_ERROR', 
        message: error.message 
      });
    }
  });

  // Bedrock AI summary for player (feature flag)
  app.post('/api/player/ai', async (req, res) => {
    try {
      if (!cfg.ENABLE_BEDROCK) {
        return res.json({ text: 'AI insights are disabled in this environment.' });
      }
      
      const { jobId, puuid, region } = req.body || {};
      
      let playerSummary;
      
      // Option 1: Load from jobId
      if (jobId) {
        const job = await jobManager.getJob(jobId);
        if (!job) {
          return res.status(404).json({ 
            code: 'NOT_FOUND', 
            message: `Job ${jobId} not found` 
          });
        }
        if (job.status !== 'complete') {
          return res.status(400).json({ 
            code: 'JOB_NOT_COMPLETE', 
            message: 'Job is not complete yet',
            status: job.status 
          });
        }
        playerSummary = job.result?.summary;
      }
      // Option 2: Load from puuid + region
      else if (puuid && region) {
        const recentJob = await findRecentJobByPuuid(puuid, region.toUpperCase());
        if (!recentJob) {
          return res.status(404).json({ 
            code: 'NOT_FOUND', 
            message: 'No recent data found for player' 
          });
        }
        playerSummary = recentJob.result?.summary;
      } else {
        return res.status(400).json({ 
          code: 'BAD_REQUEST', 
          message: 'Either jobId or (puuid + region) required' 
        });
      }
      
      if (!playerSummary) {
        return res.status(404).json({ 
          code: 'SUMMARY_NOT_FOUND', 
          message: 'Player summary not available' 
        });
      }
      
      const text = await generatePlayerInsights(playerSummary);
      res.json({ text });
    } catch (error) {
      baseLogger.error({ err: error }, 'Player AI insights error');
      res.status(500).json({ 
        code: 'BEDROCK_ERROR', 
        message: error.message 
      });
    }
  });

  /** Helpers **/
  async function findRecentJobByPuuid(puuid, region) {
    try {
      const jobs = await jobManager.getAllJobs();
      const matchingJobs = jobs.filter(job => job.status === 'complete' && job.region === region && job.result?.summary?.puuid === puuid);
      if (matchingJobs.length === 0) return null;
      matchingJobs.sort((a, b) => b.completedAt - a.completedAt);
      return matchingJobs[0];
    } catch (error) {
      return null;
    }
  }

  async function processJob(jobId) {
    const job = await jobManager.getJob(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);
    try {
      await jobManager.markRunning(jobId);
      await jobManager.updateJob(jobId, { progress: 0, progressMessage: 'Starting data fetch...' });
      const { gameName, tagLine, region, limit } = job;
      const jobOutdir = path.join(DATA_DIR, 'temp', jobId);
      await fs.mkdir(jobOutdir, { recursive: true });

      const riotApiKey = await resolveRiotApiKey(cfg, baseLogger);
      const riot = createRiotClient({ apiKey: riotApiKey, logger: baseLogger });
      const account = await riot.getAccountByRiotId(region, gameName, tagLine);
      const puuid = account.puuid;
      const ts = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, 'Z');
      const safeName = String(gameName).replace(/\s+/g, '_');
      await fs.writeFile(path.join(jobOutdir, `account_${safeName}_${tagLine}_${ts}.json`), JSON.stringify(account, null, 2), 'utf8');

      try {
        const summoner = await riot.getSummonerByPuuid(region, puuid);
        await fs.writeFile(path.join(jobOutdir, `summoner_${safeName}_${tagLine}_${ts}.json`), JSON.stringify(summoner, null, 2), 'utf8');
      } catch (e) {
        pino().warn({ err: e.message }, 'summoner fetch failed');
      }

      const ids = await riot.getMatchIds(region, puuid, limit);
      let completedMatches = 0;
      const matchPromises = ids.map(async (id) => {
        try {
          const match = await riot.getMatch(region, id);
          completedMatches++;
          await jobManager.updateJob(jobId, { progress: Math.round((completedMatches / ids.length) * 100), progressMessage: `Fetching matches: ${completedMatches}/${ids.length}` });
          return match;
        } catch (e) {
          completedMatches++;
          pino().warn({ id, err: e.message }, 'match fetch failed');
          await jobManager.updateJob(jobId, { progress: Math.round((completedMatches / ids.length) * 100), progressMessage: `Fetching matches: ${completedMatches}/${ids.length}` });
          return null;
        }
      });
      const matchResults = await Promise.all(matchPromises);
      const matches = matchResults.filter(m => m !== null);
      await fs.writeFile(path.join(jobOutdir, `matches_${safeName}_${tagLine}_${ts}.json`), JSON.stringify(matches, null, 2), 'utf8');

      const summary = await generatePlayerSummary({ jobOutdir, gameName, tagLine, region });
      const summaryPath = path.join(jobOutdir, 'summary.player.json');
      await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2), 'utf8');

      await jobManager.markComplete(jobId, { outputDir: jobOutdir, summary, summaryPath });
    } catch (error) {
      await jobManager.markError(jobId, error);
    }
  }

  return { app, cfg, initDataDirectory };
}

module.exports = { createApp };


