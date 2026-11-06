import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createZipArchive } from '../../scripts/package-zip.js';

describe('Release Packaging & ZIP Generation (Task 4.5)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'madadgar-pack-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('fails if source directory does not exist', () => {
    const nonExistent = path.join(tempDir, 'non_existent_dist');
    const outZip = path.join(tempDir, 'test.zip');
    expect(() => createZipArchive(nonExistent, outZip)).toThrow(/Source directory does not exist/);
  });

  it('fails if manifest.json is missing in source directory', () => {
    const dummyDist = path.join(tempDir, 'dummy_dist');
    fs.mkdirSync(dummyDist);
    fs.writeFileSync(path.join(dummyDist, 'index.html'), '<h1>Hello</h1>');
    const outZip = path.join(tempDir, 'test.zip');
    expect(() => createZipArchive(dummyDist, outZip)).toThrow(/missing manifest.json/);
  });

  it('creates a valid ZIP archive containing all source files and subdirectories', () => {
    const sourceDir = path.join(tempDir, 'extension_dist');
    fs.mkdirSync(sourceDir);
    fs.writeFileSync(path.join(sourceDir, 'manifest.json'), JSON.stringify({ name: 'Madadgar' }));
    
    const subDir = path.join(sourceDir, 'assets');
    fs.mkdirSync(subDir);
    fs.writeFileSync(path.join(subDir, 'style.css'), 'body { background: #fff; }');
    fs.writeFileSync(path.join(subDir, 'script.js'), 'console.log("hello");');

    const outZip = path.join(tempDir, 'madadgar-v1.0.0.zip');
    const result = createZipArchive(sourceDir, outZip);

    expect(result.fileCount).toBe(3);
    expect(fs.existsSync(outZip)).toBe(true);
    expect(result.zipBytes).toBeGreaterThan(0);

    const buffer = fs.readFileSync(outZip);
    // Standard ZIP Local Header Magic Number: 0x04034b50 -> 'PK\x03\x04'
    expect(buffer[0]).toBe(0x50); // 'P'
    expect(buffer[1]).toBe(0x4b); // 'K'
    expect(buffer[2]).toBe(0x03);
    expect(buffer[3]).toBe(0x04);

    // Verify End of Central Directory signature (0x06054b50 -> 'PK\x05\x06')
    const eocdIndex = buffer.indexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    expect(eocdIndex).toBeGreaterThan(0);

    // Verify file names are present in the central directory
    const bufferString = buffer.toString('utf8');
    expect(bufferString).toContain('manifest.json');
    expect(bufferString).toContain('assets/style.css');
    expect(bufferString).toContain('assets/script.js');
  });

  it('packages actual project dist directory if built', () => {
    const projectDist = path.resolve(__dirname, '../../dist');
    if (fs.existsSync(projectDist) && fs.existsSync(path.join(projectDist, 'manifest.json'))) {
      const outZip = path.join(tempDir, 'production-release.zip');
      const result = createZipArchive(projectDist, outZip);
      expect(result.fileCount).toBeGreaterThanOrEqual(10);
      expect(fs.existsSync(outZip)).toBe(true);
    }
  });
});

