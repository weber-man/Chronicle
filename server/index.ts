import { createApp } from './app.js';

const port = Number(process.env.PORT ?? 3001);
const { app } = createApp();

console.info('[lifeline] startup.server_initializing', {
  port,
  nodeEnv: process.env.NODE_ENV ?? 'development',
});

app.listen(port, () => {
  console.info('[lifeline] startup.server_listening', {
    port,
    url: `http://localhost:${port}`,
  });
});
