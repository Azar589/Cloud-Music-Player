import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';

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
  const [prevVolume, setPrevVolume] = useState(1.0); // Remember volume before mute
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isShuffled, setIsShuffled] = useState(false);
  const [isRepeating, setIsRepeating] = useState(false);

  // Queue: the master list of tracks
  const [queue, setQueue] = useState([]);
  const [originalQueue, setOriginalQueue] = useState([]);

  const setQueueList = (newList) => {
    setQueue(newList);
    setOriginalQueue(newList);
  };
  const [recentlyPlayed, setRecentlyPlayed] = useState(() => {
    try {
      const saved = localStorage.getItem('drivemusic_recently_played');
      return saved ? JSON.parse(saved) : [];
    } catch (e) { return []; }
  });

  useEffect(() => {
    localStorage.setItem('drivemusic_recently_played', JSON.stringify(recentlyPlayed));
  }, [recentlyPlayed]);
  const [isDownloading, setIsDownloading] = useState(false);

  const activeLoadIdRef = useRef(null);
  const nextTrackRef = useRef(null);
  const fadeIntervalRef = useRef(null);
  const preloadCacheRef = useRef({}); // { [trackId]: ObjectUrl }

  // Sleep Timer States
  const [sleepTimeLeft, setSleepTimeLeft] = useState(null); // in seconds
  const sleepIntervalRef = useRef(null);

  const startSleepTimer = useCallback((minutes) => {
    if (sleepIntervalRef.current) clearInterval(sleepIntervalRef.current);
    if (minutes === 0) {
      setSleepTimeLeft(null);
      return;
    }
    setSleepTimeLeft(minutes * 60);
    
    sleepIntervalRef.current = setInterval(() => {
      setSleepTimeLeft(prev => {
        if (prev === null) {
          clearInterval(sleepIntervalRef.current);
          return null;
        }
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

  // Cleanup sleep interval on unmount
  useEffect(() => {
    return () => {
      if (sleepIntervalRef.current) clearInterval(sleepIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    audio.volume = volume;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      setProgress(audio.duration ? audio.currentTime / audio.duration : 0);

      // --- 2s Fade Out at end of song ---
      if (audio.duration && (audio.duration - audio.currentTime) <= 2) {
        const remaining = audio.duration - audio.currentTime;
        audio.volume = Math.max(0, volume * (remaining / 2));
      } else if (!fadeIntervalRef.current && audio.volume !== volume) {
        audio.volume = volume;
      }
    };
    const handleLoadedMetadata = () => {
      const d = audio.duration;
      setDuration(d);
      if (d && !isNaN(d) && currentTrack?.id) {
        try {
          const cached = JSON.parse(localStorage.getItem('drivemusic_durations') || '{}');
          const dMs = Math.round(d * 1000);
          if (cached[currentTrack.id] !== dMs) {
            cached[currentTrack.id] = dMs;
            localStorage.setItem('drivemusic_durations', JSON.stringify(cached));
            window.dispatchEvent(new CustomEvent('trackDurationUpdated', { detail: { id: currentTrack.id, durationMs: dMs } }));
          }
        } catch (e) { }
      }
    };
    const handleEnded = () => {
      if (isRepeating) {
        audio.currentTime = 0;
        audio.play().catch(() => {});
      } else if (nextTrackRef.current) {
        nextTrackRef.current(); // Auto-advance!
      } else {
        setIsPlaying(false);
        setProgress(0);
        setCurrentTime(0);
      }
    };
    const handleError = () => {
      console.error('Audio element error:', audio.error);
      setIsPlaying(false);
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
  }, [isRepeating, currentTrack, volume]); // including currentTrack fixes duration cache scoping

  const preloadNextTrack = useCallback(async (currentIdx) => {
    if (queue.length === 0) return;
    let nextIdx = (currentIdx + 1) % queue.length;
    let nextTrack = queue[nextIdx];

    if (isShuffled && queue.length > 1) {
      do { nextIdx = Math.floor(Math.random() * queue.length); }
      while (nextIdx === currentIdx);
      nextTrack = queue[nextIdx];
    }

    if (!nextTrack || preloadCacheRef.current[nextTrack.id]) return;

    if (nextTrack.headers?.Authorization) {
      try {
        const res = await fetch(nextTrack.url, { headers: { Authorization: nextTrack.headers.Authorization } });
        if (!res.ok) return;
        const blob = await res.blob();
        preloadCacheRef.current[nextTrack.id] = URL.createObjectURL(blob);
      } catch (e) { /* ignore preload errors */ }
    }
  }, [queue, isShuffled]);

  // Continuous Preload Listener
  useEffect(() => {
    if (currentTrack && queue.length > 0) {
      const currentIdx = queue.findIndex(t => t.id === currentTrack.id);
      if (currentIdx !== -1) preloadNextTrack(currentIdx);
    }
  }, [currentTrack, queue, isShuffled, preloadNextTrack]);

  const _loadAndPlay = async (track) => {
    activeLoadIdRef.current = track.id;
    setCurrentTrack(track);
    setProgress(0);
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
    audioRef.current.pause();
    clearInterval(fadeIntervalRef.current);
    fadeIntervalRef.current = null;

    setRecentlyPlayed(prev => {
      const filtered = prev.filter(t => t.id !== track.id);
      const { coverUrl, ...minimized } = track;
      const toSave = coverUrl && coverUrl.startsWith('data:') ? minimized : track;
      return [toSave, ...filtered].slice(0, 6);
    });

    const cachedUrl = preloadCacheRef.current[track.id];

    if (cachedUrl) {
      if (audioRef.current._objectUrl) URL.revokeObjectURL(audioRef.current._objectUrl);
      audioRef.current._objectUrl = cachedUrl;
      audioRef.current.src = cachedUrl;
      delete preloadCacheRef.current[track.id];
    } else if (track.headers?.Authorization) {
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
        setIsDownloading(false);

        if (activeLoadIdRef.current !== track.id) {
          return;
        }

        if (audioRef.current._objectUrl) URL.revokeObjectURL(audioRef.current._objectUrl);
        const objectUrl = URL.createObjectURL(blob);
        audioRef.current._objectUrl = objectUrl;
        audioRef.current.src = objectUrl;
      } catch (error) {
        setIsDownloading(false);
        if (activeLoadIdRef.current === track.id) {
          console.error('Error fetching Drive audio:', error);
          setCurrentTrack(null);
        }
        return;
      }
    } else {
      audioRef.current.src = track.url;
    }

    if (activeLoadIdRef.current !== track.id) return;

    audioRef.current.load();
    audioRef.current.volume = 0; // Start at 0 for fade in
    audioRef.current.play()
      .then(() => {
        if (activeLoadIdRef.current === track.id) {
          setIsPlaying(true);
          const currentIdx = queue.findIndex(t => t.id === track.id);
          if (currentIdx !== -1) preloadNextTrack(currentIdx);

          // --- 2s Fade In ---
          clearInterval(fadeIntervalRef.current);
          let elapsed = 0;
          fadeIntervalRef.current = setInterval(() => {
            elapsed += 100;
            if (elapsed >= 2000) {
              audioRef.current.volume = volume;
              clearInterval(fadeIntervalRef.current);
              fadeIntervalRef.current = null;
            } else {
              audioRef.current.volume = volume * (elapsed / 2000);
            }
          }, 100);
        }
      })
      .catch(e => {
        if (e.name === 'AbortError') return; // Ignore play/pause interruptions
        if (activeLoadIdRef.current === track.id) console.error('Playback failed:', e);
      });
  };

  const playTrack = async (track) => {
    if (currentTrack?.id === track.id) { togglePlay(); return; }
    
    // ── Unlock Audio for Mobile Browsers ──
    // Triggering synchronous play prevents async fetch hops from breaking user interaction flags.
    try {
      audioRef.current.src = 'about:blank'; 
      audioRef.current.play().catch(() => {});
    } catch (e) {}

    await _loadAndPlay(track);
  };

  const nextTrack = useCallback(async () => {
    if (!queue.length || !currentTrack) return;
    const currentIdx = queue.findIndex(t => t.id === currentTrack.id);
    let nextIdx;
    nextIdx = (currentIdx + 1) % queue.length;
    await _loadAndPlay(queue[nextIdx]);
  }, [queue, currentTrack, isShuffled]);

  useEffect(() => {
    nextTrackRef.current = nextTrack;
  }, [nextTrack]);

  const prevTrack = useCallback(async () => {
    if (!queue.length || !currentTrack) return;
    // If more than 3s in, restart current track instead of going back
    if (audioRef.current.currentTime > 3) {
      audioRef.current.currentTime = 0;
      setProgress(0);
      setCurrentTime(0);
      return;
    }
    const currentIdx = queue.findIndex(t => t.id === currentTrack.id);
    const prevIdx = (currentIdx - 1 + queue.length) % queue.length;
    await _loadAndPlay(queue[prevIdx]);
  }, [queue, currentTrack]);

  const togglePlay = () => {
    if (!currentTrack) return;
    if (isPlaying) { audioRef.current.pause(); } else { audioRef.current.play(); }
    setIsPlaying(prev => !prev);
  };

  const toggleShuffle = () => {
    setIsShuffled(prev => {
      const next = !prev;
      if (next) {
        if (queue.length > 1) {
          const currentIdx = currentTrack ? queue.findIndex(t => t.id === currentTrack.id) : -1;
          const copy = [...queue];
          let activeTrack = null;
          if (currentIdx !== -1) {
            activeTrack = copy.splice(currentIdx, 1)[0];
          }
          for (let i = copy.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [copy[i], copy[j]] = [copy[j], copy[i]];
          }
          const shuffled = activeTrack ? [activeTrack, ...copy] : copy;
          setQueue(shuffled);
        }
      } else {
        setQueue(originalQueue);
      }
      return next;
    });
  };
  const addToQueue = (track) => {
    setQueue(prev => prev.some(t => t.id === track.id) ? prev : [...prev, track]);
    setOriginalQueue(prev => prev.some(t => t.id === track.id) ? prev : [...prev, track]);
  };

  const toggleRepeat  = () => setIsRepeating(prev => !prev);

  const updateVolume = (newVolume) => {
    const v = Math.max(0, Math.min(1, newVolume));
    setVolume(v);
    audioRef.current.volume = v;
    localStorage.setItem('drivemusic_volume', v);
  };

  const toggleMute = () => {
    if (volume > 0) {
      setPrevVolume(volume);
      updateVolume(0);
    } else {
      updateVolume(prevVolume || 1.0);
    }
  };

  const seek = (newProgress) => {
    if (!audioRef.current.duration) return;
    const time = newProgress * duration;
    audioRef.current.currentTime = time;
    setProgress(newProgress);
    setCurrentTime(time);
  };

  return (
    <AudioPlayerContext.Provider value={{
      isPlaying, isDownloading, currentTrack, volume, progress, currentTime, duration,
      isShuffled, isRepeating, queue, recentlyPlayed,
      sleepTimeLeft, startSleepTimer, clearSleepTimer,
      playTrack, nextTrack, prevTrack, togglePlay, toggleShuffle, toggleRepeat,
      updateVolume, toggleMute, seek, setQueue: setQueueList, addToQueue,
    }}>
      {children}
    </AudioPlayerContext.Provider>
  );
};
