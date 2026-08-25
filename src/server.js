import { createServer } from 'node:http';

import { createApp } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const app = createApp(config);
const server = createServer(app.handler);

server.listen(config.port, config.host, () => {
  console.log(`Saldo Real disponível em ${config.appOrigin}`);
});

function shutdown(signal) {
  console.log(`${signal} recebido; encerrando com segurança.`);
  server.close(() => {
    app.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
