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
const { callBedrock, buildDuoPrompt } = require('./utils/bedrock');

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
  logger?.info({ secretId: cfg.RIOT_SECRET_ID }, 'Loaded Riot API key from Secrets Manager');
  return resp.SecretString;
}

function createApp() {
  const app = express();
  const cfg = validate();
  const DATA_DIR = path.join(__dirname, cfg.DATA_DIR || 'data');

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
  app.use(cors({ origin: cfg.FRONTEND_URL, credentials: true }));
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
        progress: { gameName: job.gameName, tagLine: job.tagLine, region: job.region, limit: job.limit }
      };
      if (job.status === 'complete' && job.result) { response.resultPath = `/api/result/${jobId}`; response.result = job.result; }
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
      const matchesDir = recentJob.outputDir;
      const duoSummary = await generateDuoSummary({ puuidA, puuidB, matchesDir, region: region.toUpperCase() });
      res.json(duoSummary);
    } catch (error) {
      baseLogger.error({ err: error }, 'Error fetching duo summary');
      res.status(500).json({ code: 'DUO_FAILED', message: error.message });
    }
  });

  // Bedrock AI summary (feature flag)
  app.post('/api/duo/ai', async (req, res) => {
    try {
      if (!cfg.ENABLE_BEDROCK) return res.status(404).json({ code: 'BEDROCK_DISABLED', message: 'Bedrock not enabled' });
      const { puuidA, puuidB, region } = req.body || {};
      if (!puuidA || !puuidB || !region) return res.status(400).json({ code: 'BAD_REQUEST', message: 'puuidA, puuidB, region required' });
      const recentJob = await findRecentJobByPuuid(puuidA, region.toUpperCase());
      if (!recentJob) return res.status(404).json({ code: 'NOT_FOUND', message: 'No recent data found. Fetch player first.' });
      const duoSummary = await generateDuoSummary({ puuidA, puuidB, matchesDir: recentJob.outputDir, region: region.toUpperCase() });
      const prompt = buildDuoPrompt(duoSummary);
      const text = await callBedrock({ region: cfg.BEDROCK_REGION, modelId: cfg.BEDROCK_MODEL_ID, inputText: prompt });
      res.json({ text });
    } catch (error) {
      res.status(500).json({ code: 'BEDROCK_ERROR', message: error.message, details: error.details });
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
      const matches = [];
      for (const id of ids) {
        try { matches.push(await riot.getMatch(region, id)); } catch (e) { pino().warn({ id, err: e.message }, 'match fetch failed'); }
      }
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


