const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

class JobManager {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.jobsDir = path.join(dataDir, 'jobs');
  }

  /**
   * Create a new job
   * @param {Object} jobData - Job data (gameName, tagLine, region, limit)
   * @returns {Promise<string>} - Job ID
   */
  async createJob(jobData) {
    const jobId = uuidv4();
    const job = {
      id: jobId,
      status: 'queued',
      ...jobData,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    await this.saveJob(jobId, job);
    console.log(`📝 Created job ${jobId}`);
    return jobId;
  }

  /**
   * Get job by ID
   * @param {string} jobId - Job ID
   * @returns {Promise<Object|null>} - Job data or null
   */
  async getJob(jobId) {
    try {
      const jobFile = path.join(this.jobsDir, `${jobId}.json`);
      const data = await fs.readFile(jobFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Update job status
   * @param {string} jobId - Job ID
   * @param {Object} updates - Updates to apply
   * @returns {Promise<void>}
   */
  async updateJob(jobId, updates) {
    const job = await this.getJob(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    const updatedJob = {
      ...job,
      ...updates,
      updatedAt: Date.now()
    };

    await this.saveJob(jobId, updatedJob);
  }

  /**
   * Mark job as running
   * @param {string} jobId - Job ID
   * @returns {Promise<void>}
   */
  async markRunning(jobId) {
    await this.updateJob(jobId, { status: 'running', startedAt: Date.now() });
    console.log(`▶️  Job ${jobId} started`);
  }

  /**
   * Mark job as complete
   * @param {string} jobId - Job ID
   * @param {Object} result - Result data
   * @returns {Promise<void>}
   */
  async markComplete(jobId, result) {
    await this.updateJob(jobId, {
      status: 'complete',
      completedAt: Date.now(),
      result
    });
    console.log(`✅ Job ${jobId} completed`);
  }

  /**
   * Mark job as error
   * @param {string} jobId - Job ID
   * @param {Error|string} error - Error object or message
   * @returns {Promise<void>}
   */
  async markError(jobId, error) {
    const errorMessage = error instanceof Error ? error.message : error;
    await this.updateJob(jobId, {
      status: 'error',
      completedAt: Date.now(),
      error: errorMessage
    });
    console.error(`❌ Job ${jobId} failed: ${errorMessage}`);
  }

  /**
   * Save job to disk
   * @param {string} jobId - Job ID
   * @param {Object} job - Job data
   * @returns {Promise<void>}
   */
  async saveJob(jobId, job) {
    const jobFile = path.join(this.jobsDir, `${jobId}.json`);
    await fs.writeFile(jobFile, JSON.stringify(job, null, 2), 'utf8');
  }

  /**
   * Get all jobs (useful for debugging/admin)
   * @returns {Promise<Array>} - List of all jobs
   */
  async getAllJobs() {
    try {
      const files = await fs.readdir(this.jobsDir);
      const jobFiles = files.filter(f => f.endsWith('.json'));
      
      const jobs = await Promise.all(
        jobFiles.map(async (file) => {
          const data = await fs.readFile(path.join(this.jobsDir, file), 'utf8');
          return JSON.parse(data);
        })
      );

      return jobs.sort((a, b) => b.createdAt - a.createdAt);
    } catch (error) {
      console.error('Error reading jobs:', error);
      return [];
    }
  }
}

module.exports = JobManager;

