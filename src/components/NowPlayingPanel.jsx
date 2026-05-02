import React, { useState, useEffect, useRef } from 'react';
import { useAudioPlayer } from '../context/AudioPlayerContext';
import { useApp } from '../context/AppContext';
import {
  FaPlay, FaPause, FaStepBackward, FaStepForward,
  FaRandom, FaRedoAlt, FaVolumeUp, FaVolumeMute, FaListUl,
  FaChevronDown, FaBars, FaMoon, FaEllipsisV
} from 'react-icons/fa';
import logo from '../assets/logo.png';
import './NowPlayingPanel.css';

const formatTime = (s) => {
  if (!s || isNaN(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
};

const formatBytes = (bytes) => {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const NowPlayingPanel = ({ onClose }) => {
  const {
    isPlaying, isDownloading, currentTrack, volume, progress, currentTime, duration,
    isShuffled, isRepeating, queue, recentlyPlayed,
    sleepTimeLeft, playbackContext, startSleepTimer, clearSleepTimer,
    playTrack, nextTrack, prevTrack, togglePlay, toggleShuffle, toggleRepeat,
    updateVolume, toggleMute, seek, setQueue, addToQueue, dominantColor
  } = useAudioPlayer();

  const { viewMode, setViewMode } = useApp();

  const [showQueue, setShowQueue] = useState(false);
  const [showSleep, setShowSleep] = useState(false);
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const [draggedIdx, setDraggedIdx] = useState(null);
  const [isFlipped, setIsFlipped] = useState(false);
  const [sizeFromHead, setSizeFromHead] = useState(null);
  // Local visual progress during seekbar drag (null = use context value)
  const [dragProgress, setDragProgress] = useState(null);

  // ── Swipe-to-dismiss — use refs so handlers never have stale closures ──
  const [isClosing, setIsClosing] = useState(false);
  const touchStartRef = useRef(0);     // finger Y on touch start
  const translateYRef = useRef(0);     // live drag offset (mirrors translateY state)
  const overlayRef = useRef(null);     // direct DOM manipulation for smooth 60fps

  // ── Card-Peek Pager Refs ──
  const pagerViewportRef = useRef(null);
  const pagerRailRef = useRef(null);
  const pagerCardRefs = [useRef(null), useRef(null), useRef(null)]; // prev, current, next
  const artTouchStartX = useRef(0);
  const artTouchStartY = useRef(0);
  const artTouchStartTime = useRef(0);
  const artDragDirection = useRef(null);
  const pagerDragDelta = useRef(0);
  const skipLock = useRef(false);    // debounce lock for skip buttons
  const pagerBaseX = useRef(0);
  const pagerAnimating = useRef(false);
  const rafRef = useRef(null);
  // Background crossfade
  const bgNextRef = useRef(null);
  const bgNextSrc = useRef('');
  const carouselRef = pagerRailRef;

  const currentIdx = currentTrack ? queue.findIndex(t => t.id === currentTrack.id) : -1;
  const nextUpTracks = currentIdx !== -1 ? queue.slice(currentIdx + 1) : queue;
  const userAddedTracks = nextUpTracks.filter(t => t.isUserAdded);
  const regularNextUp = nextUpTracks.filter(t => !t.isUserAdded);

  const handleDragStart = (e, idx) => {
    setDraggedIdx(idx);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e) => e.preventDefault();

  const handleDrop = (e, targetIdx) => {
    e.preventDefault();
    if (draggedIdx === null || draggedIdx === targetIdx) return;
    const newItems = [...nextUpTracks];
    const draggedItem = newItems[draggedIdx];
    newItems.splice(draggedIdx, 1);
    newItems.splice(targetIdx, 0, draggedItem);

    const pastTracks = currentIdx !== -1 ? queue.slice(0, currentIdx) : [];
    const fullQueue = currentTrack ? [...pastTracks, currentTrack, ...newItems] : newItems;
    setQueue(fullQueue);
    setDraggedIdx(null);
  };

  // Close popups on click outside
  React.useEffect(() => {
    if (!showQueue && !showSleep && !showMoreOptions) return;
    const hidePopups = () => {
      setShowQueue(false);
      setShowSleep(false);
      setShowMoreOptions(false);
    };
    document.addEventListener('click', hidePopups);
    return () => document.removeEventListener('click', hidePopups);
  }, [showQueue, showSleep, showMoreOptions]);

  // ── Seekbar drag — visual update via local state, seek() commits on release ──
  const handleSeekDrag = (e) => {
    const getClientX = (evt) => {
      // touches is empty on touchend — use changedTouches instead
      if (evt.changedTouches && evt.changedTouches.length > 0) return evt.changedTouches[0].clientX;
      if (evt.touches && evt.touches.length > 0) return evt.touches[0].clientX;
      return evt.clientX;
    };
    const bar = e.currentTarget;
    const r = bar.getBoundingClientRect();
    const computeVal = (clientX) => {
      const v = (clientX - r.left) / r.width;
      return isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
    };

    // Track last valid position so touchend (which has empty touches) can still seek
    let lastVal = computeVal(getClientX(e));
    setDragProgress(lastVal);

    const onMove = (mE) => {
      if (mE.cancelable) mE.preventDefault();
      lastVal = computeVal(getClientX(mE));
      setDragProgress(lastVal);
    };
    const onEnd = () => {
      // Use lastVal — safe even on touchend where touches[] is empty
      seek(lastVal);
      setDragProgress(null);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onEnd);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onEnd);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
  };

  const handleVolumeDrag = (e) => {
    const getClientX = (evt) => evt.touches && evt.touches.length > 0 ? evt.touches[0].clientX : evt.clientX;
    const bar = e.currentTarget;
    const r = bar.getBoundingClientRect();
    const computeVal = (clientX) => Math.max(0, Math.min(1, (clientX - r.left) / r.width));

    updateVolume(computeVal(getClientX(e)));

    const onMove = (mE) => {
      if (mE.cancelable) mE.preventDefault();
      updateVolume(computeVal(getClientX(mE)));
    };
    const onEnd = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onEnd);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onEnd);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
  };

  // ── Swipe to Dismiss Logic ───────────────────────────────────────────────
  const onTouchStart = (e) => {
    touchStartRef.current = e.targetTouches[0].clientY;
    translateYRef.current = 0;
    if (overlayRef.current) overlayRef.current.style.transition = 'none';
  };

  const onTouchMove = (e) => {
    // Prevent vertical panel drag if the user is currently dragging the album art horizontally
    if (artDragDirection.current === 'h') return;

    const diff = e.targetTouches[0].clientY - touchStartRef.current;
    if (diff > 0) {
      translateYRef.current = diff;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        const isPopupOpen = showQueue || showSleep || showMoreOptions;
        if (isPopupOpen) {
          // If a popup is open, we drag the popup itself instead of the whole panel
          const popup = document.querySelector('.queue-popup, .sleep-popup, .more-popup');
          if (popup) popup.style.transform = `translateY(${diff}px)`;
        } else {
          if (overlayRef.current) overlayRef.current.style.transform = `translateY(${diff}px)`;
        }
      });
    }
  };

  const onTouchEnd = () => {
    const dist = translateYRef.current;
    const isPopupOpen = showQueue || showSleep || showMoreOptions;

    if (isPopupOpen) {
      const popup = document.querySelector('.queue-popup, .sleep-popup, .more-popup');
      if (dist > 70) {
        // Dismiss the popup
        setShowQueue(false);
        setShowSleep(false);
        setShowMoreOptions(false);
        // We don't need to animate it back since the state change will unmount/hide it
      } else if (popup) {
        // Snap the popup back to its original position
        popup.style.transition = 'transform 0.4s cubic-bezier(0.19, 1, 0.22, 1)';
        popup.style.transform = 'translateY(0px)';
      }
      translateYRef.current = 0;
      return;
    }

    if (dist > 100) {
      setIsClosing(true);
      setTimeout(onClose, 400);
    } else {
      translateYRef.current = 0;
      if (overlayRef.current) {
        overlayRef.current.style.transition = 'transform 0.5s cubic-bezier(0.19, 1, 0.22, 1)';
        overlayRef.current.style.transform = `translateY(0px)`;
      }
    }
  };

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(onClose, 400);
  };

  useEffect(() => {
    let isMounted = true;
    if (isFlipped && currentTrack?.url && !currentTrack.size && !sizeFromHead) {
      fetch(currentTrack.url, { method: 'HEAD' })
        .then(res => {
          const s = res.headers.get('Content-Length');
          if (s && isMounted) setSizeFromHead(Number(s));
        })
        .catch(() => { });
    }
    return () => { isMounted = false; };
  }, [isFlipped, currentTrack, sizeFromHead]);

  const sizeBytes = currentTrack?.size ? Number(currentTrack.size) : (sizeFromHead || 0);
  const durationSec = duration > 0 ? duration : (currentTrack?.durationMs ? currentTrack.durationMs / 1000 : 0);
  const bitrate = (sizeBytes && durationSec) ? Math.round((sizeBytes * 8) / (durationSec * 1024)) : 0;

  const getCoverSrc = (track) => track?.coverUrl && !track.coverUrl.includes('images.unsplash.com') ? track.coverUrl : logo;
  const coverSrc = getCoverSrc(currentTrack);

  const prevTrackData = currentIdx > 0 ? queue[currentIdx - 1] : (isRepeating && queue.length ? queue[queue.length - 1] : null);
  const nextTrackData = currentIdx < queue.length - 1 ? queue[currentIdx + 1] : (isRepeating && queue.length ? queue[0] : null);

  // ── Pager constants (80% card, 10% peek each side, 16dp gap) ──
  const CARD_FRACTION = 0.85;
  const CARD_GAP = 16;

  // ── Per-card scale/opacity interpolation ──
  const updateCardStyles = (railX) => {
    if (!pagerViewportRef.current) return;
    const vw = pagerViewportRef.current.offsetWidth;
    const cardW = vw * CARD_FRACTION;
    const screenCenter = vw / 2;

    pagerCardRefs.forEach((ref, i) => {
      if (!ref.current) return;
      // Center of card[i] in viewport coordinates when rail is at railX
      const cardCenter = railX + i * (cardW + CARD_GAP) + cardW / 2;
      const dist = cardCenter - screenCenter;
      const absDist = Math.abs(dist);
      const t = Math.min(absDist / cardW, 1);

      const scale = 1.0; // User requested all cards be the same size
      const opacity = 1.0 - t * 0.5;  // 1.0 → 0.50 fade for side cards

      // No shift needed since scale is 1.0
      ref.current.style.transform = `translateX(0px) scale(${scale})`;
      ref.current.style.opacity = opacity.toString();
    });
  };

  // ── JS Spring snap ──
  // Critically damped to avoid bounce-back: DAMPING ≈ 2 * sqrt(STIFFNESS)
  const springSnap = (fromX, toX, onUpdate, onComplete) => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const STIFFNESS = 400;
    const DAMPING = 40;
    let pos = fromX;
    let vel = 0;
    let lastT = null;

    const step = (t) => {
      if (!lastT) lastT = t;
      const dt = Math.min((t - lastT) / 1000, 0.020);
      lastT = t;
      const acc = -STIFFNESS * (pos - toX) - DAMPING * vel;
      vel += acc * dt;
      pos += vel * dt;
      onUpdate(pos);
      if (Math.abs(pos - toX) < 0.5 && Math.abs(vel) < 5) {
        onUpdate(toX);
        onComplete?.();
      } else {
        rafRef.current = requestAnimationFrame(step);
      }
    };
    rafRef.current = requestAnimationFrame(step);
  };

  // ── Pager geometry: mount-only + ResizeObserver ──
  React.useEffect(() => {
    const calcBase = () => {
      if (!pagerViewportRef.current || !pagerRailRef.current) return;
      if (pagerAnimating.current) return;

      // Desktop guard: skip carousel logic if screen is wide
      if (window.innerWidth > 768) {
        pagerRailRef.current.style.transform = 'none';
        pagerCardRefs.forEach((ref) => {
          if (ref.current) {
            ref.current.style.transform = 'none';
            ref.current.style.opacity = '1';
          }
        });
        return;
      }

      const vw = pagerViewportRef.current.offsetWidth;
      const cardW = vw * CARD_FRACTION;
      const peek = vw * (1 - CARD_FRACTION) / 2;
      const base = peek - (cardW + CARD_GAP);
      pagerBaseX.current = base;
      pagerRailRef.current.style.transition = 'none';
      pagerRailRef.current.style.transform = `translateX(${base}px)`;
      updateCardStyles(base);
    };

    // Use a small timeout to let the CSS layout stabilize before JS takes over
    // but without blocking the main entry animation.
    const timer = setTimeout(() => {
      calcBase();
      const ro = new ResizeObserver(calcBase);
      if (pagerViewportRef.current) ro.observe(pagerViewportRef.current);
      return () => {
        ro.disconnect();
      };
    }, 100);

    return () => clearTimeout(timer);
  }, []); // eslint-disable-line

  const handleArtTouchStart = (e) => {
    if (pagerAnimating.current) return;
    artTouchStartX.current = e.targetTouches[0].clientX;
    artTouchStartY.current = e.targetTouches[0].clientY;
    artTouchStartTime.current = performance.now();
    artDragDirection.current = null;
    pagerDragDelta.current = 0;
    if (pagerRailRef.current) pagerRailRef.current.style.transition = 'none';
  };

  const handleArtTouchMove = (e) => {
    if (pagerAnimating.current) return;
    const cx = e.targetTouches[0].clientX;
    const cy = e.targetTouches[0].clientY;

    if (!artDragDirection.current) {
      const dx = Math.abs(cx - artTouchStartX.current);
      const dy = Math.abs(cy - artTouchStartY.current);
      if (dx > 6 || dy > 6) {
        artDragDirection.current = dx > dy ? 'h' : 'v';
        if (artDragDirection.current === 'v') return;
      } else return;
    }
    if (artDragDirection.current !== 'h') return;
    e.stopPropagation();

    const delta = cx - artTouchStartX.current;
    pagerDragDelta.current = delta;
    const railX = pagerBaseX.current + delta;

    // ── 1:1 finger tracking ──
    if (pagerRailRef.current) pagerRailRef.current.style.transform = `translateX(${railX}px)`;
    updateCardStyles(railX);

    // ── Background crossfade ──
    const incomingTrack = delta < 0 ? nextTrackData : prevTrackData;
    const incomingSrc = incomingTrack ? getCoverSrc(incomingTrack) : '';
    if (incomingSrc && bgNextRef.current) {
      if (bgNextSrc.current !== incomingSrc) {
        bgNextRef.current.style.backgroundImage = `url(${incomingSrc})`;
        bgNextSrc.current = incomingSrc;
      }
      const vw = pagerViewportRef.current?.offsetWidth || window.innerWidth;
      const progress = Math.min(Math.abs(delta) / (vw * CARD_FRACTION * 0.6), 1);
      bgNextRef.current.style.opacity = progress.toString();
    } else if (bgNextRef.current) {
      bgNextRef.current.style.opacity = '0';
    }
  };

  const handleArtTouchEnd = () => {
    if (artDragDirection.current !== 'h') return;

    const delta = pagerDragDelta.current;
    const elapsed = performance.now() - artTouchStartTime.current;
    const velocity = Math.abs(delta) / elapsed; // px per ms

    const vw = pagerViewportRef.current?.offsetWidth || window.innerWidth;
    const cardW = vw * CARD_FRACTION;

    // Distance threshold OR Velocity threshold (> 0.8 px/ms is a fast flick)
    const passedThreshold = Math.abs(delta) > cardW * 0.22;
    const passedVelocity = velocity > 0.8;
    const shouldPage = passedThreshold || passedVelocity;

    const currentRailX = pagerBaseX.current + delta;

    const commitPage = (trackFn, direction) => {
      pagerAnimating.current = true;
      const snapTarget = pagerBaseX.current + direction * (cardW + CARD_GAP);

      if (bgNextRef.current) {
        bgNextRef.current.style.transition = 'opacity 0.32s ease';
        bgNextRef.current.style.opacity = '1';
      }

      springSnap(currentRailX, snapTarget,
        (x) => {
          if (pagerRailRef.current) pagerRailRef.current.style.transform = `translateX(${x}px)`;
          updateCardStyles(x);
        },
        () => {
          if (pagerRailRef.current) {
            pagerRailRef.current.style.transform = `translateX(${pagerBaseX.current}px)`;
          }
          updateCardStyles(pagerBaseX.current);

          if (bgNextRef.current) {
            bgNextRef.current.style.transition = 'none';
            bgNextRef.current.style.opacity = '0';
            bgNextSrc.current = '';
          }

          trackFn();
          pagerAnimating.current = false;
        }
      );
    };

    if (shouldPage && delta < 0 && nextTrackData) {
      commitPage(nextTrack, -1);
    } else if (shouldPage && delta > 0 && prevTrackData) {
      commitPage(prevTrack, +1);
    } else {
      springSnap(currentRailX, pagerBaseX.current,
        (x) => {
          if (pagerRailRef.current) pagerRailRef.current.style.transform = `translateX(${x}px)`;
          updateCardStyles(x);
        },
        () => {
          if (bgNextRef.current) {
            bgNextRef.current.style.transition = 'opacity 0.3s ease';
            bgNextRef.current.style.opacity = '0';
          }
        }
      );
    }
    artDragDirection.current = null;
    pagerDragDelta.current = 0;
  };

  // ── Debounced Skip Actions ──
  const handleNextTrack = () => {
    if (skipLock.current) return;
    skipLock.current = true;
    nextTrack();
    setTimeout(() => { skipLock.current = false; }, 300);
  };

  const handlePrevTrack = () => {
    if (skipLock.current) return;
    skipLock.current = true;
    prevTrack();
    setTimeout(() => { skipLock.current = false; }, 300);
  };

  return (
    <div
      className={`np-overlay ${isClosing ? 'closing' : ''}`}
      ref={overlayRef}
      style={isClosing ? {} : {
        transform: 'translate3d(0, 0, 0)',
        opacity: 1,
      }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Blurred background art — current track */}
      <div
        className="np-bg"
        style={{ backgroundImage: `url(${coverSrc})` }}
      />
      {/* Blurred background art — incoming track (crossfade overlay) */}
      <div
        className="np-bg np-bg-next"
        ref={bgNextRef}
        style={{ opacity: 0 }}
      />
      {/* Dominant color overlay — crossfades 400ms on track change */}
      <div 
        className="np-bg-color" 
        style={{ 
          backgroundColor: `rgb(${dominantColor})`,
          opacity: 1,
          transition: 'background-color 400ms linear'
        }} 
      />
      {/* Dark vignette for text legibility */}
      <div className="np-bg-vignette" />

      {/* Top Header */}
      <div className="npp-top-header">
        <button className="np-close-chevron" onClick={handleClose}><FaChevronDown /></button>
        <div className="npp-header-brand">
          <div className="npp-header-info">
            <span className="npp-context-type">{playbackContext.type}</span>
            <span className="npp-context-name ellipsis">{playbackContext.name}</span>
          </div>
        </div>
        <div className="npp-header-spacer" /> {/* Spacer to balance the close button (40px) */}
      </div>

      <div className="np-panel">
        {/* ── Card-Peek Pager (mobile only — desktop just shows the flipper) ── */}
        <div
          className="np-pager-viewport"
          ref={pagerViewportRef}
        >
          {/* Rail: 3 slots — prev | current | next — positioned side by side */}
          <div
            className="np-pager-rail"
            ref={pagerRailRef}
            onTouchStart={handleArtTouchStart}
            onTouchMove={handleArtTouchMove}
            onTouchEnd={handleArtTouchEnd}
          >
            {/* Prev card */}
            <div className="np-pager-card" ref={pagerCardRefs[0]}>
              {prevTrackData ? (
                <div className="np-squircle-cover-wrapper">
                  <img src={getCoverSrc(prevTrackData)} alt="prev" className="np-squircle-cover" decoding="async" />
                </div>
              ) : <div className="np-pager-card-empty" />}
            </div>

            {/* Current card — full flip card */}
            <div className="np-pager-card" ref={pagerCardRefs[1]}>
              <div
                className={`np-cover-flipper ${isFlipped ? 'flipped' : ''}`}
                onClick={() => { if (!artDragDirection.current) setIsFlipped(!isFlipped); }}
              >
                <div className="np-cover-flipper-inner">
                  <div className="np-cover-front">
                    {viewMode === 'vinyl' ? (
                      <div className="np-turntable" style={{ cursor: 'default' }}>
                        <div className={`vinyl-disc ${isPlaying ? 'spinning' : ''}`}>
                          <div className="vinyl-groove g1" />
                          <div className="vinyl-groove g2" />
                          <div className="vinyl-groove g3" />
                          <div className="vinyl-groove g4" />
                          <div className="vinyl-label">
                            <img src={coverSrc || logo} alt="album" className="vinyl-label-img" />
                            <div className="vinyl-spindle" />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="np-squircle-cover-wrapper" style={{ marginTop: 0 }}>
                        <img 
                          src={coverSrc || logo} 
                          alt="album" 
                          className="np-squircle-cover" 
                          style={{ objectFit: 'contain' }} 
                          decoding="async"
                          fetchpriority="high"
                        />
                      </div>
                    )}
                  </div>
                  <div className="np-cover-back">
                    <div className="track-details-card center-aligned">
                      <div className="details-list">
                        <div className="detail-entry">
                          <span className="detail-prop">Codec</span>
                          <span className="detail-val">{currentTrack?.format || 'Unknown'}</span>
                        </div>
                        {currentTrack?.channels && (
                          <div className="detail-entry">
                            <span className="detail-prop">Channels</span>
                            <span className="detail-val">{currentTrack.channels === 2 ? 'Stereo' : currentTrack.channels === 1 ? 'Mono' : currentTrack.channels}</span>
                          </div>
                        )}
                        {currentTrack?.sampleRate && (
                          <div className="detail-entry">
                            <span className="detail-prop">Sample rate</span>
                            <span className="detail-val">{currentTrack.sampleRate} Hz</span>
                          </div>
                        )}
                        {currentTrack?.bitsPerSample && (
                          <div className="detail-entry">
                            <span className="detail-prop">Bits per sample</span>
                            <span className="detail-val">{currentTrack.bitsPerSample}</span>
                          </div>
                        )}
                        {sizeBytes > 0 && (
                          <div className="detail-entry">
                            <span className="detail-prop">Size</span>
                            <span className="detail-val">{formatBytes(sizeBytes)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Next card */}
            <div className="np-pager-card" ref={pagerCardRefs[2]}>
              {nextTrackData ? (
                <div className="np-squircle-cover-wrapper">
                  <img src={getCoverSrc(nextTrackData)} alt="next" className="np-squircle-cover" decoding="async" />
                </div>
              ) : <div className="np-pager-card-empty" />}
            </div>
          </div>
        </div>

        {/* Track Info */}
        <div className="np-info">
          <div className="np-title ellipsis">{currentTrack?.title || 'No track selected'}</div>
          <div className="np-artist ellipsis">{currentTrack?.artist || 'Unknown Artist'}</div>
        </div>

        {/* Seekbar */}
        <div className="np-seekbar-row">
          <span className="np-time">{formatTime(dragProgress != null ? dragProgress * duration : currentTime)}</span>
          <div className="np-seekbar" onMouseDown={handleSeekDrag} onTouchStart={handleSeekDrag}>
            <div className="np-seekbar-fill" style={{ width: `${(dragProgress ?? progress) * 100}%` }} />
            <div className="np-seekbar-handle" style={{ left: `${(dragProgress ?? progress) * 100}%` }} />
          </div>
          <span className="np-time">{formatTime(duration)}</span>
        </div>

        {/* Controls */}
        <div className="np-controls">
          <button className={`np-ctrl-btn ${isShuffled ? 'ctrl-active' : ''}`} onClick={toggleShuffle} title="Shuffle">
            <FaRandom />
          </button>
          <button className="np-skip-btn" onClick={handlePrevTrack} title="Previous">
            <FaStepBackward />
          </button>
          <div className={`np-play-wrap ${isPlaying ? 'is-playing' : ''}`}>
            <button className="np-play-btn" onClick={togglePlay}>
              {isPlaying ? <FaPause /> : <FaPlay style={{ marginLeft: 3 }} />}
            </button>
          </div>
          <button className="np-skip-btn" onClick={handleNextTrack} title="Next">
            <FaStepForward />
          </button>
          <button className={`np-ctrl-btn ${isRepeating ? 'ctrl-active' : ''}`} onClick={toggleRepeat} title="Repeat">
            <FaRedoAlt />
          </button>
        </div>
      </div>

      {/* Secondary controls mirroring bottom bar (Volume, Queue, Menu) */}
      <div className="np-secondary-controls">
        <div className="np-volume-section">
          <button className="np-vol-btn" onClick={toggleMute} title={volume === 0 ? "Unmute" : "Mute"}>
            {volume === 0 ? <FaVolumeMute /> : <FaVolumeUp />}
          </button>
          <div className="np-vol-slider" onMouseDown={handleVolumeDrag} onTouchStart={handleVolumeDrag}>
            <div className="np-vol-bg">
              <div className="np-vol-fill" style={{ width: `${volume * 100}%` }} />
              <div className="np-vol-handle" style={{ left: `${volume * 100}%` }} />
            </div>
          </div>
        </div>

        <div className="np-right-controls" style={{ display: 'flex', gap: '12px', position: 'relative', alignItems: 'center' }}>

          {/* Sleep Timer */}
          <div className="np-tool-btn-wrap">
            <button
              className={`np-tool-btn ${sleepTimeLeft ? 'ctrl-active' : ''}`}
              title="Sleep Timer"
              onClick={(e) => { e.stopPropagation(); setShowSleep(!showSleep); }}
            >
              <FaMoon />
              {sleepTimeLeft && <span className="sleep-badge">{Math.ceil(sleepTimeLeft / 60)}m</span>}
            </button>

            {showSleep && (
              <div className="sleep-popup" onClick={e => e.stopPropagation()}>
                <div className="bottom-sheet-drag-handle"></div>
                <div className="sleep-popup-title">Sleep Timer</div>
                <button className="sleep-item" onClick={() => { startSleepTimer(0); setShowSleep(false); }}>Off</button>
                <button className="sleep-item" onClick={() => { startSleepTimer(5); setShowSleep(false); }}>5 min</button>
                <button className="sleep-item" onClick={() => { startSleepTimer(15); setShowSleep(false); }}>15 min</button>
                <button className="sleep-item" onClick={() => { startSleepTimer(30); setShowSleep(false); }}>30 min</button>
                <button className="sleep-item" onClick={() => { startSleepTimer(60); setShowSleep(false); }}>60 min</button>
              </div>
            )}
          </div>

          <div className="np-tool-btn-wrap">
            <button
              className={`np-tool-btn ${showQueue ? 'ctrl-active' : ''}`}
              title="Queue"
              onClick={(e) => { e.stopPropagation(); setShowQueue(!showQueue); }}
            >
              <FaListUl />
            </button>

            {showQueue && (
              <div className="queue-popup" onClick={e => e.stopPropagation()}>
                <div className="bottom-sheet-drag-handle"></div>
                <div className="queue-popup-hdr">Queue</div>
                <div className="queue-popup-list">
                  {currentTrack && (
                    <div className="queue-item queue-item-active now-playing-row">
                      <img src={coverSrc} alt={currentTrack.title} className="queue-item-cover" />
                      <div className="queue-item-info">
                        <div className="queue-item-title ellipsis">{currentTrack.title}</div>
                        <div className="queue-item-artist ellipsis">{currentTrack.artist || 'Unknown Artist'}</div>
                      </div>
                    </div>
                  )}
                  {userAddedTracks.map((t, idx) => {
                    const absoluteIdx = nextUpTracks.indexOf(t);
                    const trackCover = t.coverUrl && !t.coverUrl.includes('images.unsplash.com') ? t.coverUrl : logo;
                    return (
                      <div
                        key={t.id}
                        className="queue-item draggable"
                        onClick={() => { playTrack(t); setShowQueue(false); }}
                        draggable
                        onDragStart={(e) => handleDragStart(e, absoluteIdx)}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, absoluteIdx)}
                      >
                        <img src={trackCover} alt={t.title} className="queue-item-cover" />
                        <div className="queue-item-info">
                          <div className="queue-item-title ellipsis">{t.title}</div>
                          <div className="queue-item-artist ellipsis">{t.artist || 'Unknown Artist'}</div>
                        </div>
                        <div className="queue-drag-handle" title="Drag to reorder">
                          <FaBars />
                        </div>
                      </div>
                    );
                  })}

                  {regularNextUp.map((t, idx) => {
                    const absoluteIdx = nextUpTracks.indexOf(t);
                    const trackCover = t.coverUrl && !t.coverUrl.includes('images.unsplash.com') ? t.coverUrl : logo;
                    return (
                      <div
                        key={t.id}
                        className="queue-item draggable"
                        onClick={() => { playTrack(t); setShowQueue(false); }}
                        draggable
                        onDragStart={(e) => handleDragStart(e, absoluteIdx)}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, absoluteIdx)}
                      >
                        <img src={trackCover} alt={t.title} className="queue-item-cover" />
                        <div className="queue-item-info">
                          <div className="queue-item-title ellipsis">{t.title}</div>
                          <div className="queue-item-artist ellipsis">{t.artist || 'Unknown Artist'}</div>
                        </div>
                        <div className="queue-drag-handle" title="Drag to reorder">
                          <FaBars />
                        </div>
                      </div>
                    );
                  })}
                  {queue.length === 0 && <div className="queue-empty">Your queue is empty.</div>}
                </div>
              </div>
            )}
          </div>

          {/* More Options */}
          <div className="np-tool-btn-wrap">
            <button
              className={`np-tool-btn ${showMoreOptions ? 'ctrl-active' : ''}`}
              title="More"
              onClick={(e) => { e.stopPropagation(); setShowMoreOptions(!showMoreOptions); setShowQueue(false); setShowSleep(false); }}
            >
              <FaEllipsisV />
            </button>

            {showMoreOptions && (
              <div className="more-popup" onClick={e => e.stopPropagation()}>
                <div className="bottom-sheet-drag-handle"></div>
                <div className="more-popup-title">Display Mode</div>
                <button className={`more-item ${viewMode === 'vinyl' ? 'item-active' : ''}`} onClick={() => { setViewMode('vinyl'); setShowMoreOptions(false); }}>
                  Rotating Disc
                </button>
                <button className={`more-item ${viewMode === 'squircle' ? 'item-active' : ''}`} onClick={() => { setViewMode('squircle'); setShowMoreOptions(false); }}>
                  Squircle Cover
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default NowPlayingPanel;
