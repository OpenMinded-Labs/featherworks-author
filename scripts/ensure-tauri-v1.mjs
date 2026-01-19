#!/usr/bin/env node
import { execSync } from 'node:child_process';

function getVersion(cmd) {
  try {
    const out = execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    const m = out.match(/(\d+)\.(\d+)\.(\d+)/);
    if (m) return { major: parseInt(m[1],10), raw: out };
  } catch (_) {}
  return null;
}

const localCli = getVersion('npx tauri -V');
if (!localCli) {
  console.error('[tauri-version-check] Konnte lokale Tauri CLI Version nicht ermitteln. Stelle sicher, dass @tauri-apps/cli als DevDependency installiert ist.');
  process.exit(1);
}

const globalCli = getVersion('tauri -V');

if (globalCli && globalCli.major !== localCli.major) {
  console.warn(`\n[WARN] Global Tauri CLI (${globalCli.raw}) hat eine andere Major-Version als lokale CLI (${localCli.raw}).\n       Für konsistente Builds verwende NUR die lokale CLI (npm scripts) oder deinstalliere die globale.\n`);
}

if (localCli.major !== 1) {
  console.error(`[tauri-version-check] Dieses Projekt ist aktuell auf Tauri v1 konfiguriert, aber lokale CLI meldet ${localCli.raw}. Bitte auf v1 downgraden oder Projekt migrieren.`);
  process.exit(2);
}

console.log(`[tauri-version-check] OK: lokale CLI ${localCli.raw}`);
