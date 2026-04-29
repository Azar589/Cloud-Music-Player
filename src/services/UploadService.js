// ── Upload Service ─────────────────────────────────────────────────────────
// Streams files directly through the Cloudflare Worker to R2.
// No external dependencies — uses the native R2 binding on the Worker side.
// ──────────────────────────────────────────────────────────────────────────

import { WORKER_URL } from './R2Service';

const ALLOWED_EXTENSIONS = ['mp3', 'flac', 'wav', 'ogg', 'm4a', 'aac'];
const MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024; // 500 MB

/**
 * Validates a file before attempting upload.
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateAudioFile(file) {
  if (!file) return { valid: false, error: 'No file selected.' };

  const ext = file.name.split('.').pop().toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return {
      valid: false,
      error: `Unsupported format ".${ext}". Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`,
    };
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 500 MB.`,
    };
  }

  return { valid: true };
}

/**
 * Step 1: Stream the file through the Worker directly into R2.
 * Uses XMLHttpRequest so we get real upload progress events.
 *
 * Endpoint: POST /api/upload/stream?key=<R2_key>
 * Headers:  Content-Type: <mime>  |  X-Admin-Secret: <secret>
 * Body:     raw file binary
 *
 * @param {string} key            - R2 object key (e.g. "Hi-Res/song.flac")
 * @param {File} file
 * @param {string} adminSecret
 * @param {function(number): void} onProgress  - receives 0–100
 * @returns {Promise<void>}
 */
function streamToWorker(key, file, adminSecret, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve();
      } else {
        let msg = `Upload failed (HTTP ${xhr.status})`;
        try {
          const data = JSON.parse(xhr.responseText);
          if (data.error) msg = data.error;
        } catch { /* ignore */ }
        reject(new Error(msg));
      }
    });

    xhr.addEventListener('error', () => reject(new Error('Network error during upload.')));
    xhr.addEventListener('abort', () => reject(new Error('Upload was aborted.')));

    // Stream to Worker — Worker pipes directly into R2
    const endpoint = `${WORKER_URL}/upload/stream?key=${encodeURIComponent(key)}`;
    xhr.open('POST', endpoint);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.setRequestHeader('X-Admin-Secret', adminSecret);
    xhr.send(file); // sends raw binary body
  });
}

/**
 * Step 2: Tell the Worker to scan & index the newly uploaded file.
 * Triggers metadata extraction and D1 insert for just this one track.
 *
 * @param {string} key
 * @param {string} adminSecret
 * @returns {Promise<void>}
 */
async function indexUploadedTrack(key, adminSecret) {
  const res = await fetch(`${WORKER_URL}/upload/index`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Secret': adminSecret,
    },
    body: JSON.stringify({ key }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.warn(`Track indexing warning (${res.status}):`, text);
    // Non-fatal — the cron scan will pick it up on the next run
  }
}

/**
 * Full upload pipeline:
 *  1. Validate file
 *  2. Stream file through Worker → R2
 *  3. Trigger single-track indexing on Worker
 *
 * @param {{
 *   file: File,
 *   folderId: string,
 *   adminSecret: string,
 *   onProgress: (pct: number) => void,
 *   onStatusChange: (msg: string) => void,
 * }} options
 * @returns {Promise<{ key: string }>}
 */
export async function uploadTrack({ file, folderId, adminSecret, onProgress, onStatusChange }) {
  // Build R2 key — place file inside the current folder
  const safeName = file.name.replace(/[^\w\s.\-()[\]]/g, '_');
  const key = folderId && folderId !== 'root' ? `${folderId}/${safeName}` : safeName;

  onStatusChange('Uploading to Cloudflare R2…');
  await streamToWorker(key, file, adminSecret, onProgress);

  onStatusChange('Indexing track metadata…');
  await indexUploadedTrack(key, adminSecret);

  onStatusChange('Done!');
  return { key };
}
