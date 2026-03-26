import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { fetchR2Library, WORKER_URL } from '../services/R2Service';

const AppContext = createContext();
export const useApp = () => useContext(AppContext);

export const AppProvider = ({ children }) => {
  // ── Library state ──────────────────────────────────────────────────────
  const [allTracks, setAllTracks] = useState([]);
  const [folders, setFolders] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);

  // ── UI state ───────────────────────────────────────────────────────────
  const [showNowPlaying, setShowNowPlaying] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [viewMode, setViewModeState] = useState(() => localStorage.getItem('viewMode') || 'vinyl');
  const [searchQuery, setSearchQuery] = useState('');

  const setViewMode = (mode) => {
    setViewModeState(mode);
    localStorage.setItem('viewMode', mode);
  };

  // ── Navigation state ───────────────────────────────────────────────────
  const [activeView, setActiveView] = useState('home');
  const [viewParam, setViewParam] = useState(null);
  const [navHistory, setNavHistory] = useState([{ view: 'home', param: null }]);

  // ── Load R2 library once ───────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true);
        setLoadError(null);
        const { tracks, folders } = await fetchR2Library();

        let cachedDurations = {};
        let cachedMeta = {};
        try {
          cachedDurations = JSON.parse(localStorage.getItem('drivemusic_durations') || '{}');
          cachedMeta = JSON.parse(localStorage.getItem('drivemusic_metadata') || '{}');
        } catch { /* ignore */ }

        const hydratedTracks = (tracks || []).map(t => {
          let updated = { ...t };
          const durationMs = cachedDurations[t.id];
          if (durationMs) {
            const sec = Math.floor(durationMs / 1000);
            updated.duration = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
            updated.durationMs = durationMs;
          }
          if (cachedMeta[t.id]) updated = { ...updated, ...cachedMeta[t.id], _metadataProbed: true };
          return updated;
        });

        setAllTracks(hydratedTracks);
        setFolders(folders || []);
      } catch {
        setLoadError('Could not load your R2 library. Check your worker connection.');
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  // ── Listen for late duration updates ──────────────────────────────────
  useEffect(() => {
    const handle = (e) => {
      const { id, durationMs } = e.detail;
      const sec = Math.floor(durationMs / 1000);
      const durationStr = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
      setAllTracks(prev => prev.map(t => t.id === id ? { ...t, duration: durationStr, durationMs } : t));
    };
    window.addEventListener('trackDurationUpdated', handle);
    return () => window.removeEventListener('trackDurationUpdated', handle);
  }, []);

  // FIX: use useMemo for stable dep instead of inline .filter().length expression
  const unprobedCount = useMemo(
    () => allTracks.filter(t =>
      (!t.durationMs || t.artist === 'Unknown Artist' || t.coverUrl?.includes('images.unsplash.com')) && t.url
    ).length,
    [allTracks]
  );

  // ── Background metadata discovery (sequential, throttled) ─────────────
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
        if (cancelled) return;
        try {
          await fetch(`${WORKER_URL}/tracks/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: track.id, ...updates }),
          });
        } catch { /* non-critical */ }

        setAllTracks(prev => prev.map(t => t.id === track.id ? { ...t, ...updates } : t));
        idx++;
        setTimeout(safeProbe, 1500);
      };

      audio.onloadedmetadata = () => {
        const d = audio.duration;
        const updates = {};
        if (d && isFinite(d)) {
          updates.durationMs = Math.round(d * 1000);
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
            onError: () => finishAndNext(updates),
          });
        } else {
          finishAndNext(updates);
        }
      };

      audio.onerror = () => finishAndNext({});
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
  }, [unprobedCount]); // FIX: stable numeric dep instead of inline .filter().length

  // ── Derived: artist map ────────────────────────────────────────────────
  const artistMap = useMemo(() =>
    allTracks.reduce((acc, t) => {
      const a = t.artist || 'Unknown Artist';
      if (!acc[a]) acc[a] = [];
      acc[a].push(t);
      return acc;
    }, {}),
    [allTracks]
  );

  // ── Search: filtered tracks ────────────────────────────────────────────
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return allTracks.filter(t =>
      t.title?.toLowerCase().includes(q) ||
      t.artist?.toLowerCase().includes(q)
    );
  }, [searchQuery, allTracks]);

  // ── Navigation helpers ─────────────────────────────────────────────────
  const navigate = (view, param = null, replace = false) => {
    setActiveView(view);
    setViewParam(param);
    // FIX: only clear search if NOT navigating to search view itself
    if (view !== 'search') {
      setSearchQuery('');
    }
    if (replace || view === 'home') {
      setNavHistory([{ view, param }]);
    } else {
      setNavHistory(prev => [...prev, { view, param }]);
    }
  };

  const goBack = () => {
    if (navHistory.length <= 1) return;
    const newHistory = [...navHistory];
    newHistory.pop();
    const prev = newHistory[newHistory.length - 1];
    setNavHistory(newHistory);
    setActiveView(prev.view);
    setViewParam(prev.param);
  };

  // ── History-aware setters for panels ──────────────────────────────────
  const toggleNowPlaying = (val) => {
    if (val === showNowPlaying) return;
    if (val) {
      window.history.pushState({ panel: 'np' }, '');
    } else {
      // If closing manually, and we are at the state we pushed, pop it
      if (window.history.state?.panel === 'np') {
        window.history.back();
      }
    }
    setShowNowPlaying(val);
  };

  const toggleMobileNav = (val) => {
    if (val === mobileNavOpen) return;
    if (val) {
      window.history.pushState({ panel: 'nav' }, '');
    } else {
      if (window.history.state?.panel === 'nav') {
        window.history.back();
      }
    }
    setMobileNavOpen(val);
  };

  // ── History API for Back Gesture (Sidebar & NP Panel) ──────────────────
  useEffect(() => {
    const handlePopState = (e) => {
      // Close panels if they are open when back gesture is used
      // We don't call toggleNowPlaying/toggleMobileNav here because we don't 
      // want to call history.back() again (it's already been popped).
      if (mobileNavOpen) setMobileNavOpen(false);
      if (showNowPlaying) setShowNowPlaying(false);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [mobileNavOpen, showNowPlaying]);

  return (
    <AppContext.Provider value={{
      allTracks, folders, artistMap, isLoading, loadError,
      activeView, viewParam, navigate, goBack, canGoBack: navHistory.length > 1,
      showNowPlaying, setShowNowPlaying: toggleNowPlaying,
      mobileNavOpen, setMobileNavOpen: toggleMobileNav,
      viewMode, setViewMode,
      searchQuery, setSearchQuery,
      searchResults,
    }}>
      {children}
    </AppContext.Provider>
  );
};