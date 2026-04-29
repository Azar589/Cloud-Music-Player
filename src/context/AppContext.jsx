import React, { createContext, useContext, useState, useEffect, useMemo, useRef } from 'react';
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
  const ignoreNextPop = React.useRef(false);
  const [activeView, setActiveView] = useState('home');
  const [viewParam, setViewParam] = useState(null);
  const [navHistory, setNavHistory] = useState([{ view: 'home', param: null }]);

  // ── Load R2 library (extracted for reuse / refresh) ──────────────────
  const loadLibrary = React.useCallback(async () => {
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

      // Default sort: newest first (if uploadedAt is available)
      hydratedTracks.sort((a, b) => new Date(b.uploadedAt || 0) - new Date(a.uploadedAt || 0));

      setAllTracks(hydratedTracks);
      setFolders(folders || []);
    } catch {
      setLoadError('Could not load your R2 library. Check your worker connection.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ── Load R2 library once on mount ─────────────────────────────────────
  useEffect(() => { loadLibrary(); }, [loadLibrary]);

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

  // ── Background metadata discovery (fast, continuous queue) ─────────────
  const probeQueueRef = useRef([]);
  const isProbingRef = useRef(false);

  useEffect(() => {
    // Identify tracks that need probing and haven't been probed yet
    const unprobed = allTracks.filter(t =>
      (!t.durationMs || t.artist === 'Unknown Artist' || t.coverUrl?.includes('images.unsplash.com')) && t.url && !t._metadataProbed
    );
    
    // Append to queue if not already there
    unprobed.forEach(t => {
      if (!probeQueueRef.current.some(q => q.id === t.id)) {
        probeQueueRef.current.push(t);
      }
    });

    if (isProbingRef.current || probeQueueRef.current.length === 0) return;

    isProbingRef.current = true;
    const audio = new Audio();
    audio.preload = 'metadata';

    const getDurationStr = (d) => {
      const s = Math.floor(d);
      return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    };

    const processNext = async () => {
      if (probeQueueRef.current.length === 0) {
        isProbingRef.current = false;
        return;
      }

      const track = probeQueueRef.current.shift();

      const finishAndNext = async (updates) => {
        updates._metadataProbed = true; // Mark as probed to prevent infinite loops
        try {
          await fetch(`${WORKER_URL}/tracks/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: track.id, ...updates }),
          });
        } catch { /* ignore */ }

        setAllTracks(prev => prev.map(t => t.id === track.id ? { ...t, ...updates } : t));
        setTimeout(processNext, 200); // Fast 200ms delay between tracks
      };

      audio.onloadedmetadata = () => {
        const d = audio.duration;
        const updates = {};
        if (d && isFinite(d)) {
          updates.durationMs = Math.round(d * 1000);
          updates.duration = getDurationStr(d);
        }
        
        if (window.jsmediatags) {
          window.jsmediatags.read(track.url, {
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

    processNext();

  }, [allTracks]);

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
    if (view === 'home' && activeView !== 'home') {
      if (window.history.state?.appView) {
        ignoreNextPop.current = true;
        window.history.back();
      }
    } else if (activeView === 'home' && view !== 'home') {
      // If a panel is open (state.panel) or replace is true, replace the current history entry
      if (replace || window.history.state?.panel) {
        window.history.replaceState({ appView: view, param }, '');
      } else {
        window.history.pushState({ appView: view, param }, '');
      }
    } else if (activeView !== 'home' && view !== 'home') {
      // Off-home to another inner view -> replace state to keep stack flat
      window.history.replaceState({ appView: view, param }, '');
    }

    setActiveView(view);
    setViewParam(param);
    if (view !== 'search') {
      setSearchQuery('');
    }
    
    if (view === 'home') {
      setNavHistory([{ view: 'home', param: null }]);
    } else {
      setNavHistory([{ view: 'home', param: null }, { view, param }]);
    }
  };

  const goBack = () => {
    if (window.history.state?.appView) {
      ignoreNextPop.current = true;
      window.history.back();
    }
    setActiveView('home');
    setViewParam(null);
    setNavHistory([{ view: 'home', param: null }]);
  };

  // ── History-aware setters for panels ──────────────────────────────────
  const toggleNowPlaying = (val) => {
    if (val === showNowPlaying) return;
    if (val) {
      window.history.pushState({ panel: 'np' }, '');
    } else {
      // If closing manually, and we are at the state we pushed, pop it
      if (window.history.state?.panel === 'np') {
        ignoreNextPop.current = true;
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
        ignoreNextPop.current = true;
        window.history.back();
      }
    }
    setMobileNavOpen(val);
  };

  // ── History API for Back Gesture (Sidebar & NP Panel) ──────────────────
  useEffect(() => {
    const handlePopState = (e) => {
      // If this was triggered programmatically by closing a panel, ignore it
      if (ignoreNextPop.current) {
        ignoreNextPop.current = false;
        return;
      }

      // 1) Close panels if they are open (hardware back press)
      if (mobileNavOpen) { setMobileNavOpen(false); return; }
      if (showNowPlaying) { setShowNowPlaying(false); return; }
      
      // 2) Normal view navigation
      if (e.state?.appView) {
        // User popped forward? (edge case), or jumped history.
        setActiveView(e.state.appView);
        setViewParam(e.state.param);
        setNavHistory([{ view: 'home', param: null }, { view: e.state.appView, param: e.state.param }]);
      } else {
        // Popped back to the base state
        setActiveView('home');
        setViewParam(null);
        setNavHistory([{ view: 'home', param: null }]);
      }
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
      refreshLibrary: loadLibrary,
    }}>
      {children}
    </AppContext.Provider>
  );
};