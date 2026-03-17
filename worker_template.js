// ── CLOUDFLARE WORKER TEMPLATE ───────────────────────────
// 
// INSTRUCTIONS:
// 1. Login to your Cloudflare Dashboard -> Workers & Pages -> Create Worker.
// 2. Paste the code below directly into the Edge Editor script.
// 3. Tab down to "Settings" -> "Variables" -> "R2 Bucket Bindings".
// 4. Click "Add Binding". Name the variable exactly `MUSIC_BUCKET` and link it to your actual R2 Media Bucket node name.
// 5. Deploy.
// ──────────────────────────────────────────────────────────

const MIME_TYPES = {
  'mp3': 'audio/mpeg',
  'flac': 'audio/flac',
  'wav': 'audio/wav',
  'ogg': 'audio/ogg',
  'm4a': 'audio/mp4',
  'aac': 'audio/aac'
};

function getMimeType(key) {
  const ext = key.split('.').pop().toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Add CORS Headers Support setup
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'range, x-requested-with, if-modified-since, content-type',
      'Access-Control-Expose-Headers': 'Content-Length, Content-Range'
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // ── 1. Fetch JSON List (with Pagination for > 1000 objects) ──
    if (url.pathname === '/api/tracks') {
      if (!env.MUSIC_BUCKET) return new Response("Bucket Binding Missing", { status: 500, headers: corsHeaders });

      let allObjects = [];
      let cursor = undefined;

      // Handle pagination
      do {
        const objects = await env.MUSIC_BUCKET.list({ cursor });
        allObjects.push(...objects.objects);
        cursor = objects.truncated ? objects.cursor : undefined;
      } while (cursor);

      const folderMap = {};

      // ── Filter out non-audio files (folders, system files, etc.) ──
      const validExtensions = Object.keys(MIME_TYPES);
      const audioObjects = allObjects.filter(obj => {
        const ext = obj.key.split('.').pop().toLowerCase();
        return validExtensions.includes(ext);
      });

      let dbMeta = {};
      if (env.DB) {
        try {
          const rows = await env.DB.prepare("SELECT * FROM tracks").all();
          (rows.results || []).forEach(r => {
            dbMeta[r.id] = r;
          });
        } catch (e) {
          console.error("D1 Read Failed:", e);
        }
      }

      const tracks = audioObjects.map(obj => {
        const key = obj.key;
        const filename = key.split('/').pop();
        const nameWithoutExt = filename.replace(/\.[^/.]+$/, "");

        const indexed = dbMeta[key];

        // 1. Use D1 Indexed Metadata if available
        let artist = indexed?.artist || "Unknown Artist";
        let title = indexed?.title || nameWithoutExt;

        // 2. Fallback to guessing if database is empty
        if (!indexed && nameWithoutExt.includes(" - ")) {
          const parts = nameWithoutExt.split(" - ");
          artist = parts[0].trim();
          title = parts.slice(1).join(" - ").trim();
        }

        const ext = filename.split('.').pop().toUpperCase();

        let quality = "";
        if (ext === 'FLAC') quality = '16-Bit • 44.1 kHz';
        else if (ext === 'MP3') quality = '320 kbps';
        else if (ext === 'WAV') quality = '24-Bit • 192 kHz';
        else if (ext === 'AAC' || ext === 'M4A') quality = '256 kbps';
        else quality = 'Standard';

        // ── Dynamic Folder Extraction ──
        const parts = key.split('/');
        let folderId = 'root';
        let folderName = 'R2 Bucket';

        if (parts.length > 1) {
          folderName = parts[parts.length - 2];
          folderId = parts.slice(0, parts.length - 1).join('/');
        }

        // Aggregate folder counts
        if (!folderMap[folderId]) {
          folderMap[folderId] = {
            id: folderId,
            name: folderName,
            trackCount: 0
          };
        }
        folderMap[folderId].trackCount++;

        return {
          id: key,
          title: title,
          artist: artist,
          format: ext,
          quality: quality,
          url: `${url.origin}/api/stream?key=${encodeURIComponent(key)}`,
          // Use duration from D1 if loaded
          durationStr: indexed?.durationStr || undefined,
          durationMs: indexed?.durationMs || undefined,
          coverUrl: indexed?.coverUrl || null,
          folderId: folderId,
          folderName: folderName
        };
      });

      const response = Response.json({
        tracks: tracks,
        folders: Object.values(folderMap)
      });

      // Apply CORS headers
      for (const [key, value] of Object.entries(corsHeaders)) {
        response.headers.set(key, value);
      }
      return response;
    }

    // ── 2. Stream audio bytes safely with Range requests ────────
    if (url.pathname === '/api/stream') {
      const key = url.searchParams.get('key');
      if (!key) return new Response("Missing Key", { status: 400, headers: corsHeaders });
      if (!env.MUSIC_BUCKET) return new Response("Bucket Binding Missing", { status: 500, headers: corsHeaders });

      const rangeHeader = request.headers.get('Range');

      // Fix for ORB/CORB blocking: Standardize the headers
      const streamHeaders = new Headers(corsHeaders);
      streamHeaders.set('Access-Control-Allow-Origin', '*');
      streamHeaders.set('Cache-Control', 'public, max-age=31536000');
      streamHeaders.set('Accept-Ranges', 'bytes');
      streamHeaders.set('Content-Type', getMimeType(key)); // Strictly set MIME

      try {
        const file = await env.MUSIC_BUCKET.get(key);
        if (!file) return new Response("File Not Found", { status: 404, headers: corsHeaders });

        const size = file.size;

        // Handle Range Requests properly
        if (rangeHeader) {
          const parts = rangeHeader.replace(/bytes=/, "").split("-");
          const start = parseInt(parts[0], 10);
          const end = parts[1] ? parseInt(parts[1], 10) : size - 1;

          if (start >= size || end >= size) {
            streamHeaders.set('Content-Range', `bytes */${size}`);
            return new Response("Requested Range Not Satisfiable", { status: 416, headers: streamHeaders });
          }

          const chunksize = (end - start) + 1;

          // ── Fix for large audio files (FLAC/WAV) ──
          // Cancel the first lazy stream to free up worker memory/handles 
          // before triggering a second Range request.
          file.body.cancel();

          // Request specific byte range from R2
          const exactFile = await env.MUSIC_BUCKET.get(key, { range: { offset: start, length: chunksize } });

          streamHeaders.set('Content-Range', `bytes ${start}-${end}/${size}`);
          streamHeaders.set('Content-Length', chunksize);

          return new Response(exactFile.body, { status: 206, headers: streamHeaders });
        } else {
          // No range requested, return full file
          streamHeaders.set('Content-Length', size);
          return new Response(file.body, { status: 200, headers: streamHeaders });
        }
      } catch (e) {
        return new Response(e.message, { status: 500, headers: corsHeaders });
      }
    }

    // ── 3. Update track metadata in D1 ────────
    if (url.pathname === '/api/tracks/update' && request.method === 'POST') {
      if (!env.DB) return new Response("DB Binding Missing", { status: 500, headers: corsHeaders });

      try {
        const body = await request.json();
        const { id } = body;

        if (!id) return new Response("Missing track ID", { status: 400, headers: corsHeaders });

        let query = "UPDATE tracks SET has_metadata = 1";
        let params = [];

        if (body.artist && body.artist !== 'Unknown Artist') { query += ", artist = ?"; params.push(body.artist); }
        if (body.title) { query += ", title = ?"; params.push(body.title); }
        if (body.durationMs) { query += ", durationMs = ?"; params.push(body.durationMs); }
        if (body.durationStr) { query += ", durationStr = ?"; params.push(body.durationStr); }
        if (body.coverUrl) { query += ", coverUrl = ?"; params.push(body.coverUrl); }

        query += " WHERE id = ?";
        params.push(id);

        await env.DB.prepare(query).bind(...params).run();

        return new Response(JSON.stringify({ success: true }), { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      } catch (e) {
        return new Response(e.message, { status: 500, headers: corsHeaders });
      }
    }

    return new Response("Endpoint Not Found", { status: 404, headers: corsHeaders });
  },

  // ── 🕒 2. Free Cron Trigger Handler (Scheduled Scan) ──────────────────
  async scheduled(event, env, ctx) {
    console.log("Starting Free Metadata Scan...");

    if (!env.MUSIC_BUCKET || !env.DB) {
      console.log("⚠️ Bucket or DB Binding Missing. Skipping Indexing.");
      return;
    }

    try {
      let allObjects = [];
      let cursor = undefined;

      // 1. Get all files in R2 Bucket
      do {
        const objects = await env.MUSIC_BUCKET.list({ cursor });
        allObjects.push(...objects.objects);
        cursor = objects.truncated ? objects.cursor : undefined;
      } while (cursor);

      // Filter out non-audio files
      const validExtensions = ['mp3', 'flac', 'wav', 'ogg', 'm4a', 'aac'];
      const audioObjects = allObjects.filter(obj => {
        const ext = obj.key.split('.').pop().toLowerCase();
        return validExtensions.includes(ext);
      });

      console.log(`Scanning ${audioObjects.length} files...`);

      for (const item of audioObjects) {
        try {
          // 2. Check if file key already exists, but re-scan if it's missing details
          const exists = await env.DB.prepare("SELECT id, artist, coverUrl FROM tracks WHERE id = ?").bind(item.key).first();

          if (!exists || exists.artist === 'Unknown Artist' || !exists.coverUrl) {
            console.log(`Found new file to index: ${item.key}`);

            const filename = item.key.split('/').pop();
            const nameWithoutExt = filename.replace(/\.[^/.]+$/, "");

            let artist = "Unknown Artist";
            let title = nameWithoutExt;
            let coverUrl = undefined;

            if (nameWithoutExt.includes(" - ")) {
              const parts = nameWithoutExt.split(" - ");
              artist = parts[0].trim();
              title = parts.slice(1).join(" - ").trim();
            }

            // ── 🛡️ Light Pure JS Binary Reader for FLAC/MP3 ──
            try {
              const file = await env.MUSIC_BUCKET.get(item.key, { range: { offset: 0, length: 1048576 } }); // Fetch first 1MB
              if (file) {
                const buffer = await file.arrayBuffer();
                const view = new DataView(buffer);
                const header = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));

                // ── FLAC Parser ────────────────────────────────
                if (header === 'fLaC') {
                  let offset = 4;
                  let isLast = false;
                  while (!isLast && offset < buffer.byteLength - 4) {
                    const blockHeader = view.getUint8(offset);
                    isLast = (blockHeader & 0x80) !== 0;
                    const blockType = blockHeader & 0x7F;
                    const blockSize = (view.getUint8(offset + 1) << 16) | (view.getUint8(offset + 2) << 8) | view.getUint8(offset + 3);
                    offset += 4;

                    if (blockType === 4 && offset + blockSize <= buffer.byteLength) { // VORBIS_COMMENT
                      const vendorLen = view.getUint32(offset, true);
                      let listOffset = offset + 4 + vendorLen;
                      const commentListLen = view.getUint32(listOffset, true);
                      listOffset += 4;

                      const decoder = new TextDecoder('utf-8');
                      for (let i = 0; i < commentListLen; i++) {
                        if (listOffset + 4 > buffer.byteLength) break;
                        const len = view.getUint32(listOffset, true);
                        listOffset += 4;
                        const comment = decoder.decode(new Uint8Array(buffer, listOffset, len));
                        listOffset += len;

                        if (comment.toUpperCase().startsWith('ARTIST=')) artist = comment.split('=')[1].trim();
                        if (comment.toUpperCase().startsWith('TITLE=')) title = comment.split('=')[1].trim();
                      }
                    } 
                    else if (blockType === 6) { // PICTURE
                      try {
                        let picBuffer = buffer;
                        let picView = view;
                        let currOffset = offset;

                        if (offset + blockSize > buffer.byteLength) {
                          const fullFile = await env.MUSIC_BUCKET.get(item.key, { range: { offset: offset - 4, length: blockSize + 4 } });
                          if (fullFile) {
                            picBuffer = await fullFile.arrayBuffer();
                            picView = new DataView(picBuffer);
                            currOffset = 4;
                          }
                        }

                        let picOffset = currOffset + 4; // Skip Type
                        const mimeLen = picView.getUint32(picOffset); picOffset += 4 + mimeLen;
                        const descLen = picView.getUint32(picOffset); picOffset += 4 + descLen + 16; // skip desc, width
                        const dataLen = picView.getUint32(picOffset); picOffset += 4;

                        if (picOffset + dataLen <= picBuffer.byteLength) {
                          const picBytes = new Uint8Array(picBuffer, picOffset, dataLen);
                          let binary = '';
                          for (let i = 0; i < dataLen; i++) binary += String.fromCharCode(picBytes[i]);
                          coverUrl = `data:image/jpeg;base64,${btoa(binary)}`;
                        }
                      } catch (e) {
                        console.error("Picture extraction failed:", e);
                      }
                    }

                    offset += blockSize;
                  }
                } else if (header.startsWith('ID3')) { // ── MP3/ID3v2 Parser ─────────
                  try {
                    const majorVersion = view.getUint8(3);
                    let offset = 10; // Skip 10-byte ID3v2 header
                    
                    const tagSize = ((view.getUint8(6) & 0x7F) << 21) |
                                    ((view.getUint8(7) & 0x7F) << 14) |
                                    ((view.getUint8(8) & 0x7F) << 7)  |
                                    (view.getUint8(9) & 0x7F);

                    while (offset < tagSize + 10 && offset < buffer.byteLength - 10) {
                      const frameID = String.fromCharCode(view.getUint8(offset), view.getUint8(offset+1), view.getUint8(offset+2), view.getUint8(offset+3));
                      
                      let frameSize = 0;
                      if (majorVersion === 4) { // Synchsafe size in v2.4
                        frameSize = ((view.getUint8(offset + 4) & 0x7F) << 21) |
                                    ((view.getUint8(offset + 5) & 0x7F) << 14) |
                                    ((view.getUint8(offset + 6) & 0x7F) << 7)  |
                                    (view.getUint8(offset + 7) & 0x7F);
                      } else { // Standard 32-bit integer in v2.3
                        frameSize = view.getUint32(offset + 4);
                      }
                      
                      offset += 10; // Skip 10-byte frame header

                      if (offset + frameSize > buffer.byteLength) break;

                      const frameData = new Uint8Array(buffer, offset, frameSize);

                      const decodeID3 = (data) => {
                        if (!data || data.length < 2) return '';
                        const enc = data[0];
                        const bytes = data.subarray(1);
                        if (enc === 1) { // UTF-16
                          // Has BOM?
                          if (bytes.length >= 2 && ((bytes[0] === 0xFF && bytes[1] === 0xFE) || (bytes[0] === 0xFE && bytes[1] === 0xFF))) {
                            return new TextDecoder('utf-16').decode(bytes).replace(/\0/g, '').trim();
                          }
                          // Broken tag (missing BOM) masquerading as UTF-16 -> fallback to ISO-8859-1
                          return new TextDecoder('iso-8859-1').decode(bytes).replace(/\0/g, '').trim();
                        } else if (enc === 0) { // ISO-8859-1
                          return new TextDecoder('iso-8859-1').decode(bytes).replace(/\0/g, '').trim();
                        } else if (enc === 2) { // UTF-16BE
                          try { return new TextDecoder('utf-16be').decode(bytes).replace(/\0/g, '').trim(); }
                          catch(e) { return new TextDecoder('utf-16').decode(bytes).replace(/\0/g, '').trim(); }
                        }
                        return new TextDecoder('utf-8').decode(bytes).replace(/\0/g, '').trim();
                      };

                      if (frameID === 'TIT2') {
                        const raw = decodeID3(frameData);
                        if (raw) title = raw;
                      } else if (frameID === 'TPE1') {
                        const raw = decodeID3(frameData);
                        if (raw) artist = raw;
                      } else if (frameID === 'APIC') {
                        let picOffset = 1; // Skip encoding
                        while (frameData[picOffset] !== 0 && picOffset < frameData.length) picOffset++; picOffset++; // Skip MIME
                        picOffset++; // Skip picture type
                        while (frameData[picOffset] !== 0 && picOffset < frameData.length) picOffset++; picOffset++; // Skip description
                        
                        if (picOffset < frameData.length) {
                          const picBytes = frameData.subarray(picOffset);
                          let binary = '';
                          for (let i = 0; i < picBytes.length; i++) binary += String.fromCharCode(picBytes[i]);
                          coverUrl = `data:image/jpeg;base64,${btoa(binary)}`;
                        }
                      }

                      offset += frameSize;
                    }
                  } catch (e) {
                      console.error("ID3 Parse Error:", e);
                  }
                }
              }
            } catch (err) { console.error("Binary Parse Fail:", err); }

            const trackUrl = `${env.STREAM_DOMAIN || 'https://yourworker.workers.dev'}/api/stream?key=${encodeURIComponent(item.key)}`;

            await env.DB.prepare(`
              INSERT OR REPLACE INTO tracks (id, title, artist, url, format, coverUrl, has_metadata)
              VALUES (?, ?, ?, ?, ?, ?, 1)
            `).bind(item.key, title, artist, trackUrl, item.key.split('.').pop().toUpperCase(), coverUrl || null).run();

            console.log(`✅ Indexed (With Meta): ${item.key}`);
          }
        } catch (err) {
          console.error(`❌ Indexing failed for ${item.key}:`, err);
        }
      }

      console.log("✅ Scan Complete.");

    } catch (err) {
      console.error("❌ Scheduled Scan crashed:", err);
    }
  }
};
