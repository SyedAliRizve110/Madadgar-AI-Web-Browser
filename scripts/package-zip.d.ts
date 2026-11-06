export interface ZipResult {
  fileCount: number;
  uncompressedBytes: number;
  compressedBytes: number;
  zipBytes: number;
  outputFile: string;
}

export function createZipArchive(sourceDir: string, outputFile: string): ZipResult;

