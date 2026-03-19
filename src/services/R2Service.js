import axios from 'axios';

// ── CONFIGURATION ───────────────────────────────────────────────────────────
// 1. Deploy the worker_template.js code onto a Cloudflare Worker Dashboard.
// 2. Insert your workers domain endpoint here below!
// ────────────────────────────────────────────────────────────────────────────
export const WORKER_URL = 'https://drive-music-player.mohammedazar4458730.workers.dev/api';

const MOCK_TRACKS = [
  { id: '1', title: 'Midnight City', artist: 'M83', format: 'MP3', duration: '4:03', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3', coverUrl: 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=300&q=80', folderId: 'root', folderName: 'R2 Bucket' },
  { id: '2', title: 'Strobe', artist: 'deadmau5', format: 'FLAC', duration: '10:37', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3', coverUrl: 'https://images.unsplash.com/photo-1541689592655-f5f52827a3b4?w=300&q=80', folderId: 'root', folderName: 'R2 Bucket' },
  { id: '3', title: 'Windowlicker', artist: 'Aphex Twin', format: 'WAV', duration: '6:07', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3', coverUrl: 'https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=300&q=80', folderId: 'root', folderName: 'R2 Bucket' }
];

export async function fetchR2Library() {
  if (WORKER_URL.includes('YOUR_WORKER_SUBDOMAIN')) {
    console.log('Using R2 Mockup data preview...');
    return {
      tracks: MOCK_TRACKS,
      folders: [{ id: 'root', name: 'R2 Bucket', coverUrl: MOCK_TRACKS[0].coverUrl, trackCount: MOCK_TRACKS.length }]
    };
  }
  
  try {
    const { data } = await axios.get(`${WORKER_URL}/tracks`);
    return { 
      tracks: data.tracks || [], 
      folders: data.folders || [] 
    };
  } catch (error) {
    console.error('Error fetching R2 library:', error);
    throw error;
  }
}
