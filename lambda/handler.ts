import serverlessExpress from '@vendia/serverless-express';
// Use CommonJS require to load the existing Node backend without TS typings friction
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createApp } = require('../packages/backend/server');

const { app } = createApp();

export const handler = serverlessExpress({ app });


