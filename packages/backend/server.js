require('dotenv').config();

const cors = require('cors');
const express = require('express');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs').promises;
const pino = require('pino');
const pinoHttp = require('pino-http');

const { validate } = require('./utils/env');
const { createFsStorage } = require('./utils/storage');
const JobManager = require('./utils/jobManager');
const { generatePlayerSummary } = require('./utils/summaryGenerator');
const { generateDuoSummary } = require('./utils/duoSummaryGenerator');
const { createRiotClient } = require('./utils/riotClient');
const { generatePlayerInsights, generateDuoInsights } = require('./utils/insights');

function createApp() {
  const app = express();
  const cfg = validate();
  const dataDir = path.join(__dirname, cfg.DATA_DIR);

  const baseLogger = pino({ level: cfg.LOG_LEVEL });
  app.use(pinoHttp({
    logger: baseLogger,
    genReqId: (req) => req.headers['x-request-id'] || undefined,
  }));

  const storage = createFsStorage(dataDir);
  const jobManager = new JobManager(dataDir, storage);

  const allowedOrigins = String(cfg.FRONTEND_URL || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  app.use(cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error('Origin not allowed by CORS'));
    },
    credentials: true,
  }));

  app.use(express.json());
  app.use('/api/', rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
  }));

  app.use((req, _res, next) => {
    const jobId = req.params?.jobId || req.query?.jobId || req.headers['x-job-id'];
    if (jobId && req.log) {
      req.log = req.log.child({ jobId });
    }
    next();
  });

  async function initDataDirectory() {
    await fs.mkdir(dataDir, { recursive: true });
    await fs.mkdir(path.join(dataDir, 'jobs'), { recursive: true });
    await fs.mkdir(path.join(dataDir, 'temp'), { recursive: true });
    await fs.mkdir(path.join(dataDir, 'healthcheck'), { recursive: true });
  }

  app.get('/api/test', async (req, res) => {
    const key = `healthcheck/health-${Date.now()}.txt`;
    let writeable = false;

    try {
      await storage.writeText(key, 'ok');
      const value = await storage.readText(key);
      writeable = value.trim() === 'ok';
    } catch (error) {
      req.log?.warn({ err: error }, 'Healthcheck read/write failed');
    } finally {
      try {
        await storage.deleteObject(key);
      } catch (_error) {
        // ignore cleanup failures during health checks
      }
    }

    res.json({
      ok: true,
      time: new Date().toISOString(),
      dataBackend: storage.backend,
      writeable,
    });
  });

  app.post('/api/start', async (req, res) => {
    try {
      const { gameName, tagLine, region, limit = 50 } = req.body;
      if (!gameName || !tagLine || !region) {
        return res.status(400).json({
          code: 'BAD_REQUEST',
          message: 'gameName, tagLine, and region are required',
        });
      }

      const cappedLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
      const jobId = await jobManager.createJob({
        gameName,
        tagLine,
        region: region.toUpperCase(),
        limit: cappedLimit,
      });

      processJob(jobId).catch((error) => {
        baseLogger.error({ err: error, jobId }, 'Job processing failed');
      });

      return res.json({ jobId });
    } catch (error) {
      baseLogger.error({ err: error }, 'Error creating job');
      return res.status(500).json({
        code: 'CREATE_JOB_FAILED',
        message: error.message,
      });
    }
  });

  app.get('/api/status/:jobId', async (req, res) => {
    try {
      const { jobId } = req.params;
      const job = await jobManager.getJob(jobId);
      if (!job) {
        return res.status(404).json({ code: 'NOT_FOUND', message: `No job ${jobId}` });
      }

      const response = {
        status: job.status,
        progress: job.progress || 0,
        progressMessage: job.progressMessage || 'Processing...',
        gameName: job.gameName,
        tagLine: job.tagLine,
        region: job.region,
        limit: job.limit,
      };

      if (job.status === 'complete' && job.result) {
        response.resultPath = `/api/result/${jobId}`;
        response.result = job.result;
        response.progress = 100;
        response.progressMessage = 'Complete';
      }

      if (job.status === 'error' && job.error) {
        response.error = job.error;
      }

      return res.json(response);
    } catch (error) {
      baseLogger.error({ err: error }, 'Error fetching job status');
      return res.status(500).json({ code: 'STATUS_FAILED', message: error.message });
    }
  });

  app.get('/api/result/:jobId', async (req, res) => {
    try {
      const { jobId } = req.params;
      const job = await jobManager.getJob(jobId);
      if (!job) {
        return res.status(404).json({ code: 'NOT_FOUND', message: `No job ${jobId}` });
      }

      if (job.status !== 'complete') {
        return res.status(400).json({ code: 'JOB_NOT_COMPLETE', status: job.status });
      }

      if (!job.result || !job.result.summary) {
        return res.status(404).json({ code: 'RESULT_NOT_FOUND' });
      }

      return res.json(job.result.summary);
    } catch (error) {
      baseLogger.error({ err: error }, 'Error fetching job result');
      return res.status(500).json({ code: 'RESULT_FAILED', message: error.message });
    }
  });

  app.get('/api/duo/:puuidA/:puuidB', async (req, res) => {
    try {
      const { puuidA, puuidB } = req.params;
      const { region } = req.query;
      if (!region) {
        return res.status(400).json({ code: 'BAD_REQUEST', message: 'region required' });
      }

      const recentJob = await findRecentJobByPuuid(puuidA, region.toUpperCase());
      if (!recentJob) {
        return res.status(404).json({ code: 'NOT_FOUND', message: 'No recent data for player' });
      }

      const matchesDir = recentJob.outputDir || path.join(dataDir, 'temp', recentJob.id);
      const duoSummary = await generateDuoSummary({
        puuidA,
        puuidB,
        matchesDir,
        region: region.toUpperCase(),
      });

      return res.json(duoSummary);
    } catch (error) {
      baseLogger.error({ err: error }, 'Error fetching duo summary');
      return res.status(500).json({ code: 'DUO_FAILED', message: error.message });
    }
  });

  app.post('/api/duo/ai', async (req, res) => {
    try {
      const { puuidA, puuidB, region, names } = req.body || {};
      if (!puuidA || !puuidB || !region) {
        return res.status(400).json({
          code: 'BAD_REQUEST',
          message: 'puuidA, puuidB, and region are required',
        });
      }

      const recentJob = await findRecentJobByPuuid(puuidA, region.toUpperCase());
      if (!recentJob) {
        return res.status(404).json({
          code: 'NOT_FOUND',
          message: 'No recent data found. Fetch player first.',
        });
      }

      const matchesDir = recentJob.outputDir || path.join(dataDir, 'temp', recentJob.id);
      const duoSummary = await generateDuoSummary({
        puuidA,
        puuidB,
        matchesDir,
        region: region.toUpperCase(),
      });

      const text = await generateDuoInsights(duoSummary, names);
      return res.json({ text });
    } catch (error) {
      baseLogger.error({ err: error }, 'Duo insights error');
      return res.status(500).json({ code: 'INSIGHTS_FAILED', message: error.message });
    }
  });

  app.post('/api/player/ai', async (req, res) => {
    try {
      const { jobId, puuid, region } = req.body || {};

      let playerSummary;
      if (jobId) {
        const job = await jobManager.getJob(jobId);
        if (!job) {
          return res.status(404).json({ code: 'NOT_FOUND', message: `Job ${jobId} not found` });
        }

        if (job.status !== 'complete') {
          return res.status(400).json({
            code: 'JOB_NOT_COMPLETE',
            message: 'Job is not complete yet',
            status: job.status,
          });
        }

        playerSummary = job.result?.summary;
      } else if (puuid && region) {
        const recentJob = await findRecentJobByPuuid(puuid, region.toUpperCase());
        if (!recentJob) {
          return res.status(404).json({
            code: 'NOT_FOUND',
            message: 'No recent data found for player',
          });
        }

        playerSummary = recentJob.result?.summary;
      } else {
        return res.status(400).json({
          code: 'BAD_REQUEST',
          message: 'Either jobId or (puuid + region) required',
        });
      }

      if (!playerSummary) {
        return res.status(404).json({ code: 'SUMMARY_NOT_FOUND', message: 'Player summary not available' });
      }

      const text = await generatePlayerInsights(playerSummary);
      return res.json({ text });
    } catch (error) {
      baseLogger.error({ err: error }, 'Player insights error');
      return res.status(500).json({ code: 'INSIGHTS_FAILED', message: error.message });
    }
  });

  async function findRecentJobByPuuid(puuid, region) {
    try {
      const jobs = await jobManager.getAllJobs();
      const matchingJobs = jobs
        .filter((job) => job.status === 'complete' && job.region === region && job.result?.summary?.puuid === puuid)
        .sort((left, right) => right.completedAt - left.completedAt);

      return matchingJobs[0] || null;
    } catch (_error) {
      return null;
    }
  }

  async function processJob(jobId) {
    const job = await jobManager.getJob(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    try {
      await jobManager.markRunning(jobId);
      await jobManager.updateJob(jobId, { progress: 0, progressMessage: 'Starting data fetch...' });

      const { gameName, tagLine, region, limit } = job;
      const jobOutdir = path.join(dataDir, 'temp', jobId);
      await fs.mkdir(jobOutdir, { recursive: true });

      const riot = createRiotClient({ apiKey: cfg.RIOT_API_KEY, logger: baseLogger });
      const account = await riot.getAccountByRiotId(region, gameName, tagLine);
      const puuid = account.puuid;
      const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, 'Z');
      const safeName = String(gameName).replace(/\s+/g, '_');

      await fs.writeFile(
        path.join(jobOutdir, `account_${safeName}_${tagLine}_${timestamp}.json`),
        JSON.stringify(account, null, 2),
        'utf8'
      );

      try {
        const summoner = await riot.getSummonerByPuuid(region, puuid);
        await fs.writeFile(
          path.join(jobOutdir, `summoner_${safeName}_${tagLine}_${timestamp}.json`),
          JSON.stringify(summoner, null, 2),
          'utf8'
        );
      } catch (error) {
        baseLogger.warn({ err: error, puuid }, 'Summoner fetch failed');
      }

      const ids = await riot.getMatchIds(region, puuid, limit);
      let completedMatches = 0;
      const matches = (await Promise.all(ids.map(async (matchId) => {
        try {
          const match = await riot.getMatch(region, matchId);
          completedMatches += 1;
          await jobManager.updateJob(jobId, {
            progress: Math.round((completedMatches / ids.length) * 100),
            progressMessage: `Fetching matches: ${completedMatches}/${ids.length}`,
          });
          return match;
        } catch (error) {
          completedMatches += 1;
          baseLogger.warn({ err: error, matchId }, 'Match fetch failed');
          await jobManager.updateJob(jobId, {
            progress: Math.round((completedMatches / ids.length) * 100),
            progressMessage: `Fetching matches: ${completedMatches}/${ids.length}`,
          });
          return null;
        }
      }))).filter(Boolean);

      await fs.writeFile(
        path.join(jobOutdir, `matches_${safeName}_${tagLine}_${timestamp}.json`),
        JSON.stringify(matches, null, 2),
        'utf8'
      );

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


