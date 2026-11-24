/**
 * Manifest Transformer & Dual-Target Build Tooling Tests (Task 5.3)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  transformManifestForFirefox,
  transformManifestForChrome,
  transformManifestFile,
  buildFirefoxDistribution,
  GECKO_SETTINGS,
} from '../../scripts/manifest-transformer.js';
import { packageExtension } from '../../scripts/package-zip.js';

describe('Manifest Transformer Pipeline (Task 5.3)', () => {
  const sampleChromeManifest = {
    manifest_version: 3,
    name: 'Madadgar - AI Browser Assistant',
    version: '1.0.0',
    description: 'Human-in-the-Loop Chrome Extension Assistant',
    icons: {
      '16': 'icons/icon-16.png',
      '32': 'icons/icon-32.png',
      '48': 'icons/icon-48.png',
      '128': 'icons/icon-128.png',
    },
    permissions: [
      'sidePanel',
      'storage',
      'activeTab',
      'scripting',
      'contextMenus',
      'tabs',
    ],
    host_permissions: [
      'https://generativelanguage.googleapis.com/*',
      'https://api.groq.com/*',
      '<all_urls>',
    ],
    background: {
      service_worker: 'service-worker-loader.js',
      type: 'module',
    },
    content_scripts: [
      {
        matches: ['<all_urls>'],
        js: ['assets/content-script.js'],
        run_at: 'document_idle',
      },
    ],
    side_panel: {
      default_path: 'src/sidepanel/index.html',
    },
    action: {
      default_title: 'Open Madadgar',
      default_icon: {
        '16': 'icons/icon-16.png',
        '32': 'icons/icon-32.png',
        '48': 'icons/icon-48.png',
        '128': 'icons/icon-128.png',
      },
    },
  };

  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'madadgar-manifest-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('transformManifestForFirefox', () => {
    it('replaces side_panel with sidebar_action and maps default_panel', () => {
      const firefoxManifest = transformManifestForFirefox(sampleChromeManifest);

      expect(firefoxManifest.side_panel).toBeUndefined();
      expect(firefoxManifest.sidebar_action).toBeDefined();
      expect(firefoxManifest.sidebar_action.default_panel).toBe('src/sidepanel/index.html');
      expect(firefoxManifest.sidebar_action.default_title).toBe('Open Madadgar');
      expect(firefoxManifest.sidebar_action.default_icon).toEqual(sampleChromeManifest.icons);
    });

    it('removes "sidePanel" permission which is invalid on Firefox Gecko MV3', () => {
      const firefoxManifest = transformManifestForFirefox(sampleChromeManifest);

      expect(firefoxManifest.permissions).not.toContain('sidePanel');
      expect(firefoxManifest.permissions).toEqual([
        'storage',
        'activeTab',
        'scripting',
        'contextMenus',
        'tabs',
      ]);
    });

    it('injects browser_specific_settings.gecko with designated ID and minimum version', () => {
      const firefoxManifest = transformManifestForFirefox(sampleChromeManifest);

      expect(firefoxManifest.browser_specific_settings).toBeDefined();
      expect(firefoxManifest.browser_specific_settings.gecko).toEqual({
        id: GECKO_SETTINGS.id,
        strict_min_version: GECKO_SETTINGS.strict_min_version,
      });
      expect(firefoxManifest.browser_specific_settings.gecko.id).toBe('madadgar@ai-assistant.com');
      expect(firefoxManifest.browser_specific_settings.gecko.strict_min_version).toBe('109.0');
    });

    it('maps background.service_worker to background.scripts array and preserves module type', () => {
      const firefoxManifest = transformManifestForFirefox(sampleChromeManifest);

      expect(firefoxManifest.background.service_worker).toBeUndefined();
      expect(firefoxManifest.background.scripts).toEqual(['service-worker-loader.js']);
      expect(firefoxManifest.background.type).toBe('module');
    });

    it('preserves all other standard manifest fields without mutation', () => {
      const firefoxManifest = transformManifestForFirefox(sampleChromeManifest);

      expect(firefoxManifest.manifest_version).toBe(3);
      expect(firefoxManifest.name).toBe(sampleChromeManifest.name);
      expect(firefoxManifest.version).toBe(sampleChromeManifest.version);
      expect(firefoxManifest.description).toBe(sampleChromeManifest.description);
      expect(firefoxManifest.host_permissions).toEqual(sampleChromeManifest.host_permissions);
      expect(firefoxManifest.content_scripts).toEqual(sampleChromeManifest.content_scripts);
      expect(firefoxManifest.action).toEqual(sampleChromeManifest.action);
    });
  });

  describe('transformManifestForChrome', () => {
    it('restores side_panel and removes browser_specific_settings', () => {
      const firefoxManifest = transformManifestForFirefox(sampleChromeManifest);
      const chromeManifest = transformManifestForChrome(firefoxManifest);

      expect(chromeManifest.sidebar_action).toBeUndefined();
      expect(chromeManifest.side_panel).toBeDefined();
      expect(chromeManifest.side_panel.default_path).toBe('src/sidepanel/index.html');
      expect(chromeManifest.permissions).toContain('sidePanel');
      expect(chromeManifest.browser_specific_settings).toBeUndefined();
      expect(chromeManifest.background.service_worker).toBe('service-worker-loader.js');
    });
  });

  describe('File-level transformation and distribution builder', () => {
    it('transforms manifest file on disk from source to destination', () => {
      const srcFile = path.join(tempDir, 'manifest.json');
      const destFile = path.join(tempDir, 'firefox', 'manifest.json');

      fs.writeFileSync(srcFile, JSON.stringify(sampleChromeManifest, null, 2), 'utf8');

      const result = transformManifestFile(srcFile, destFile, 'firefox');
      expect(fs.existsSync(destFile)).toBe(true);
      expect(result.sidebar_action).toBeDefined();
      expect(result.browser_specific_settings?.gecko?.id).toBe('madadgar@ai-assistant.com');

      const diskSaved = JSON.parse(fs.readFileSync(destFile, 'utf8'));
      expect(diskSaved.sidebar_action).toBeDefined();
    });

    it('copies directory recursively and generates Firefox distribution', () => {
      const chromeDir = path.join(tempDir, 'chrome_dist');
      const firefoxDir = path.join(tempDir, 'firefox_dist');

      fs.mkdirSync(path.join(chromeDir, 'assets'), { recursive: true });
      fs.writeFileSync(path.join(chromeDir, 'manifest.json'), JSON.stringify(sampleChromeManifest));
      fs.writeFileSync(path.join(chromeDir, 'assets', 'app.js'), 'console.log("ok");');

      const res = buildFirefoxDistribution({
        sourceDir: chromeDir,
        targetDir: firefoxDir,
      });

      expect(res.targetDir).toBe(firefoxDir);
      expect(res.manifest.sidebar_action).toBeDefined();
      expect(fs.existsSync(firefoxDir)).toBe(true);
      expect(fs.existsSync(path.join(firefoxDir, 'assets', 'app.js'))).toBe(true);
      expect(fs.existsSync(path.join(firefoxDir, 'manifest.json'))).toBe(true);

      const ffManifest = JSON.parse(fs.readFileSync(path.join(firefoxDir, 'manifest.json'), 'utf8'));
      expect(ffManifest.sidebar_action).toBeDefined();
      expect(ffManifest.side_panel).toBeUndefined();
      expect(ffManifest.browser_specific_settings?.gecko?.id).toBe('madadgar@ai-assistant.com');
    });

    it('packages Firefox distribution into target ZIP archive', () => {
      const firefoxDir = path.join(tempDir, 'firefox_pack');
      fs.mkdirSync(firefoxDir, { recursive: true });
      fs.writeFileSync(
        path.join(firefoxDir, 'manifest.json'),
        JSON.stringify(transformManifestForFirefox(sampleChromeManifest))
      );
      fs.writeFileSync(path.join(firefoxDir, 'index.html'), '<html>Firefox</html>');

      const outZip = path.join(tempDir, 'madadgar-firefox-v1.0.0.zip');
      const zipResult = packageExtension({
        target: 'firefox',
        dir: firefoxDir,
        out: outZip,
      });

      expect(zipResult.fileCount).toBe(2);
      expect(fs.existsSync(outZip)).toBe(true);
      expect(zipResult.zipBytes).toBeGreaterThan(0);
    });
  });
});
