const { z } = require('zod');

const boolString = z.enum(['true', 'false']).transform((v) => v === 'true');

const BaseSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']),
  FRONTEND_URL: z.string().url(),
  DATA_BACKEND: z.enum(['fs', 's3']).default('fs'),
  DATA_DIR: z.string().default('data'),
  // Prefer secret id; allow direct key for local dev
  RIOT_SECRET_ID: z.string().min(1).optional(),
  RIOT_API_KEY: z.string().min(1).optional(),
  ENABLE_BEDROCK: z.string().optional(),
  BEDROCK_REGION: z.string().optional(),
  BEDROCK_MODEL_ID: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_PREFIX: z.string().optional(),
  PORT: z.string().optional(),
  LOG_LEVEL: z.string().optional()
});

function validate() {
  const parsed = BaseSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(i => ({ path: i.path.join('.'), message: i.message }));
    const error = new Error('Invalid environment configuration');
    error.details = issues;
    throw error;
  }
  const env = parsed.data;

  // Riot credential requirement
  if (!env.RIOT_SECRET_ID && !env.RIOT_API_KEY) {
    const error = new Error('Missing Riot credentials: set RIOT_SECRET_ID or RIOT_API_KEY');
    error.code = 'ENV_MISSING_RIOT_CREDS';
    error.details = [{ path: 'RIOT_SECRET_ID|RIOT_API_KEY', message: 'Provide at least one' }];
    throw error;
  }

  // S3 requirements
  if (env.DATA_BACKEND === 's3' && !env.S3_BUCKET) {
    const error = new Error('S3 configuration required when DATA_BACKEND=s3');
    error.code = 'ENV_MISSING_S3_BUCKET';
    error.details = [{ path: 'S3_BUCKET', message: 'Required for s3 backend' }];
    throw error;
  }

  // Bedrock gating
  const enableBedrock = env.ENABLE_BEDROCK ? boolString.parse(env.ENABLE_BEDROCK) : false;
  if (enableBedrock) {
    if (!env.BEDROCK_REGION || !env.BEDROCK_MODEL_ID) {
      const error = new Error('Bedrock enabled but BEDROCK_REGION or BEDROCK_MODEL_ID missing');
      error.code = 'ENV_MISSING_BEDROCK';
      error.details = [
        { path: 'BEDROCK_REGION', message: 'Required when ENABLE_BEDROCK=true' },
        { path: 'BEDROCK_MODEL_ID', message: 'Required when ENABLE_BEDROCK=true' }
      ];
      throw error;
    }
  }

  return {
    NODE_ENV: env.NODE_ENV,
    FRONTEND_URL: env.FRONTEND_URL,
    DATA_BACKEND: env.DATA_BACKEND,
    DATA_DIR: env.DATA_DIR,
    S3_BUCKET: env.S3_BUCKET,
    S3_PREFIX: env.S3_PREFIX || '',
    RIOT_SECRET_ID: env.RIOT_SECRET_ID,
    RIOT_API_KEY: env.RIOT_API_KEY,
    ENABLE_BEDROCK: enableBedrock,
    BEDROCK_REGION: env.BEDROCK_REGION,
    BEDROCK_MODEL_ID: env.BEDROCK_MODEL_ID,
    PORT: env.PORT ? Number(env.PORT) : 3000,
    LOG_LEVEL: env.LOG_LEVEL || 'info'
  };
}

function validateAndPrint() {
  try {
    const conf = validate();
    // Print a concise boot report
    // Only include non-sensitive values
    console.log(JSON.stringify({
      ok: true,
      dataBackend: conf.DATA_BACKEND,
      hasRiotCreds: Boolean(conf.RIOT_SECRET_ID || conf.RIOT_API_KEY),
      enableBedrock: conf.ENABLE_BEDROCK,
      hasS3: conf.DATA_BACKEND === 's3',
    }));
    process.exit(0);
  } catch (err) {
    console.error(JSON.stringify({ ok: false, code: err.code || 'ENV_INVALID', details: err.details || err.message }));
    process.exit(1);
  }
}

module.exports = { validate, validateAndPrint };


