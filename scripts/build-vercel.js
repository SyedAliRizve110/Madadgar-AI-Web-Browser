import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('[build-vercel] Starting Vercel build script...');
console.log(`[build-vercel] Root directory: ${rootDir}`);
console.log(`[build-vercel] Process cwd: ${process.cwd()}`);

const landingDir = path.join(rootDir, 'landing');
const distDir = path.join(rootDir, 'dist');

if (!fs.existsSync(landingDir)) {
  console.error(`[build-vercel] ERROR: landing directory not found at: ${landingDir}`);
  process.exit(1);
}

// Clean and recreate dist
if (fs.existsSync(distDir)) {
  console.log('[build-vercel] Cleaning existing dist directory...');
  fs.rmSync(distDir, { recursive: true, force: true });
}

fs.mkdirSync(distDir, { recursive: true });
console.log('[build-vercel] Created fresh dist directory.');

// Copy landing contents to dist
fs.cpSync(landingDir, distDir, { recursive: true });
console.log('[build-vercel] Copied landing/ to dist/.');

// Also ensure madadgar-v1.0.0.zip is in dist
const rootZip = path.join(rootDir, 'madadgar-v1.0.0.zip');
const distZip = path.join(distDir, 'madadgar-v1.0.0.zip');
if (!fs.existsSync(distZip) && fs.existsSync(rootZip)) {
  fs.copyFileSync(rootZip, distZip);
  console.log('[build-vercel] Copied root madadgar-v1.0.0.zip to dist/.');
}

const distFiles = fs.readdirSync(distDir);
console.log(`[build-vercel] Successfully populated dist with ${distFiles.length} items:`, distFiles);

if (!fs.existsSync(path.join(distDir, 'index.html'))) {
  console.error('[build-vercel] ERROR: dist/index.html does not exist after copy!');
  process.exit(1);
}

console.log('[build-vercel] Vercel build completed successfully.');

