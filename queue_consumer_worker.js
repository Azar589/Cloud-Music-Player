/**
 * Starter Code: Automated Event-Driven Metadata Extractor
 * 
 * 1. Your R2 bucket triggers an event to a Cloudflare Queue on uploaded files.
 * 2. This Worker consumes messages from that queue.
 * 3. It fetches the audio, reads metadata (e.g. using a light parser), and saves to D1 SQL DB.
 */

export default {
  async queue(batch, env, ctx) {
    for (const message of batch.messages) {
      const event = message.body;
      const eventType = event.action; // e.g., "PutObject"
      const key = event.object?.key; // Full file path in R2

      if (!key || eventType !== 'PutObject') {
        console.log(`Skipping event type: ${eventType || 'Unknown'} for key: ${key}`);
        continue;
      }

      // Skip non-audio extensions
      const ext = key.split('.').pop().toLowerCase();
      if (!['mp3', 'flac', 'm4a', 'wav'].includes(ext)) {
        continue;
      }

      console.log(`🎵 Extracting metadata for: ${key} ...`);

      try {
        // 1. Fetch the audio object from R2
        const file = await env.MUSIC_BUCKET.get(key);
        if (!file) throw new Error("File could not be loaded from R2");

        /**
         * 2. Extract Metadata (ID3 / FLAC structures)
         * - For standard js inside a Worker (no Node 'fs'), you use lightweight byte buffers.
         */
        const title = key.split('/').pop()?.replace(`.${ext}`, '') || "Track";
        const artist = "Unknown Artist"; // Placeholder for parser loop
        const durationMs = 0;           // Placeholder for parser loop

        console.log(` -> Title: ${title} | Artist: ${artist}`);

        // 3. Save output down to Cloudflare D1 SQL Database
        if (env.DB) {
          const trackUrl = `${env.STREAM_DOMAIN || 'https://yourworker.workers.dev'}/api/stream?key=${encodeURIComponent(key)}`;
          
          await env.DB.prepare(`
            INSERT OR REPLACE INTO tracks (id, title, artist, url, durationMs, has_metadata)
            VALUES (?, ?, ?, ?, ?, 1)
          `).bind(key, title, artist, trackUrl, durationMs).run();

          console.log(`✅ Metadata successfully saved to D1 for ${key}`);
        } else {
          console.warn("⚠️ Database binding 'env.DB' was not found. Skipping SQL Save.");
        }

      } catch (err) {
        console.error(`❌ Failed to process metadata for ${key}:`, err);
        // Do NOT crash the whole batch, continue to next message
      }
    }
  }
}

/**
 * 🛠️ Deployment Steps:
 * 
 * 1. Create a Cloudflare Queue:
 *    npx wrangler queues create r2-uploads-queue
 * 
 * 2. Link your R2 Bucket to trigger to that queue:
 *    npx wrangler r2 bucket notification create YOUR_BUCKET_NAME --event PutObject --queue r2-uploads-queue
 * 
 * 3. Inside wrapper wrangler.json index add bindings:
 *    "queues": { "consumers": [{ "queue": "r2-uploads-queue" }] },
 *    "d1_databases": [{ "binding": "DB", "database_id": "YOUR_D1_ID" }]
 */
