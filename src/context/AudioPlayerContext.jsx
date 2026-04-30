import React, { createContext, useContext, useState, useRef, useEffect, useCallback, useMemo } from 'react';
import logo from '../assets/logo.png';

const AudioPlayerContext = createContext();
export const useAudioPlayer = () => useContext(AudioPlayerContext);

export const AudioPlayerProvider = ({ children }) => {
  const audioRef = useRef(null);
  if (audioRef.current === null) {
    const a = new Audio();
    a.crossOrigin = 'anonymous';
    audioRef.current = a;
  }

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [volume, setVolume] = useState(() => {
    const saved = localStorage.getItem('drivemusic_volume');
    return saved !== null ? parseFloat(saved) : 1.0;
  });
  const [prevVolume, setPrevVolume] = useState(1.0);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isShuffled, setIsShuffled] = useState(false);
  const [isRepeating, setIsRepeating] = useState(false);
  const [queue, setQueue] = useState([]);
  const [originalQueue, setOriginalQueue] = useState([]);
  const [recentlyPlayed, setRecentlyPlayed] = useState(() => {
    try { return JSON.parse(localStorage.getItem('drivemusic_recently_played') || '[]'); }
    catch { return []; }
  });
  const [isDownloading, setIsDownloading] = useState(false);
  const [sleepTimeLeft, setSleepTimeLeft] = useState(null);
  const [playbackContext, setPlaybackContext] = useState({ type: 'ALL SONGS', name: 'Music Library' });
  const [dominantColor, setDominantColor] = useState('20,20,30');
  const dominantColorCache = useRef({}); // imgSrc -> 'r,g,b'

  // ── Stable refs so callbacks never capture stale state ─────────────────
  const volumeRef = useRef(volume);
  const queueRef = useRef(queue);
  const originalQueueRef = useRef(originalQueue);
  const isShuffledRef = useRef(isShuffled);
  const isRepeatingRef = useRef(isRepeating);
  const currentTrackRef = useRef(currentTrack);

  useEffect(() => { volumeRef.current = volume; }, [volume]);
  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { originalQueueRef.current = originalQueue; }, [originalQueue]);
  useEffect(() => { isShuffledRef.current = isShuffled; }, [isShuffled]);
  useEffect(() => { isRepeatingRef.current = isRepeating; }, [isRepeating]);
  useEffect(() => { currentTrackRef.current = currentTrack; }, [currentTrack]);

  const activeLoadIdRef = useRef(null);
  const nextTrackRef = useRef(null);
  const prevTrackRef = useRef(null);
  const togglePlayRef = useRef(null);
  const fadeIntervalRef = useRef(null);
  const isFadingInRef = useRef(false);
  const preloadCacheRef = useRef({});
  const sleepIntervalRef = useRef(null);

  // ── Persist recently played ─────────────────────────────────────────────
  useEffect(() => {
    localStorage.setItem('drivemusic_recently_played', JSON.stringify(recentlyPlayed));
  }, [recentlyPlayed]);

  // ── Cleanup audio element on unmount ────────────────────────────────────
  useEffect(() => {
    return () => {
      const audio = audioRef.current;
      audio.pause();
      if (audio._objectUrl) URL.revokeObjectURL(audio._objectUrl);
      audio.src = '';
      clearInterval(fadeIntervalRef.current);
      if (sleepIntervalRef.current) clearInterval(sleepIntervalRef.current);
      Object.values(preloadCacheRef.current).forEach(url => URL.revokeObjectURL(url));
    };
  }, []);

  // ── Revoke preloaded URLs for tracks no longer in queue ─────────────────
  useEffect(() => {
    const queueIds = new Set(queue.map(t => t.id));
    Object.keys(preloadCacheRef.current).forEach(id => {
      if (!queueIds.has(id)) {
        URL.revokeObjectURL(preloadCacheRef.current[id]);
        delete preloadCacheRef.current[id];
      }
    });
  }, [queue]);

  // ── Expose a combined setter that also updates originalQueue ────────────
  const setQueueList = (newList, context) => {
    setQueue(newList);
    setOriginalQueue(newList);
    if (context) setPlaybackContext(context);
  };

  // ── Sleep Timer ─────────────────────────────────────────────────────────
  const startSleepTimer = useCallback((minutes) => {
    if (sleepIntervalRef.current) clearInterval(sleepIntervalRef.current);
    if (minutes === 0) { setSleepTimeLeft(null); return; }
    setSleepTimeLeft(minutes * 60);
    sleepIntervalRef.current = setInterval(() => {
      setSleepTimeLeft(prev => {
        if (prev === null) { clearInterval(sleepIntervalRef.current); return null; }
        if (prev <= 1) {
          clearInterval(sleepIntervalRef.current);
          audioRef.current.pause();
          setIsPlaying(false);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const clearSleepTimer = useCallback(() => {
    if (sleepIntervalRef.current) {
      clearInterval(sleepIntervalRef.current);
      sleepIntervalRef.current = null;
    }
    setSleepTimeLeft(null);
  }, []);

  // ── Audio event listeners ────────────────────────────────────────────────
  useEffect(() => {
    const audio = audioRef.current;
    audio.volume = volumeRef.current;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      setProgress(audio.duration ? audio.currentTime / audio.duration : 0);
      // Fade out 5 s before end
      if (audio.duration && (audio.duration - audio.currentTime) <= 5) {
        const remaining = audio.duration - audio.currentTime;
        audio.volume = Math.max(0, volumeRef.current * (remaining / 5));
      } else if (!fadeIntervalRef.current && !isFadingInRef.current && audio.volume !== volumeRef.current) {
        audio.volume = volumeRef.current;
      }
    };

    const handleLoadedMetadata = () => {
      const d = audio.duration;
      setDuration(d);
      const track = currentTrackRef.current;
      if (d && !isNaN(d) && track?.id) {
        try {
          const cached = JSON.parse(localStorage.getItem('drivemusic_durations') || '{}');
          const dMs = Math.round(d * 1000);
          if (cached[track.id] !== dMs) {
            cached[track.id] = dMs;
            localStorage.setItem('drivemusic_durations', JSON.stringify(cached));
            window.dispatchEvent(new CustomEvent('trackDurationUpdated', {
              detail: { id: track.id, durationMs: dMs },
            }));
          }
        } catch { /* ignore */ }
      }
    };

    const handleEnded = () => {
      if (isRepeatingRef.current) {
        audio.currentTime = 0;
        audio.play().catch(() => { });
      } else if (nextTrackRef.current) {
        nextTrackRef.current();
      } else {
        setIsPlaying(false);
        setProgress(0);
        setCurrentTime(0);
      }
    };

    // FIX 1: ignore errors that fire when src is intentionally empty or being
    // swapped between tracks.
    // - audio.error code 4 = MEDIA_ELEMENT_ERROR (empty / unsupported src)
    //   This fires normally during every track switch — suppress it.
    // - If src equals the page URL it means no src was set at all — ignore.
    const handleError = () => {
      if (!audio.src || audio.src === window.location.href) return;
      if (audio.error?.code === 4) return; // empty src during track switch — expected
      console.error('Audio element error:', audio.error);
      if (activeLoadIdRef.current) setIsPlaying(false);
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
    };
  }, []); // stable refs — runs only once

  // ── Preload next track ──────────────────────────────────────────────────
  const preloadNextTrack = useCallback(async (currentIdx) => {
    const q = queueRef.current;
    if (q.length === 0) return;
    const nextIdx = (currentIdx + 1) % q.length;
    const next = q[nextIdx];
    if (!next || preloadCacheRef.current[next.id]) return;
    // Only preload Drive tracks (need auth header + blob).
    // R2 tracks stream directly — no blob preload needed.
    if (!next.headers?.Authorization) return;
    try {
      const res = await fetch(next.url, { headers: { Authorization: next.headers.Authorization } });
      if (!res.ok) return;
      const blob = await res.blob();
      preloadCacheRef.current[next.id] = URL.createObjectURL(blob);
    } catch { /* ignore preload errors */ }
  }, []);

  useEffect(() => {
    if (currentTrack && queue.length > 0) {
      const idx = queue.findIndex(t => t.id === currentTrack.id);
      if (idx !== -1) preloadNextTrack(idx);
    }
  }, [currentTrack, queue, preloadNextTrack]);

  // ── Core load-and-play ──────────────────────────────────────────────────
  const _loadAndPlay = useCallback(async (track) => {
    activeLoadIdRef.current = track.id;
    setCurrentTrack(track);
    setProgress(0);
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
    audioRef.current.pause();
    clearInterval(fadeIntervalRef.current);
    fadeIntervalRef.current = null;
    isFadingInRef.current = false;

    setRecentlyPlayed(prev => {
      const filtered = prev.filter(t => t.id !== track.id);
      const { coverUrl, ...minimized } = track;
      const toSave = coverUrl && coverUrl.startsWith('data:') ? minimized : track;
      return [toSave, ...filtered].slice(0, 6);
    });

    const cachedUrl = preloadCacheRef.current[track.id];

    if (cachedUrl) {
      // Preloaded blob URL ready to go
      if (audioRef.current._objectUrl) URL.revokeObjectURL(audioRef.current._objectUrl);
      audioRef.current._objectUrl = cachedUrl;
      audioRef.current.src = cachedUrl;
      delete preloadCacheRef.current[track.id];

    } else if (track.headers?.Authorization) {
      // Google Drive tracks: fetch blob first (avoids CORS range-request issues)
      try {
        setIsDownloading(true);
        const response = await fetch(track.url, {
          headers: { Authorization: track.headers.Authorization },
        });
        if (!response.ok) {
          if (response.status === 401) throw new Error('AUTH_EXPIRED');
          throw new Error(`HTTP error: ${response.status}`);
        }
        const blob = await response.blob();
        if (activeLoadIdRef.current !== track.id) return;
        if (audioRef.current._objectUrl) URL.revokeObjectURL(audioRef.current._objectUrl);
        const objectUrl = URL.createObjectURL(blob);
        audioRef.current._objectUrl = objectUrl;
        audioRef.current.src = objectUrl;
      } catch (error) {
        if (activeLoadIdRef.current === track.id) {
          console.error('Error fetching audio:', error);
          setCurrentTrack(null);
        }
        return;
      } finally {
        setIsDownloading(false);
      }

    } else {
      // R2 stream URL — assign directly so the browser can range-request and
      // stream progressively. The worker now returns correct Content-Type,
      // Content-Disposition: inline and X-Content-Type-Options: nosniff so
      // the browser will treat it as audio without downloading the whole file.
      if (audioRef.current._objectUrl) {
        URL.revokeObjectURL(audioRef.current._objectUrl);
        audioRef.current._objectUrl = null;
      }
      audioRef.current.src = track.url;
    }

    if (activeLoadIdRef.current !== track.id) return;

    isFadingInRef.current = true;
    audioRef.current.load();
    audioRef.current.volume = 0; // start silent, then fade in
    audioRef.current.play()
      .then(() => {
        if (activeLoadIdRef.current !== track.id) return;
        setIsPlaying(true);
        const q = queueRef.current;
        const idx = q.findIndex(t => t.id === track.id);
        if (idx !== -1) preloadNextTrack(idx);

        // 5 s fade in
        clearInterval(fadeIntervalRef.current);
        let elapsed = 0;
        fadeIntervalRef.current = setInterval(() => {
          elapsed += 100;
          if (elapsed >= 5000) {
            audioRef.current.volume = volumeRef.current;
            isFadingInRef.current = false;
            clearInterval(fadeIntervalRef.current);
            fadeIntervalRef.current = null;
          } else {
            audioRef.current.volume = volumeRef.current * (elapsed / 5000);
          }
        }, 100);
      })
      .catch(e => {
        isFadingInRef.current = false;
        if (e.name === 'AbortError') return;
        if (activeLoadIdRef.current === track.id) console.error('Playback failed:', e);
      });
  }, [preloadNextTrack]);

  // ── Public play ─────────────────────────────────────────────────────────
  // FIX 3: removed `audio.src = 'about:blank'` unlock hack — it was the root
  // cause of MEDIA_ELEMENT_ERROR / DEMUXER_ERROR_COULD_NOT_OPEN spam.
  // R2 stream URLs are assigned directly, so no unlock trick is needed.
  const playTrack = useCallback(async (track, context) => {
    if (currentTrackRef.current?.id === track.id) { togglePlay(); return; }
    if (context) setPlaybackContext(context);
    await _loadAndPlay(track);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [_loadAndPlay]);

  // ── Next / Prev (shuffle-aware) ─────────────────────────────────────────
  const nextTrack = useCallback(async () => {
    const q = queueRef.current;
    const current = currentTrackRef.current;
    if (!q.length || !current) return;
    const currentIdx = q.findIndex(t => t.id === current.id);
    const nextIdx = (currentIdx + 1) % q.length;
    await _loadAndPlay(q[nextIdx]);
  }, [_loadAndPlay]);


  const prevTrack = useCallback(async () => {
    const q = queueRef.current;
    const current = currentTrackRef.current;
    if (!q.length || !current) return;
    if (audioRef.current.currentTime > 3) {
      audioRef.current.currentTime = 0;
      setProgress(0);
      setCurrentTime(0);
      return;
    }
    const currentIdx = q.findIndex(t => t.id === current.id);
    const prevIdx = (currentIdx - 1 + q.length) % q.length;
    await _loadAndPlay(q[prevIdx]);
  }, [_loadAndPlay]);

  const togglePlay = useCallback(() => {
    if (!currentTrackRef.current) return;
    if (audioRef.current.paused) {
      audioRef.current.play().catch(e => { if (e.name !== 'AbortError') console.error(e); });
      setIsPlaying(true);
    } else {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  }, []);

  useEffect(() => { 
    nextTrackRef.current = nextTrack; 
    prevTrackRef.current = prevTrack;
    togglePlayRef.current = togglePlay;
  }, [nextTrack, prevTrack, togglePlay]);

  const toggleShuffle = useCallback(() => {
    setIsShuffled(prev => {
      const next = !prev;
      if (next) {
        const q = queueRef.current;
        const current = currentTrackRef.current;
        if (q.length > 1) {
          const userItems = q.filter(t => t.isUserAdded);
          const regular = q.filter(t => !t.isUserAdded);
          
          const copy = [...regular];
          let activeTrack = null;
          const activeIdxInRegular = current ? copy.findIndex(t => t.id === current.id) : -1;
          
          if (activeIdxInRegular !== -1) activeTrack = copy.splice(activeIdxInRegular, 1)[0];
          
          for (let i = copy.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [copy[i], copy[j]] = [copy[j], copy[i]];
          }
          
          const shuffledRegular = activeTrack ? [activeTrack, ...copy] : copy;
          shuffledRegular.splice(activeTrack ? 1 : 0, 0, ...userItems);
          
          setQueue(shuffledRegular);
        }
      } else {
        setQueue(originalQueueRef.current);
      }
      return next;
    });
  }, []);

  const addToQueue = useCallback((track) => {
    if (track.id === currentTrackRef.current?.id) return;
    
    const trackWithFlag = { ...track, isUserAdded: true };

    const insertIntoQueue = (prev) => {
      const filtered = prev.filter(t => t.id !== track.id);
      const currentIdx = filtered.findIndex(t => t.id === currentTrackRef.current?.id);
      
      if (currentIdx !== -1) {
        let insertIdx = currentIdx + 1;
        while (insertIdx < filtered.length && filtered[insertIdx].isUserAdded) {
          insertIdx++;
        }
        const next = [...filtered];
        next.splice(insertIdx, 0, trackWithFlag);
        return next;
      }
      return [...filtered, trackWithFlag];
    };

    setQueue(insertIntoQueue);
    setOriginalQueue(insertIntoQueue);
  }, []);

  const toggleRepeat = useCallback(() => setIsRepeating(prev => !prev), []);

  const updateVolume = useCallback((newVolume) => {
    const v = Math.max(0, Math.min(1, newVolume));
    setVolume(v);
    volumeRef.current = v;
    audioRef.current.volume = v;
    localStorage.setItem('drivemusic_volume', String(v));
  }, []);

  const toggleMute = useCallback(() => {
    if (volumeRef.current > 0) {
      setPrevVolume(volumeRef.current);
      updateVolume(0);
    } else {
      updateVolume(prevVolume || 1.0);
    }
  }, [prevVolume, updateVolume]);

  const seek = useCallback((newProgress) => {
    const dur = audioRef.current.duration;
    // Guard: duration must be a positive finite number, progress must be finite
    if (!dur || !isFinite(dur) || !isFinite(newProgress)) return;
    const time = Math.max(0, Math.min(dur, newProgress * dur));
    audioRef.current.currentTime = time;
    setProgress(newProgress);
    setCurrentTime(time);
  }, []);

  // ── MediaSession API (Background Playback & Lock Screen Controls) ────────
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;

    if (currentTrack) {
      const coverUrl = currentTrack.coverUrl && !currentTrack.coverUrl.includes('images.unsplash') 
          ? currentTrack.coverUrl 
          : '/logo.png';

      navigator.mediaSession.metadata = new window.MediaMetadata({
        title: currentTrack.title || 'Unknown Title',
        artist: currentTrack.artist || 'Unknown Artist',
        album: currentTrack.album || '',
        artwork: [{ src: coverUrl, sizes: '512x512', type: 'image/png' }]
      });
    }

    navigator.mediaSession.setActionHandler('play', () => { togglePlayRef.current?.(); });
    navigator.mediaSession.setActionHandler('pause', () => { togglePlayRef.current?.(); });
    navigator.mediaSession.setActionHandler('previoustrack', () => { prevTrackRef.current?.(); });
    navigator.mediaSession.setActionHandler('nexttrack', () => { nextTrackRef.current?.(); });

    // Update playback state
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';

  }, [currentTrack, isPlaying]);

  // ── Dominant Color Extraction ──
  useEffect(() => {
    const getCoverSrc = (track) => track?.coverUrl && !track.coverUrl.includes('images.unsplash.com') ? track.coverUrl : logo;
    const imgSrc = getCoverSrc(currentTrack);

    if (!imgSrc || imgSrc === logo) {
      setDominantColor('20,20,30');
      return;
    }
    if (dominantColorCache.current[imgSrc]) {
      setDominantColor(dominantColorCache.current[imgSrc]);
      return;
    }

    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 40; canvas.height = 40;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, 40, 40);
        const d = ctx.getImageData(0, 0, 40, 40).data;
        let r = 0, g = 0, b = 0, n = 0;
        for (let i = 0; i < d.length; i += 4) {
          const brightness = (d[i] + d[i + 1] + d[i + 2]) / 3;
          if (brightness > 20 && brightness < 230) {
            r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
          }
        }
        if (n === 0) {
          setDominantColor('20,20,30');
          return;
        }
        const avg = `${Math.round(r / n)},${Math.round(g / n)},${Math.round(b / n)}`;
        dominantColorCache.current[imgSrc] = avg;
        setDominantColor(avg);
      } catch {
        setDominantColor('20,20,30');
      }
    };
    img.onerror = () => setDominantColor('20,20,30');
    img.src = imgSrc;
  }, [currentTrack]);

  const isLight = useMemo(() => {
    if (!dominantColor) return false;
    const [r, g, b] = dominantColor.split(',').map(Number);
    // HSP color model brightness formula for better perceptual accuracy
    const hsp = Math.sqrt(0.299 * (r * r) + 0.587 * (g * g) + 0.114 * (b * b));
    return hsp > 165; // Threshold where we should switch to dark text
  }, [dominantColor]);

  return (
    <AudioPlayerContext.Provider value={{
      isPlaying, isDownloading, currentTrack, volume, progress, currentTime, duration,
      isShuffled, isRepeating, queue, recentlyPlayed,
      sleepTimeLeft, playbackContext, dominantColor, isLight, startSleepTimer, clearSleepTimer,
      playTrack, nextTrack, prevTrack, togglePlay, toggleShuffle, toggleRepeat,
      updateVolume, toggleMute, seek, setQueue: setQueueList, addToQueue,
      setProgress, setCurrentTime
    }}>
      {children}
    </AudioPlayerContext.Provider>
  );
};