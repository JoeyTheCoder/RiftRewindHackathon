import serverlessExpress from '@vendia/serverless-express';

// Works whether createApp returns an app *or* { app }
const { createApp } = require('../server');
const created = createApp();
const app = created?.app ?? created;

export const handler = serverlessExpress({ app });
