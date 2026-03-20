import axios from 'axios';

const DEFAULT_COVER = 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=300&q=80';
const MIN_DURATION_MS = 60_000; // filter out tracks shorter than 1 minute

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Parse "Artist - Title" from filename. Falls back to "Unknown Artist". */
function parseFilename(name) {
  const extMatch = name.match(/\.([^/.]+)$/);
  const ext = extMatch ? extMatch[1].toUpperCase() : '';
  const base = name.replace(/\.[^/.]+$/, ''); // strip extension
  const sep = base.indexOf(' - ');
  if (sep > 0) {
    return { artist: base.slice(0, sep).trim(), title: base.slice(sep + 3).trim(), ext };
  }
  return { artist: 'Unknown Artist', title: base, ext };
}

/** Fetch up to 1000 items of a given query, paginating automatically. */
async function fetchAll(accessToken, query, fields, extraParams = {}) {
  const all = [];
  let pageToken = null;
  do {
    const params = new URLSearchParams({
      q: query,
      fields: `nextPageToken,files(${fields})`,
      pageSize: '1000',
      ...extraParams,
      ...(pageToken ? { pageToken } : {}),
    });
    const { data } = await axios.get(
      `https://www.googleapis.com/drive/v3/files?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    all.push(...(data.files || []));
    pageToken = data.nextPageToken || null;
  } while (pageToken);
  return all;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Returns { tracks, folders }
 *  tracks  – all audio files > 1 min, enriched with artist/title/folderId/folderName
 *  folders – [{ id, name, coverUrl, trackCount }]
 */
export async function fetchDriveLibrary(accessToken) {
  // 1. Fetch all audio files (with parent + duration metadata)
  const rawFiles = await fetchAll(
    accessToken,
    "mimeType contains 'audio/' and trashed = false",
    'id,name,mimeType,size,thumbnailLink,parents,videoMediaMetadata',
    { orderBy: 'name' }
  );

  // 2. Collect unique parent folder IDs
  const folderIds = [...new Set(
    rawFiles.flatMap(f => f.parents || [])
  )];

  // 3. Fetch folder names (batch as OR query)
  let folderMap = {};
  if (folderIds.length > 0) {
    for (const id of folderIds) {
      try {
        const { data } = await axios.get(`https://www.googleapis.com/drive/v3/files/${id}?fields=id,name`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (data?.id) {
          folderMap[data.id] = data.name;
        }
      } catch (error) {
        console.warn(`Could not fetch folder metadata for ${id}`, error.message);
      }
    }
  }

  // 4. Build track list, applying the < 1 min filter
  const tracks = [];
  const cachedDurations = (() => {
    try { return JSON.parse(localStorage.getItem('drivemusic_durations') || '{}'); }
    catch { return {}; }
  })();

  for (const file of rawFiles) {
    let durationMs = file.videoMediaMetadata?.durationMillis
      ? parseInt(file.videoMediaMetadata.durationMillis, 10)
      : null;

    // Fallback to cache if Drive doesn't have it
    if (durationMs === null && cachedDurations[file.id]) {
      durationMs = cachedDurations[file.id];
    }

    // If Drive reports duration and it's < 1 min — skip
    if (durationMs !== null && durationMs < MIN_DURATION_MS) continue;

    const { artist, title, ext } = parseFilename(file.name);
    const folderId = file.parents?.[0] || 'root';
    const folderName = folderMap[folderId] || 'My Drive';

    const durationSec = durationMs ? Math.floor(durationMs / 1000) : null;
    const durationStr = durationSec
      ? `${Math.floor(durationSec / 60)}:${String(durationSec % 60).padStart(2, '0')}`
      : 'Unknown';

    tracks.push({
      id: file.id,
      title,
      artist,
      format: ext,
      duration: durationStr,
      durationMs: durationMs || 0,
      size: file.size,
      folderId,
      folderName,
      url: `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`,
      coverUrl: file.thumbnailLink
        ? file.thumbnailLink.replace('=s220', '=s400')
        : DEFAULT_COVER,
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  }

  // 5. Build folder summary
  const folderTrackCount = {};
  const folderCover = {};
  for (const t of tracks) {
    if (!folderTrackCount[t.folderId]) { folderTrackCount[t.folderId] = 0; folderCover[t.folderId] = t.coverUrl; }
    folderTrackCount[t.folderId]++;
  }

  const folders = Object.entries(folderTrackCount)
    .filter(([, count]) => count > 0)
    .map(([id, count]) => ({
      id,
      name: folderMap[id] || (id === 'root' ? 'My Drive' : 'Folder'),
      coverUrl: folderCover[id] || DEFAULT_COVER,
      trackCount: count,
    }));

  return { tracks, folders };
}
