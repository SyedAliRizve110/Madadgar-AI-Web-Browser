/**
 * Madadgar Manifest Transformer & Dual-Target Build Pipeline (Task 5.3)
 * Transforms Chrome Manifest V3 into Firefox-compliant Gecko MV3 manifest
 * and orchestrates browser-specific distribution builds.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

export const GECKO_SETTINGS = {
  id: 'madadgar@ai-assistant.com',
  strict_min_version: '109.0',
};

/**
 * Deep clones a JavaScript object/array.
 */
function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Recursively copies all files and directories from src to dest.
 */
export function copyDirectoryRecursive(src, dest) {
  if (!fs.existsSync(src)) {
    throw new Error(`Source directory does not exist: ${src}`);
  }

  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirectoryRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Transforms a Chrome MV3 manifest into a Firefox-compliant MV3 manifest.
 *
 * Requirements:
 * 1. Replace side_panel with sidebar_action:
 *    - Remove side_panel
 *    - Remove "sidePanel" from permissions (not supported in Firefox)
 *    - Set sidebar_action with default_panel, default_title, and default_icon
 * 2. Inject browser_specific_settings.gecko = { id: "madadgar@ai-assistant.com", strict_min_version: "109.0" }
 * 3. Map background service worker to background scripts:
 *    - Replace background.service_worker with background.scripts: [service_worker]
 *    - Keep type: "module"
 */
export function transformManifestForFirefox(manifest) {
  const result = deepClone(manifest);

  // 1. Replace side_panel with sidebar_action
  const panelPath = result.side_panel?.default_path || 'src/sidepanel/index.html';
  delete result.side_panel;

  const defaultTitle = result.action?.default_title || 'Madadgar - AI Assistant';
  const defaultIcon = result.icons || result.action?.default_icon || {
    '16': 'icons/icon-16.png',
    '32': 'icons/icon-32.png',
    '48': 'icons/icon-48.png',
    '128': 'icons/icon-128.png',
  };

  result.sidebar_action = {
    default_panel: panelPath,
    default_title: defaultTitle,
    default_icon: defaultIcon,
  };

  // Remove "sidePanel" permission which is invalid in Firefox MV3
  if (Array.isArray(result.permissions)) {
    result.permissions = result.permissions.filter((p) => p !== 'sidePanel');
  }

  // 2. Inject browser_specific_settings.gecko
  result.browser_specific_settings = {
    ...(result.browser_specific_settings || {}),
    gecko: {
      id: GECKO_SETTINGS.id,
      strict_min_version: GECKO_SETTINGS.strict_min_version,
      ...(result.browser_specific_settings?.gecko || {}),
    },
  };

  // 3. Map background service_worker to background.scripts
  if (result.background) {
    if (result.background.service_worker) {
      const sw = result.background.service_worker;
      delete result.background.service_worker;
      result.background.scripts = [sw];
    } else if (!result.background.scripts) {
      result.background.scripts = ['src/background/service_worker.ts'];
    }
    result.background.type = 'module';
  }

  return result;
}

/**
 * Transforms or validates a manifest for standard Chrome MV3.
 */
export function transformManifestForChrome(manifest) {
  const result = deepClone(manifest);

  // In Chrome MV3, ensure side_panel exists if sidebar_action was present
  if (result.sidebar_action && !result.side_panel) {
    result.side_panel = {
      default_path: result.sidebar_action.default_panel || 'src/sidepanel/index.html',
    };
    delete result.sidebar_action;
  }

  if (Array.isArray(result.permissions) && !result.permissions.includes('sidePanel')) {
    result.permissions.push('sidePanel');
  }

  // In Chrome MV3, map background.scripts back to service_worker if needed
  if (result.background?.scripts && !result.background.service_worker) {
    result.background.service_worker = result.background.scripts[0];
    delete result.background.scripts;
  }

  // Remove browser_specific_settings if present
  delete result.browser_specific_settings;

  return result;
}

/**
 * Reads a manifest file, transforms it for targetBrowser ('firefox' | 'chrome'),
 * and writes it to destPath.
 */
export function transformManifestFile(sourcePath, destPath, targetBrowser = 'firefox') {
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Manifest source file not found: ${sourcePath}`);
  }

  const raw = fs.readFileSync(sourcePath, 'utf8');
  const parsed = JSON.parse(raw);

  const transformed = targetBrowser === 'firefox'
    ? transformManifestForFirefox(parsed)
    : transformManifestForChrome(parsed);

  const destDir = path.dirname(destPath);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  fs.writeFileSync(destPath, JSON.stringify(transformed, null, 2), 'utf8');
  return transformed;
}

/**
 * Orchestrates building the Firefox distribution into dist/firefox:
 * 1. Ensures dist/chrome is built.
 * 2. Copies dist/chrome to dist/firefox.
 * 3. Transforms dist/firefox/manifest.json for Firefox Gecko MV3.
 */
export function buildFirefoxDistribution(options = {}) {
  const chromeDist = options.sourceDir || path.join(rootDir, 'dist/chrome');
  const firefoxDist = options.targetDir || path.join(rootDir, 'dist/firefox');

  console.log(`[Madadgar Build] Packaging Firefox distribution target...`);
  console.log(`  Source: ${path.relative(rootDir, chromeDist)}`);
  console.log(`  Target: ${path.relative(rootDir, firefoxDist)}`);

  // If chrome distribution does not exist, build it first
  if (!fs.existsSync(chromeDist) || !fs.existsSync(path.join(chromeDist, 'manifest.json'))) {
    const fallbackDist = path.join(rootDir, 'dist');
    if (fs.existsSync(fallbackDist) && fs.existsSync(path.join(fallbackDist, 'manifest.json'))) {
      console.log(`[Madadgar Build] Using existing build from dist/...`);
      copyDirectoryRecursive(fallbackDist, firefoxDist);
    } else {
      console.log(`[Madadgar Build] dist/chrome not found. Building Chrome MV3 bundle first...`);
      execSync('npm run build:chrome', { cwd: rootDir, stdio: 'inherit' });
      copyDirectoryRecursive(chromeDist, firefoxDist);
    }
  } else {
    copyDirectoryRecursive(chromeDist, firefoxDist);
  }

  // Transform dist/firefox/manifest.json
  const firefoxManifestPath = path.join(firefoxDist, 'manifest.json');
  const transformed = transformManifestFile(firefoxManifestPath, firefoxManifestPath, 'firefox');

  console.log(`[Madadgar Build] Transformed manifest for Firefox MV3:`);
  console.log(`  - sidebar_action.default_panel: ${transformed.sidebar_action?.default_panel}`);
  console.log(`  - gecko.id:                    ${transformed.browser_specific_settings?.gecko?.id}`);
  console.log(`  - background.scripts:          ${JSON.stringify(transformed.background?.scripts)}`);
  console.log(`  - permissions (no sidePanel):   ${transformed.permissions?.includes('sidePanel') ? 'FAIL' : 'OK'}`);
  console.log(`[Madadgar Build] Firefox build ready at dist/firefox\n`);

  return {
    sourceDir: chromeDist,
    targetDir: firefoxDist,
    manifest: transformed,
  };
}

// CLI execution handler
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const targetIndex = args.indexOf('--target');
  const target = targetIndex !== -1 ? args[targetIndex + 1] : 'firefox';

  try {
    if (target === 'firefox') {
      buildFirefoxDistribution();
    } else {
      console.log(`[Madadgar Build] Chrome build is handled via 'npm run build:chrome'`);
    }
  } catch (err) {
    console.error(`[Madadgar Build] Build failed:`, err.message);
    process.exit(1);
  }
}

