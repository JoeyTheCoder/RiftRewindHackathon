require('dotenv').config();

const { createApp } = require('./server');

async function bootstrap() {
  const { app, cfg, initDataDirectory } = createApp();
  await initDataDirectory();

  app.listen(cfg.PORT, () => {
    console.log(`That's My Duo backend listening on port ${cfg.PORT}`);
  });
}

bootstrap().catch((error) => {
  console.error('Failed to start backend:', error);
  process.exit(1);
});