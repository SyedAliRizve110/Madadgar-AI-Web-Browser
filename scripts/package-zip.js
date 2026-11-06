/**
 * Madadgar Release Packaging Script
 * Cross-platform ZIP generator for Chrome Extension distribution.
 * Packages `dist/` directory into `madadgar-v<version>.zip` without external dependencies.
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

function getDosDateTime(date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = date.getSeconds();

  const dosDate = (((year - 1980) & 0x7f) << 9) | ((month & 0x0f) << 5) | (day & 0x1f);
  const dosTime = ((hours & 0x1f) << 11) | ((minutes & 0x3f) << 5) | ((seconds >> 1) & 0x1f);

  return { dosDate, dosTime };
}

function getAllFiles(dir, base = '') {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    const relPath = base ? `${base}/${file}` : file;
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      results = results.concat(getAllFiles(fullPath, relPath));
    } else {
      results.push({ fullPath, relPath, mtime: stat.mtime });
    }
  }
  return results;
}

export function createZipArchive(sourceDir, outputFile) {
  if (!fs.existsSync(sourceDir)) {
    throw new Error(`Source directory does not exist: ${sourceDir}`);
  }

  const manifestPath = path.join(sourceDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Invalid extension directory: missing manifest.json at ${manifestPath}`);
  }

  const files = getAllFiles(sourceDir);
  if (files.length === 0) {
    throw new Error(`No files found in source directory: ${sourceDir}`);
  }

  const localHeaders = [];
  const centralHeaders = [];
  let currentOffset = 0;
  let totalUncompressed = 0;
  let totalCompressed = 0;

  for (const file of files) {
    const fileData = fs.readFileSync(file.fullPath);
    totalUncompressed += fileData.length;

    const crc = zlib.crc32(fileData);
    const deflated = zlib.deflateRawSync(fileData);

    // If compression doesn't save space, store uncompressed
    const useDeflate = deflated.length < fileData.length;
    const compressionMethod = useDeflate ? 8 : 0;
    const compressedData = useDeflate ? deflated : fileData;
    totalCompressed += compressedData.length;

    const { dosDate, dosTime } = getDosDateTime(file.mtime);
    const nameBuffer = Buffer.from(file.relPath.replace(/\\/g, '/'), 'utf8');

    // --- Local File Header (30 bytes + name length) ---
    const localHeader = Buffer.alloc(30 + nameBuffer.length);
    localHeader.writeUInt32LE(0x04034b50, 0); // Local file header signature
    localHeader.writeUInt16LE(20, 4);         // Version needed to extract (2.0)
    localHeader.writeUInt16LE(0, 6);          // General purpose bit flag
    localHeader.writeUInt16LE(compressionMethod, 8); // Compression method
    localHeader.writeUInt16LE(dosTime, 10);   // File last mod time
    localHeader.writeUInt16LE(dosDate, 12);   // File last mod date
    localHeader.writeUInt32LE(crc, 14);       // CRC-32
    localHeader.writeUInt32LE(compressedData.length, 18); // Compressed size
    localHeader.writeUInt32LE(fileData.length, 22);       // Uncompressed size
    localHeader.writeUInt16LE(nameBuffer.length, 26);     // File name length
    localHeader.writeUInt16LE(0, 28);         // Extra field length
    nameBuffer.copy(localHeader, 30);

    localHeaders.push(localHeader, compressedData);

    // --- Central Directory File Header (46 bytes + name length) ---
    const centralHeader = Buffer.alloc(46 + nameBuffer.length);
    centralHeader.writeUInt32LE(0x02014b50, 0); // Central file header signature
    centralHeader.writeUInt16LE(20, 4);         // Version made by (2.0)
    centralHeader.writeUInt16LE(20, 6);         // Version needed to extract (2.0)
    centralHeader.writeUInt16LE(0, 8);          // General purpose bit flag
    centralHeader.writeUInt16LE(compressionMethod, 10); // Compression method
    centralHeader.writeUInt16LE(dosTime, 12);   // File last mod time
    centralHeader.writeUInt16LE(dosDate, 14);   // File last mod date
    centralHeader.writeUInt32LE(crc, 16);       // CRC-32
    centralHeader.writeUInt32LE(compressedData.length, 20); // Compressed size
    centralHeader.writeUInt32LE(fileData.length, 24);       // Uncompressed size
    centralHeader.writeUInt16LE(nameBuffer.length, 28);     // File name length
    centralHeader.writeUInt16LE(0, 30);         // Extra field length
    centralHeader.writeUInt16LE(0, 32);         // File comment length
    centralHeader.writeUInt16LE(0, 34);         // Disk number start
    centralHeader.writeUInt16LE(0, 36);         // Internal file attributes
    centralHeader.writeUInt32LE(0, 38);         // External file attributes
    centralHeader.writeUInt32LE(currentOffset, 42); // Relative offset of local header
    nameBuffer.copy(centralHeader, 46);

    centralHeaders.push(centralHeader);

    currentOffset += localHeader.length + compressedData.length;
  }

  const centralDirOffset = currentOffset;
  const centralDirSize = centralHeaders.reduce((sum, h) => sum + h.length, 0);

  // --- End of Central Directory Record (22 bytes) ---
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);            // EOCD signature
  eocd.writeUInt16LE(0, 4);                     // Number of this disk
  eocd.writeUInt16LE(0, 6);                     // Disk where central directory starts
  eocd.writeUInt16LE(files.length, 8);          // Central directory records on this disk
  eocd.writeUInt16LE(files.length, 10);         // Total central directory records
  eocd.writeUInt32LE(centralDirSize, 12);       // Size of central directory
  eocd.writeUInt32LE(centralDirOffset, 16);     // Offset of start of central directory
  eocd.writeUInt16LE(0, 20);                    // ZIP comment length

  const allBuffers = [...localHeaders, ...centralHeaders, eocd];
  const totalZipBuffer = Buffer.concat(allBuffers);

  fs.writeFileSync(outputFile, totalZipBuffer);

  return {
    fileCount: files.length,
    uncompressedBytes: totalUncompressed,
    compressedBytes: totalCompressed,
    zipBytes: totalZipBuffer.length,
    outputFile
  };
}

// Self-executing runner when executed via node
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const pkgJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  const version = pkgJson.version || '1.0.0';
  const distDir = path.join(rootDir, 'dist');
  const outputZip = path.join(rootDir, `madadgar-v${version}.zip`);

  console.log(`[Madadgar Release] Packaging extension distribution v${version}...`);
  try {
    const result = createZipArchive(distDir, outputZip);
    const savingsPercent = ((1 - result.compressedBytes / result.uncompressedBytes) * 100).toFixed(1);

    // Also sync to landing directory for static landing page hosting
    const landingDir = path.join(rootDir, 'landing');
    if (fs.existsSync(landingDir)) {
      const landingZip = path.join(landingDir, `madadgar-v${version}.zip`);
      fs.copyFileSync(outputZip, landingZip);
      console.log(`  Landing:      Synced to landing/${path.basename(landingZip)}`);
    }

    console.log(`[Madadgar Release] Successfully generated distribution archive:`);
    console.log(`  Target:       ${path.basename(result.outputFile)}`);
    console.log(`  File Count:   ${result.fileCount} files`);
    console.log(`  Source Size:  ${(result.uncompressedBytes / 1024).toFixed(1)} KB`);
    console.log(`  Zip Size:     ${(result.zipBytes / 1024).toFixed(1)} KB (Saved ${savingsPercent}%)`);
  } catch (error) {
    console.error(`[Madadgar Release] Packaging failed:`, error.message);
    process.exit(1);
  }
}

