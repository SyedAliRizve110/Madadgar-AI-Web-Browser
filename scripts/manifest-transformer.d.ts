export interface GeckoSettings {
  id: string;
  strict_min_version: string;
}

export const GECKO_SETTINGS: GeckoSettings;

export function copyDirectoryRecursive(src: string, dest: string): void;

export function transformManifestForFirefox(manifest: Record<string, any>): Record<string, any>;

export function transformManifestForChrome(manifest: Record<string, any>): Record<string, any>;

export function transformManifestFile(
  sourcePath: string,
  destPath: string,
  targetBrowser?: 'firefox' | 'chrome'
): Record<string, any>;

export interface BuildFirefoxDistributionOptions {
  sourceDir?: string;
  targetDir?: string;
}

export interface BuildFirefoxDistributionResult {
  sourceDir: string;
  targetDir: string;
  manifest: Record<string, any>;
}

export function buildFirefoxDistribution(
  options?: BuildFirefoxDistributionOptions
): BuildFirefoxDistributionResult;

