export interface ZipResult {
  fileCount: number;
  uncompressedBytes: number;
  compressedBytes: number;
  zipBytes: number;
  outputFile: string;
}

export interface PackageExtensionOptions {
  target?: 'chrome' | 'firefox' | 'all';
  dir?: string;
  out?: string;
}

export function createZipArchive(sourceDir: string, outputFile: string): ZipResult;
export function packageExtension(options?: PackageExtensionOptions): ZipResult;
