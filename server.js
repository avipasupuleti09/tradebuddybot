import fs from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';

import { createBackendService } from './backend/webApi.js';
import { createScannerApp } from './scanner/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.join(__dirname, 'frontend', 'dist');
const hostedMode = process.argv.includes('--hosted');
const port = hostedMode
  ? Number(process.env.PORT || 3000)
  : Number(process.env.BACKEND_PORT || process.env.PORT || 5000);

const { app: backendApp, attachServer } = createBackendService();
const app = hostedMode ? createHostedApp(backendApp) : backendApp;
const server = createServer(app);

attachServer(server);

server.listen(port, '0.0.0.0', () => {
  console.log(
    hostedMode
      ? `TradeBuddy hosted server listening on http://0.0.0.0:${port}`
      : `TradeBuddy backend listening on http://0.0.0.0:${port}`,
  );
});

function createHostedApp(apiApp) {
  const hostedApp = express();
  const scannerApp = createScannerApp();

  hostedApp.disable('x-powered-by');

  hostedApp.get('/health', (_req, res) => {
    res.json({
      ok: true,
      port,
      distReady: fs.existsSync(path.join(distDir, 'index.html')),
      backendRuntime: 'node',
    });
  });

  hostedApp.use(apiApp);

  hostedApp.use('/scanner-api', (req, res, next) => {
    req.url = `/api${req.url === '/' ? '' : req.url}`;
    scannerApp(req, res, next);
  });

  if (fs.existsSync(distDir)) {
    hostedApp.use(express.static(distDir));
    hostedApp.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    hostedApp.get('*', (_req, res) => {
      res.status(500).send('frontend/dist is missing. Run npm run build before starting hosted mode.');
    });
  }

  return hostedApp;
}