#!/usr/bin/env node
// Robust dev orchestrator: start Vite, wait until reachable, then launch `npx tauri dev`.
// Provides clearer logs so the UI "not working" issue (missing dev server) is avoided.

import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import http from 'node:http';

const VITE_PORTS = [5173, 5174, 5175, 5176]; // Try multiple ports

function waitForVite(maxAttempts = 50, intervalMs = 200) {
  return new Promise(async (resolve, reject) => {
    for (let i = 0; i < maxAttempts; i++) {
      for (const port of VITE_PORTS) {
        const ok = await new Promise(r => {
          const req = http.get({ host: 'localhost', port, path: '/' }, res => {
            r(res.statusCode === 200 || (res.statusCode && res.statusCode < 400));
          });
          req.on('error', () => r(false));
        });
        if (ok) {
          console.log(`[dev] Found Vite server on port ${port}`);
          return resolve(port);
        }
      }
      await delay(intervalMs);
    }
    reject(new Error(`Vite dev server not reachable on any port ${VITE_PORTS} after ${(maxAttempts*intervalMs)/1000}s`));
  });
}

async function main() {
  console.log('[dev] Starting Vite dev server...');
  const vite = spawn('npm', ['run', 'dev:ui'], { stdio: 'inherit', shell: true });

  vite.on('exit', (code) => {
    if (code !== 0) {
      console.error(`[dev] Vite process exited early with code ${code}`);
    }
  });

  // Wait a moment for Vite to fully start and settle on a port
  await delay(3000);
  
  try {
    const vitePort = await waitForVite();
    console.log(`[dev] Vite is up on port ${vitePort}. Launching Tauri...`);
    
    // Update tauri.conf.json only if the port actually changed (avoid unnecessary rebuilds)
    const fs = await import('fs');
    const configPath = './src-tauri/tauri.conf.json';
    const configRaw = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(configRaw);
    const desiredDevPath = `http://localhost:${vitePort}`;
    if (config.build.devPath !== desiredDevPath) {
      config.build.devPath = desiredDevPath;
      fs.writeFileSync(configPath, JSON.stringify(config, null, '\t'));
      console.log(`[dev] Updated tauri.conf.json devPath to ${desiredDevPath}`);
    } else {
      console.log(`[dev] tauri.conf.json devPath already correct (${desiredDevPath}), skipping write`);
    }
  } catch (err) {
    console.error('[dev] Failed waiting for Vite:', err.message);
    process.exit(1);
  }

  const tauri = spawn('npx', ['tauri', 'dev', '--features', 'local-llm'], { stdio: 'inherit', shell: true, env: process.env });

  tauri.on('exit', (code) => {
    console.log(`[dev] Tauri exited with code ${code}`);
    // Do not kill vite automatically; developer may still want to inspect.
  });
}

main().catch(e => { console.error(e); process.exit(1); });
