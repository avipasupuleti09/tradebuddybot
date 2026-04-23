import fs from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';

import express from 'express';

import { resolveProjectPath } from './config.js';
import { createBackendService } from './webApi.js';
import { createScannerApp } from './scanner/index.js';

function readBooleanEnv(name, fallback = false) {
  const value = process.env[name];
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

const port = Number(process.env.BACKEND_PORT || process.env.PORT || 5000);

const { app: backendApp, attachServer } = createBackendService();
const frontendDistDir = resolveProjectPath('frontend/dist');
const frontendIndexFile = path.join(frontendDistDir, 'index.html');
const serveFrontend = fs.existsSync(frontendIndexFile);
const embedScanner = readBooleanEnv('EMBED_SCANNER_SERVICE', Boolean(process.env.WEBSITE_SITE_NAME || serveFrontend));

backendApp.set('trust proxy', true);

if (embedScanner) {
  backendApp.use('/scanner-api', createScannerApp());
}

if (serveFrontend) {
  backendApp.use(express.static(frontendDistDir, { index: false }));
  backendApp.get(/^(?!\/(?:api|scanner-api)(?:\/|$)).*/, (req, res, next) => {
    if (path.extname(req.path)) {
      return next();
    }
    return res.sendFile(frontendIndexFile);
  });
}

const server = createServer(backendApp);

attachServer(server);

server.listen(port, '0.0.0.0', () => {
  const mode = [
    serveFrontend ? 'frontend build' : null,
    embedScanner ? 'embedded scanner' : null,
  ].filter(Boolean).join(', ');

  console.log(`TradeBuddy backend listening on http://0.0.0.0:${port}${mode ? ` (${mode})` : ''}`);
});
