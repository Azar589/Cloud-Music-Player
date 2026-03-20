// ── CLOUDFLARE WORKER TEMPLATE ───────────────────────────
//
// INSTRUCTIONS:
// 1. Login to Cloudflare Dashboard -> Workers & Pages -> Create Worker.
// 2. Paste this code into the Edge Editor.
// 3. Settings -> Variables -> R2 Bucket Bindings.
//    Add binding named `MUSIC_BUCKET` pointing to your R2 bucket.
// 4. Deploy.
// ──────────────────────────────────────────────────────────

const MIME_TYPES = {
  mp3: 'audio/mpeg',
  flac: 'audio/flac',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
};

function getMimeType(key) {
  const ext = key.split('.').pop().toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'range, x-requested-with, if-modified-since, content-type',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range',
};

// ── FIX: extracted from scheduled() so /api/scan can call it directly
//         instead of the now-illegal `this.scheduled(...)` in module workers.
async function runScan(env, originUrl) {
  console.log('Starting metadata scan…');

  if (!env.MUSIC_BUCKET || !env.DB) {
    console.log('⚠️ Bucket or DB binding missing. Skipping.');
    return;
  }

  let allObjects = [];
  let cursor;
  do {
    const objects = await env.MUSIC_BUCKET.list({ cursor });
    allObjects.push(...objects.objects);
    cursor = objects.truncated ? objects.cursor : undefined;
  } while (cursor);

  const validExtensions = ['mp3', 'flac', 'wav', 'ogg', 'm4a', 'aac'];
  const audioObjects = allObjects.filter(obj => {
    const ext = obj.key.split('.').pop().toLowerCase();
    const internal = obj.key.startsWith('_') || obj.key.includes('/_') ||
      obj.key.startsWith('.') || obj.key.includes('/.');
    return validExtensions.includes(ext) && !internal;
  });

  console.log(`Scanning ${audioObjects.length} files…`);

  for (const item of audioObjects) {
    try {
      const exists = await env.DB
        .prepare('SELECT id, artist, coverUrl, sample_rate FROM tracks WHERE id = ?')
        .bind(item.key).first();

      const needsScan = !exists || exists.artist === 'Unknown Artist' ||
        !exists.coverUrl ||
        exists.coverUrl.includes('/api/cover') ||
        exists.coverUrl.includes('yourworker.workers.dev') ||
        (item.key.toLowerCase().endsWith('.flac') && exists && !exists.sample_rate);

      if (!needsScan) continue;

      const filename = item.key.split('/').pop();
      const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');

      let artist = 'Unknown Artist';
      let title = nameWithoutExt;
      let coverUrl;
      let sampleRate = null;
      let channels = null;
      let bitsPerSample = null;
      let durationMsValue = null;
      let durationStrValue = null;

      if (nameWithoutExt.includes(' - ')) {
        const parts = nameWithoutExt.split(' - ');
        artist = parts[0].trim();
        title = parts.slice(1).join(' - ').trim();
      }

      try {
        const file = await env.MUSIC_BUCKET.get(item.key, { range: { offset: 0, length: 1_048_576 } });
        if (file) {
          const buffer = await file.arrayBuffer();
          const view = new DataView(buffer);
          const header = String.fromCharCode(
            view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3)
          );

          // ── FLAC ──────────────────────────────────────────────────────
          if (header === 'fLaC') {
            let offset = 4;
            let isLast = false;
            sampleRate = 0;
            channels = 2; // default
            bitsPerSample = 16; // default

            while (!isLast && offset < buffer.byteLength - 4) {
              const blockHeader = view.getUint8(offset);
              isLast = (blockHeader & 0x80) !== 0;
              const blockType = blockHeader & 0x7F;
              const blockSize = (view.getUint8(offset + 1) << 16) |
                (view.getUint8(offset + 2) << 8) |
                view.getUint8(offset + 3);
              offset += 4;

              if (blockType === 0 && offset + blockSize <= buffer.byteLength) {
                const b10 = view.getUint8(offset + 10);
                const b11 = view.getUint8(offset + 11);
                const b12 = view.getUint8(offset + 12);
                const b13 = view.getUint8(offset + 13);
                sampleRate = (b10 << 12) | (b11 << 4) | (b12 >> 4);
                channels = ((b12 & 0x0F) >> 1) + 1;
                bitsPerSample = (((b12 & 0x01) << 4) | (b13 >> 4)) + 1;

                const b14 = view.getUint8(offset + 14);
                const b15 = view.getUint8(offset + 15);
                const b16 = view.getUint8(offset + 16);
                const b17 = view.getUint8(offset + 17);
                const totalSamples = ((b13 & 15) * 4294967296) + (b14 * 16777216) + (b15 * 65536) + (b16 * 256) + b17;
                if (sampleRate > 0) {
                  durationMsValue = Math.round((totalSamples / sampleRate) * 1000);
                  const secs = Math.round(totalSamples / sampleRate);
                  durationStrValue = `${Math.floor(secs / 60)}:${(secs % 60).toString().padStart(2, '0')}`;
                }
              } else if (blockType === 4 && offset + blockSize <= buffer.byteLength) {
                const vendorLen = view.getUint32(offset, true);
                let listOffset = offset + 4 + vendorLen;
                const listLen = view.getUint32(listOffset, true);
                listOffset += 4;
                const decoder = new TextDecoder('utf-8');
                for (let i = 0; i < listLen; i++) {
                  if (listOffset + 4 > buffer.byteLength) break;
                  const len = view.getUint32(listOffset, true);
                  listOffset += 4;
                  const comment = decoder.decode(new Uint8Array(buffer, listOffset, len));
                  listOffset += len;
                  if (comment.toUpperCase().startsWith('ARTIST=')) artist = comment.split('=')[1].trim();
                  if (comment.toUpperCase().startsWith('TITLE=')) title = comment.split('=')[1].trim();
                }
              } else if (blockType === 6) {
                try {
                  let picBuffer = buffer;
                  let picView = view;
                  let currOffset = offset;
                  if (offset + blockSize > buffer.byteLength) {
                    const fullFile = await env.MUSIC_BUCKET.get(item.key, {
                      range: { offset: offset - 4, length: blockSize + 4 },
                    });
                    if (fullFile) {
                      picBuffer = await fullFile.arrayBuffer();
                      picView = new DataView(picBuffer);
                      currOffset = 4;
                    }
                  }
                  let picOffset = currOffset + 4;
                  const mimeLen = picView.getUint32(picOffset); picOffset += 4;
                  let mimeType = '';
                  for (let i = 0; i < mimeLen; i++) mimeType += String.fromCharCode(picView.getUint8(picOffset + i));
                  if (!mimeType || mimeType === 'image/jpg') mimeType = 'image/jpeg';
                  picOffset += mimeLen;
                  const descLen = picView.getUint32(picOffset); picOffset += 4 + descLen + 16;
                  const dataLen = picView.getUint32(picOffset); picOffset += 4;
                  if (picOffset + dataLen <= picBuffer.byteLength) {
                    const picBytes = new Uint8Array(picBuffer, picOffset, dataLen);
                    const coverKey = `_covers/${item.key}`;
                    await env.MUSIC_BUCKET.put(coverKey, picBytes, { httpMetadata: { contentType: mimeType } });
                    coverUrl = `/api/cover?key=${encodeURIComponent(item.key)}`;
                  }
                } catch (e) { console.error('FLAC cover extraction failed:', e); }
              }

              offset += blockSize;
            }

            // ── MP3 / ID3v2 ───────────────────────────────────────────────
          } else if (header.startsWith('ID3')) {
            try {
              const majorVersion = view.getUint8(3);
              let offset = 10;
              const tagSize = ((view.getUint8(6) & 0x7F) << 21) |
                ((view.getUint8(7) & 0x7F) << 14) |
                ((view.getUint8(8) & 0x7F) << 7) |
                (view.getUint8(9) & 0x7F);

              const decodeID3 = (data) => {
                if (!data || data.length < 2) return '';
                const enc = data[0];
                const bytes = data.subarray(1);
                if (enc === 1) {
                  if (bytes.length >= 2 && ((bytes[0] === 0xFF && bytes[1] === 0xFE) ||
                    (bytes[0] === 0xFE && bytes[1] === 0xFF))) {
                    return new TextDecoder('utf-16').decode(bytes).replace(/\0/g, '').trim();
                  }
                  return new TextDecoder('iso-8859-1').decode(bytes).replace(/\0/g, '').trim();
                }
                if (enc === 0) return new TextDecoder('iso-8859-1').decode(bytes).replace(/\0/g, '').trim();
                if (enc === 2) {
                  try { return new TextDecoder('utf-16be').decode(bytes).replace(/\0/g, '').trim(); }
                  catch { return new TextDecoder('utf-16').decode(bytes).replace(/\0/g, '').trim(); }
                }
                return new TextDecoder('utf-8').decode(bytes).replace(/\0/g, '').trim();
              };

              while (offset < tagSize + 10 && offset < buffer.byteLength - 10) {
                const frameID = String.fromCharCode(
                  view.getUint8(offset), view.getUint8(offset + 1),
                  view.getUint8(offset + 2), view.getUint8(offset + 3)
                );
                let frameSize = majorVersion === 4
                  ? ((view.getUint8(offset + 4) & 0x7F) << 21) | ((view.getUint8(offset + 5) & 0x7F) << 14) |
                  ((view.getUint8(offset + 6) & 0x7F) << 7) | (view.getUint8(offset + 7) & 0x7F)
                  : view.getUint32(offset + 4);
                offset += 10;
                if (offset + frameSize > buffer.byteLength) break;
                const frameData = new Uint8Array(buffer, offset, frameSize);

                if (frameID === 'TIT2') { const r = decodeID3(frameData); if (r) title = r; }
                if (frameID === 'TPE1') { const r = decodeID3(frameData); if (r) artist = r; }
                if (frameID === 'APIC') {
                  const textEnc = frameData[0];
                  let p = 1;
                  let mime = '';
                  while (frameData[p] !== 0 && p < frameData.length) mime += String.fromCharCode(frameData[p++]);
                  if (!mime || mime === 'image/jpg' || mime === '-->') mime = 'image/jpeg';
                  p++; p++;
                  if (textEnc === 1 || textEnc === 2) {
                    while (p < frameData.length - 1 && (frameData[p] !== 0 || frameData[p + 1] !== 0)) p++;
                    p += 2;
                  } else {
                    while (frameData[p] !== 0 && p < frameData.length) p++;
                    p++;
                  }
                  if (p < frameData.length) {
                    try {
                      const coverKey = `_covers/${item.key}`;
                      await env.MUSIC_BUCKET.put(coverKey, frameData.subarray(p), { httpMetadata: { contentType: mime } });
                      coverUrl = `/api/cover?key=${encodeURIComponent(item.key)}`;
                    } catch (e) { console.error('MP3 cover save failed:', e); }
                  }
                }
                offset += frameSize;
              }
            } catch (e) { console.error('ID3 parse error:', e); }
          }
        }
      } catch (e) { console.error('Binary parse failed:', e); }

      const trackUrl = `${env.STREAM_DOMAIN || 'https://yourworker.workers.dev'}/api/stream?key=${encodeURIComponent(item.key)}`;
      await env.DB.prepare(`
        INSERT OR REPLACE INTO tracks (id, title, artist, url, format, coverUrl, sample_rate, channels, bits_per_sample, durationMs, durationStr, has_metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `).bind(
        item.key, title, artist, trackUrl, item.key.split('.').pop().toUpperCase(), coverUrl || null,
        sampleRate || null, channels || null, bitsPerSample || null, durationMsValue, durationStrValue
      ).run();

      console.log(`✅ Indexed: ${item.key}`);
    } catch (err) {
      console.error(`❌ Indexing failed for ${item.key}:`, err);
    }
  }

  console.log('✅ Scan complete.');
}

// ── Worker export ────────────────────────────────────────────────────────────
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    // ── GET /api/tracks ────────────────────────────────────────────────────
    if (url.pathname === '/api/tracks') {
      if (!env.MUSIC_BUCKET) return new Response('Bucket binding missing', { status: 500, headers: CORS });

      let allObjects = [];
      let cursor;
      do {
        const objects = await env.MUSIC_BUCKET.list({ cursor });
        allObjects.push(...objects.objects);
        cursor = objects.truncated ? objects.cursor : undefined;
      } while (cursor);

      const validExtensions = Object.keys(MIME_TYPES);
      const audioObjects = allObjects.filter(obj => {
        const ext = obj.key.split('.').pop().toLowerCase();
        const internal = obj.key.startsWith('_') || obj.key.includes('/_') ||
          obj.key.startsWith('.') || obj.key.includes('/.');
        return validExtensions.includes(ext) && !internal;
      });

      let dbMeta = {};
      if (env.DB) {
        try {
          // fetch all columns including new ones
          const rows = await env.DB.prepare('SELECT * FROM tracks').all();
          (rows.results || []).forEach(r => { dbMeta[r.id] = r; });
        } catch (e) { console.error('D1 read failed:', e); }
      }

      const folderMap = {};
      const tracks = audioObjects.map(obj => {
        const key = obj.key;
        const filename = key.split('/').pop();
        const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');
        const indexed = dbMeta[key];

        let artist = indexed?.artist || 'Unknown Artist';
        let title = indexed?.title || nameWithoutExt;
        if (!indexed && nameWithoutExt.includes(' - ')) {
          const parts = nameWithoutExt.split(' - ');
          artist = parts[0].trim();
          title = parts.slice(1).join(' - ').trim();
        }

        const ext = filename.split('.').pop().toUpperCase();
        const qualityMap = { FLAC: '16-Bit • 44.1 kHz', MP3: '320 kbps', WAV: '24-Bit • 192 kHz', AAC: '256 kbps', M4A: '256 kbps' };
        const quality = qualityMap[ext] || 'Standard';

        const parts = key.split('/');
        let folderId = 'root';
        let folderName = 'R2 Bucket';
        if (parts.length > 1) {
          folderName = parts[parts.length - 2];
          folderId = parts.slice(0, parts.length - 1).join('/');
        }
        if (!folderMap[folderId]) folderMap[folderId] = { id: folderId, name: folderName, trackCount: 0 };
        folderMap[folderId].trackCount++;

        let coverUrl = indexed?.coverUrl;
        if (coverUrl?.includes('yourworker.workers.dev')) {
          coverUrl = coverUrl.replace(/^https?:\/\/yourworker\.workers\.dev/, '');
        }
        if (coverUrl?.startsWith('/')) coverUrl = `${url.origin}${coverUrl}`;

        return {
          id: key, title, artist,
          format: ext, quality, size: obj.size,
          url: `${url.origin}/api/stream?key=${encodeURIComponent(key)}`,
          durationStr: indexed?.durationStr,
          durationMs: indexed?.durationMs,
          sampleRate: indexed?.sample_rate,
          channels: indexed?.channels,
          bitsPerSample: indexed?.bits_per_sample,
          coverUrl: coverUrl || null,
          folderId, folderName,
        };
      });

      const res = Response.json({ tracks, folders: Object.values(folderMap) });
      Object.entries(CORS).forEach(([k, v]) => res.headers.set(k, v));
      return res;
    }

    // ── GET /api/stream ────────────────────────────────────────────────────
    if (url.pathname === '/api/stream') {
      const key = url.searchParams.get('key');
      if (!key) return new Response('Missing key', { status: 400, headers: CORS });
      if (!env.MUSIC_BUCKET) return new Response('Bucket binding missing', { status: 500, headers: CORS });

      const rangeHeader = request.headers.get('Range');
      const streamHeaders = new Headers(CORS);
      streamHeaders.set('Cache-Control', 'public, max-age=60, must-revalidate');
      streamHeaders.set('Accept-Ranges', 'bytes');
      streamHeaders.set('Content-Type', getMimeType(key));

      try {
        if (rangeHeader) {
          const probe = await env.MUSIC_BUCKET.head(key);
          if (!probe) return new Response('File not found', { status: 404, headers: CORS });
          const size = probe.size;

          const parts = rangeHeader.replace(/bytes=/i, '').trim().split('-');
          let start = parseInt(parts[0], 10);
          let end = parts[1] ? parseInt(parts[1], 10) : size - 1;
          if (isNaN(start)) { start = size - end; end = size - 1; }
          if (start < 0) start = 0;
          if (end >= size) end = size - 1;
          if (start > end || start >= size) {
            streamHeaders.set('Content-Range', `bytes */${size}`);
            return new Response('Requested range not satisfiable', { status: 416, headers: streamHeaders });
          }
          const chunksize = end - start + 1;
          const exactFile = await env.MUSIC_BUCKET.get(key, { range: { offset: start, length: chunksize } });
          if (!exactFile) return new Response('File not found', { status: 404, headers: CORS });
          streamHeaders.set('Content-Range', `bytes ${start}-${end}/${size}`);
          streamHeaders.set('Content-Length', String(chunksize));
          return new Response(exactFile.body, { status: 206, headers: streamHeaders });
        } else {
          const file = await env.MUSIC_BUCKET.get(key);
          if (!file) return new Response('File not found', { status: 404, headers: CORS });
          streamHeaders.set('Content-Length', String(file.size));
          return new Response(file.body, { status: 200, headers: streamHeaders });
        }
      } catch (e) {
        return new Response(e.message, { status: 500, headers: CORS });
      }
    }

    // ── GET /api/cover ─────────────────────────────────────────────────────
    if (url.pathname === '/api/cover') {
      const key = url.searchParams.get('key');
      if (!key) return new Response('Missing key', { status: 400, headers: CORS });
      if (!env.MUSIC_BUCKET) return new Response('Bucket binding missing', { status: 500, headers: CORS });
      try {
        const coverFile = await env.MUSIC_BUCKET.get(`_covers/${key}`);
        if (!coverFile) return new Response('Cover not found', { status: 404, headers: CORS });
        const h = new Headers(CORS);
        h.set('Content-Type', 'image/jpeg');
        h.set('Cache-Control', 'public, max-age=31536000');
        return new Response(coverFile.body, { status: 200, headers: h });
      } catch (e) {
        return new Response(e.message, { status: 500, headers: CORS });
      }
    }

    // ── GET /api/debug ─────────────────────────────────────────────────────
    if (url.pathname === '/api/debug') {
      try {
        const item = { key: 'Hi-Res/02 Indha Ponnungalae.flac' };
        const file = await env.MUSIC_BUCKET.get(item.key, { range: { offset: 0, length: 1048576 } });
        if (!file) return Response.json({ error: 'file missing' }, { headers: CORS });
        const buffer = await file.arrayBuffer();
        const view = new DataView(buffer);
        const header = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
        
        let sampleRate = null, channels = null, bitsPerSample = null;
        if (header === 'fLaC') {
            let offset = 4; let isLast = false;
            sampleRate = 0; channels = 2; bitsPerSample = 16;

            while (!isLast && offset < buffer.byteLength - 4) {
               const blockHeader = view.getUint8(offset);
               isLast = (blockHeader & 0x80) !== 0;
               const blockType = blockHeader & 0x7F;
               const blockSize = (view.getUint8(offset+1) << 16) | (view.getUint8(offset+2) << 8) | view.getUint8(offset+3);
               offset += 4;

               if (blockType === 0 && offset + blockSize <= buffer.byteLength) {
                   const b10 = view.getUint8(offset + 10);
                   const b11 = view.getUint8(offset + 11);
                   const b12 = view.getUint8(offset + 12);
                   const b13 = view.getUint8(offset + 13);
                   sampleRate = (b10 << 12) | (b11 << 4) | (b12 >> 4);
                   channels = ((b12 & 0x0F) >> 1) + 1;
                   bitsPerSample = (((b12 & 0x01) << 4) | (b13 >> 4)) + 1;
               }
               offset += blockSize;
            }
        }
        
        await env.DB.prepare(`
          INSERT OR REPLACE INTO tracks (id, title, artist, url, format, coverUrl, sample_rate, channels, bits_per_sample, durationMs, durationStr, has_metadata)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        `).bind(
           item.key, 'Test Title', 'Test Artist', 'http://test', 'FLAC', null,
           sampleRate || null, channels || null, bitsPerSample || null, null, null
        ).run();

        const r = Response.json({ success: true, sampleRate, channels, bitsPerSample });
        Object.entries(CORS).forEach(([k, v]) => r.headers.set(k, v));
        return r;
      } catch (e) {
        const r = Response.json({ success: false, error: e.message, stack: e.stack });
        Object.entries(CORS).forEach(([k, v]) => r.headers.set(k, v));
        return r;
      }
    }

    // ── GET /api/db/repair ─────────────────────────────────────────────────
    if (url.pathname === '/api/db/repair') {
      if (!env.DB) return new Response('DB binding missing', { status: 500, headers: CORS });
      try {
        try { await env.DB.prepare('ALTER TABLE tracks ADD COLUMN durationMs INTEGER').run(); } catch { /* already exists */ }
        try { await env.DB.prepare('ALTER TABLE tracks ADD COLUMN durationStr TEXT').run(); } catch { /* already exists */ }
        try { await env.DB.prepare('ALTER TABLE tracks ADD COLUMN sample_rate INTEGER').run(); } catch { }
        try { await env.DB.prepare('ALTER TABLE tracks ADD COLUMN channels INTEGER').run(); } catch { }
        try { await env.DB.prepare('ALTER TABLE tracks ADD COLUMN bits_per_sample INTEGER').run(); } catch { }
        const r = Response.json({ success: true, message: 'Database repaired' });
        Object.entries(CORS).forEach(([k, v]) => r.headers.set(k, v));
        return r;
      } catch (e) { return new Response(e.message, { status: 500, headers: CORS }); }
    }

    // ── GET /api/scan ──────────────────────────────────────────────────────
    // FIX: call runScan() directly — `this.scheduled()` is illegal in module workers
    if (url.pathname === '/api/scan') {
      try {
        await runScan(env, url);
        const r = Response.json({ success: true, message: 'Scan completed' });
        Object.entries(CORS).forEach(([k, v]) => r.headers.set(k, v));
        return r;
      } catch (e) { return new Response(e.message, { status: 500, headers: CORS }); }
    }

    // ── POST /api/tracks/update ────────────────────────────────────────────
    if (url.pathname === '/api/tracks/update' && request.method === 'POST') {
      if (!env.DB) return new Response('DB binding missing', { status: 500, headers: CORS });
      try {
        const body = await request.json();
        const { id } = body;
        if (!id) return new Response('Missing track ID', { status: 400, headers: CORS });

        let query = 'UPDATE tracks SET has_metadata = 1';
        const params = [];
        if (body.artist && body.artist !== 'Unknown Artist') { query += ', artist = ?'; params.push(body.artist); }
        if (body.title) { query += ', title = ?'; params.push(body.title); }
        if (body.durationMs) { query += ', durationMs = ?'; params.push(body.durationMs); }
        if (body.durationStr) { query += ', durationStr = ?'; params.push(body.durationStr); }
        if (body.coverUrl) { query += ', coverUrl = ?'; params.push(body.coverUrl); }
        query += ' WHERE id = ?';
        params.push(id);

        await env.DB.prepare(query).bind(...params).run();
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...CORS, 'Content-Type': 'application/json' },
        });
      } catch (e) { return new Response(e.message, { status: 500, headers: CORS }); }
    }

    return new Response('Endpoint not found', { status: 404, headers: CORS });
  },

  // ── Cron trigger ──────────────────────────────────────────────────────────
  async scheduled(event, env, ctx) {
    await runScan(env, null);
  },
};