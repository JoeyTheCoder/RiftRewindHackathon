const { z } = require('zod');

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  FRONTEND_URL: z.string().optional(),
  DATA_DIR: z.string().default('data'),
  RIOT_API_KEY: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.string().default('info'),
});

function validateFrontendUrls(frontendUrl) {
  if (!frontendUrl) {
    return undefined;
  }

  const urls = frontendUrl
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  for (const url of urls) {
    try {
      new URL(url);
    } catch (_error) {
      const error = new Error(`Invalid FRONTEND_URL entry: ${url}`);
      error.code = 'ENV_INVALID_FRONTEND_URL';
      throw error;
    }
  }

  return urls.join(',');
}

function validate() {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const error = new Error('Invalid environment configuration');
    error.code = 'ENV_INVALID';
    error.details = parsed.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
    throw error;
  }

  const env = parsed.data;
  return {
    NODE_ENV: env.NODE_ENV,
    FRONTEND_URL: validateFrontendUrls(env.FRONTEND_URL),
    DATA_DIR: env.DATA_DIR,
    RIOT_API_KEY: env.RIOT_API_KEY,
    PORT: env.PORT,
    LOG_LEVEL: env.LOG_LEVEL,
  };
}

function validateAndPrint() {
  try {
    const conf = validate();
    console.log(JSON.stringify({
      ok: true,
      hasRiotCreds: Boolean(conf.RIOT_API_KEY),
      dataDir: conf.DATA_DIR,
      port: conf.PORT,
    }));
    process.exit(0);
  } catch (error) {
    console.error(JSON.stringify({
      ok: false,
      code: error.code || 'ENV_INVALID',
      details: error.details || error.message,
    }));
    process.exit(1);
  }
}

module.exports = { validate, validateAndPrint };


