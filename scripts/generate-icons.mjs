#!/usr/bin/env node
/**
 * Generate PNG icons from a base SVG (feather quill) for Tauri bundle.
 * Requires 'sharp'. If not installed, script will instruct user.
 */
import fs from 'fs';
import path from 'path';

const ICON_DIR = path.join(process.cwd(), 'src-tauri', 'icons');
const BASE_SVG = path.join(ICON_DIR, 'base.svg');
const SIZES = [32,128,256,512];

async function ensureSvg(){
  if(!fs.existsSync(BASE_SVG)){
    const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">\n  <defs>\n    <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">\n      <stop offset="0%" stop-color="#ffe08a"/>\n      <stop offset="100%" stop-color="#ff9f43"/>\n    </linearGradient>\n  </defs>\n  <rect width="512" height="512" rx="64" fill="#1c1c1e"/>\n  <path d="M360 80c-40 8-84 30-128 72-44 43-70 90-77 131l79-18 8 8-18 78c41-7 88-33 131-77 42-44 64-88 72-128 5-26-1-46-15-60s-34-20-60-15z" fill="url(#g)" stroke="#ffffff22" stroke-width="8"/>\n  <path d="M176 336l32 32" stroke="#ffd27a" stroke-width="16" stroke-linecap="round"/>\n</svg>`;
    fs.writeFileSync(BASE_SVG, svg, 'utf8');
  }
}

async function main(){
  await ensureSvg();
  let sharpLib;
  try { sharpLib = await import('sharp'); } catch(e){
    console.error('\n[icons] Missing dependency: sharp\nInstall with: npm i --save-dev sharp\n');
    process.exit(0); // do not fail hard; placeholder stays
  }
  const sharp = sharpLib.default;
  for(const size of SIZES){
    const out = path.join(ICON_DIR, `${size}x${size}.png`);
    await sharp(BASE_SVG).resize(size, size, { fit: 'contain' }).png().toFile(out);
    console.log(`[icons] generated ${out}`);
  }
}

main().catch(e=>{ console.error(e); process.exit(1); });
