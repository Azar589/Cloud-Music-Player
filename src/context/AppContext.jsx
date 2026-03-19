import React, { createContext, useContext, useState, useEffect } from 'react';
import { fetchR2Library, WORKER_URL } from '../services/R2Service';

const AppContext = createContext();
export const useApp = () => useContext(AppContext);

export const AppProvider = ({ children }) => {
  // ── Library state ──────────────────────────────────────
  const [allTracks, setAllTracks] = useState([]);
  const [folders, setFolders] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);

  // Layout states
  const [showNowPlaying, setShowNowPlaying] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('viewMode') || 'vinyl');

  const updateViewMode = (mode) => {
    setViewMode(mode);
    localStorage.setItem('viewMode', mode);
  };

  // ── Navigation state ──────────────────────────────────
  const [activeView, setActiveView] = useState('home');
  const [viewParam, setViewParam] = useState(null);
  const [navHistory, setNavHistory] = useState([{ view: 'home', param: null }]);

  // ── Load R2 library once on mount ──────────────────
  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true); setLoadError(null);
        const { tracks, folders } = await fetchR2Library();

        let cachedDurations = {};
        let cachedMeta = {};
        try {
          cachedDurations = JSON.parse(localStorage.getItem('drivemusic_durations') || '{}');
          cachedMeta = JSON.parse(localStorage.getItem('drivemusic_metadata') || '{}');
        } catch (e) { }

        const hydratedTracks = (tracks || []).map(t => {
          let updated = { ...t };

          const durationMs = cachedDurations[t.id];
          if (durationMs) {
            const durationSec = Math.floor(durationMs / 1000);
            const durationStr = `${Math.floor(durationSec / 60)}:${String(durationSec % 60).padStart(2, '0')}`;
            updated.duration = durationStr;
            updated.durationMs = durationMs;
          }

          if (cachedMeta[t.id]) {
            updated = { ...updated, ...cachedMeta[t.id], _metadataProbed: true };
          }
          return updated;
        });

        setAllTracks(hydratedTracks);
        setFolders(folders || []);
      } catch (err) {
        setLoadError('Could not load your R2 library. Check your worker connection.');
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  // ── Listen for late duration updates (e.g. from playing) ──
  useEffect(() => {
    const handleUpdate = (e) => {
      const { id, durationMs } = e.detail;
      const durationSec = Math.floor(durationMs / 1000);
      const durationStr = `${Math.floor(durationSec / 60)}:${String(durationSec % 60).padStart(2, '0')}`;

      setAllTracks(prev => prev.map(t =>
        t.id === id ? { ...t, duration: durationStr, durationMs } : t
      ));
    };

    window.addEventListener('trackDurationUpdated', handleUpdate);
    return () => window.removeEventListener('trackDurationUpdated', handleUpdate);
  }, []);

  // ── Background metadata discovery (Safe Sequential) ──────────────────
  // sequential throttled, no memory leak, updates D1 database for future visitors for free.
  useEffect(() => {
    const tracksNeedingProbe = allTracks.filter(t => 
      (!t.durationMs || t.artist === 'Unknown Artist' || t.coverUrl?.includes('images.unsplash.com')) && t.url
    );
    if (tracksNeedingProbe.length === 0) return;

    let idx = 0;
    let cancelled = false;

    const getDurationStr = (d) => {
      const s = Math.floor(d);
      return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    };

    const audio = new Audio();
    audio.preload = 'metadata';

    const safeProbe = async () => {
      if (cancelled || idx >= tracksNeedingProbe.length) return;
      const track = tracksNeedingProbe[idx];

      const finishAndNext = async (updates) => {
        if (!cancelled) {
          // 1. Update D1 Index back-end so future views load immediately
          try {
            await fetch(`${WORKER_URL}/tracks/update`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: track.id, ...updates })
            });
          } catch (e) { }

          // 2. Update local app state
          setAllTracks(prev => prev.map(t => t.id === track.id ? { ...t, ...updates } : t));

          idx++;
          setTimeout(safeProbe, 1500); // 1.5s delay throttled sequentially
        }
      };

      audio.onloadedmetadata = () => {
        const d = audio.duration;
        let updates = {};
        if (d && isFinite(d)) {
          const durationMs = Math.round(d * 1000);
          updates.durationMs = durationMs;
          updates.duration = getDurationStr(d);
        }

        const jsmediatags = window.jsmediatags;
        if (jsmediatags) {
          jsmediatags.read(track.url, {
            onSuccess: (tag) => {
              const t = tag.tags;
              if (t.artist) updates.artist = t.artist;
              if (t.title) updates.title = t.title;
              
              finishAndNext(updates);
            },
            onError: () => finishAndNext(updates)
          });
        } else {
          finishAndNext(updates);
        }
      };

      audio.onerror = () => { finishAndNext({}); };
      audio.src = track.url;
    };

    const timer = setTimeout(() => { if (!cancelled) safeProbe(); }, 5000);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      audio.onloadedmetadata = null;
      audio.onerror = null;
      audio.src = '';
    };
  }, [allTracks.filter(t => !t.durationMs).length]);

  // ── Derived: artist map ─────────────────────────────
  const artistMap = allTracks.reduce((acc, t) => {
    const a = t.artist || 'Unknown Artist';
    if (!acc[a]) acc[a] = [];
    acc[a].push(t);
    return acc;
  }, {});

  // ── Navigation helpers ─────────────────────────────
  const navigate = (view, param = null, replace = false) => {
    setActiveView(view);
    setViewParam(param);
    if (replace || view === 'home') {
      setNavHistory([{ view, param }]); // Reset history
    } else {
      setNavHistory(prev => [...prev, { view, param }]);
    }
  };

  const goBack = () => {
    if (navHistory.length <= 1) return;
    const newHistory = [...navHistory];
    newHistory.pop(); // remove current
    const prev = newHistory[newHistory.length - 1];
    setNavHistory(newHistory);
    setActiveView(prev.view);
    setViewParam(prev.param);
  };

  return (
    <AppContext.Provider value={{
      allTracks, folders, artistMap, isLoading, loadError,
      activeView, viewParam, navigate, goBack, canGoBack: navHistory.length > 1,
      showNowPlaying,
      setShowNowPlaying,
      mobileNavOpen,
      setMobileNavOpen,
      viewMode,
      setViewMode: updateViewMode
    }}>
      {children}
    </AppContext.Provider>
  );
};
