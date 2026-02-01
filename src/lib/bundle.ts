/**
 * Bundle Processing
 *
 * Handles extracting and processing uploaded bundles.
 */

import crypto from 'crypto';
import JSZip from 'jszip';
import type { DeploymentFile } from './vercel';

const MAX_BUNDLE_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB per file
const MAX_FILES = 10000; // Maximum number of files

// Binary file extensions that need base64 encoding
const BINARY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
  '.eot',
  '.pdf',
  '.zip',
  '.gz',
  '.mp3',
  '.mp4',
  '.webm',
  '.ogg',
  '.wav',
]);

/**
 * Check if a file is binary based on extension
 */
function isBinaryFile(path: string): boolean {
  const ext = path.slice(path.lastIndexOf('.')).toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}

/**
 * Compute SHA256 hash of data
 */
export function computeHash(data: Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Validate bundle size
 */
export function validateBundleSize(size: number): { valid: boolean; error?: string } {
  if (size > MAX_BUNDLE_SIZE) {
    return {
      valid: false,
      error: `Bundle too large: ${size} bytes (max ${MAX_BUNDLE_SIZE} bytes)`,
    };
  }
  return { valid: true };
}

/**
 * Extract files from a zip bundle buffer
 */
export async function extractBundle(buffer: Buffer): Promise<{
  files: DeploymentFile[];
  hash: string;
}> {
  const files: DeploymentFile[] = [];
  const hash = computeHash(buffer);

  try {
    const zip = await JSZip.loadAsync(buffer);
    const entries = Object.keys(zip.files);

    for (const path of entries) {
      const entry = zip.files[path];

      // Skip directories
      if (entry.dir) {
        continue;
      }

      // Skip hidden files and common junk
      const basename = path.split('/').pop() || '';
      if (basename.startsWith('.') || basename === 'Thumbs.db' || basename === 'desktop.ini') {
        continue;
      }

      // Check file limit
      if (files.length >= MAX_FILES) {
        console.warn(`[bundle] File limit reached (${MAX_FILES}), skipping remaining files`);
        break;
      }

      // Read file content
      const content = await entry.async('nodebuffer');

      // Skip files that are too large
      if (content.length > MAX_FILE_SIZE) {
        console.warn(`[bundle] Skipping large file: ${path} (${content.length} bytes)`);
        continue;
      }

      const isBinary = isBinaryFile(path);

      files.push({
        file: path,
        data: isBinary ? content.toString('base64') : content.toString('utf-8'),
        encoding: isBinary ? 'base64' : undefined,
      });
    }

    console.log(`[bundle] Extracted ${files.length} files`);
    return { files, hash };
  } catch (error) {
    console.error('[bundle] Extraction error:', error);
    throw new Error(
      `Failed to extract bundle: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Add default files if missing (index.html for static sites)
 */
export function ensureDefaultFiles(files: DeploymentFile[]): DeploymentFile[] {
  const hasIndexHtml = files.some((f) => f.file === 'index.html' || f.file.endsWith('/index.html'));

  if (!hasIndexHtml) {
    // Add a default index.html
    files.push({
      file: 'index.html',
      data: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ABBA App</title>
</head>
<body>
  <h1>ABBA App</h1>
  <p>This app was deployed with ABBA Hosting.</p>
</body>
</html>`,
    });
  }

  return files;
}
