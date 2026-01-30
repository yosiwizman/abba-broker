/**
 * Bundle Processing
 *
 * Handles extracting and processing uploaded bundles.
 */

import crypto from 'crypto';
import { Readable } from 'stream';
import unzipper from 'unzipper';
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

  // Create a readable stream from buffer
  const stream = Readable.from(buffer);

  return new Promise((resolve, reject) => {
    stream
      .pipe(unzipper.Parse())
      .on('entry', async (entry) => {
        const path = entry.path;
        const type = entry.type;
        const size = entry.vars.uncompressedSize || 0;

        // Skip directories
        if (type === 'Directory') {
          entry.autodrain();
          return;
        }

        // Skip files that are too large
        if (size > MAX_FILE_SIZE) {
          console.warn(`[bundle] Skipping large file: ${path} (${size} bytes)`);
          entry.autodrain();
          return;
        }

        // Skip hidden files and common junk
        const basename = path.split('/').pop() || '';
        if (
          basename.startsWith('.') ||
          basename === 'Thumbs.db' ||
          basename === 'desktop.ini'
        ) {
          entry.autodrain();
          return;
        }

        // Check file limit
        if (files.length >= MAX_FILES) {
          console.warn(`[bundle] File limit reached (${MAX_FILES}), skipping remaining files`);
          entry.autodrain();
          return;
        }

        // Read file content
        const chunks: Buffer[] = [];
        entry.on('data', (chunk: Buffer) => chunks.push(chunk));
        entry.on('end', () => {
          const content = Buffer.concat(chunks);
          const isBinary = isBinaryFile(path);

          files.push({
            file: path,
            data: isBinary ? content.toString('base64') : content.toString('utf-8'),
            encoding: isBinary ? 'base64' : undefined,
          });
        });
      })
      .on('close', () => {
        console.log(`[bundle] Extracted ${files.length} files`);
        resolve({ files, hash });
      })
      .on('error', (error) => {
        console.error('[bundle] Extraction error:', error);
        reject(new Error(`Failed to extract bundle: ${error.message}`));
      });
  });
}

/**
 * Add default files if missing (index.html for static sites)
 */
export function ensureDefaultFiles(files: DeploymentFile[]): DeploymentFile[] {
  const hasIndexHtml = files.some(
    (f) => f.file === 'index.html' || f.file.endsWith('/index.html')
  );

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
