import React, { useState } from 'react';
import { useAudioPlayer } from '../context/AudioPlayerContext';
import {
  FaPlay, FaPause, FaStepBackward, FaStepForward,
  FaRandom, FaRedoAlt, FaVolumeUp, FaVolumeMute,
  FaListUl, FaBars, FaMoon
} from 'react-icons/fa';
import logo from '../assets/logo.png';
import { useApp } from '../context/AppContext';
import './Player.css';

const formatTime = (s) => {
  if (!s || isNaN(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
};

const Player = () => {
  const {
    isPlaying, isDownloading, currentTrack, volume, progress, currentTime, duration,
    isShuffled, isRepeating, queue, sleepTimeLeft, startSleepTimer,
    togglePlay, toggleShuffle, toggleRepeat,
    updateVolume, toggleMute, seek,
    nextTrack, prevTrack, playTrack, setQueue,
    setProgress, setCurrentTime
  } = useAudioPlayer();

  const [showQueue, setShowQueue] = useState(false);
  const [showSleep, setShowSleep] = useState(false);
  const [draggedIdx, setDraggedIdx] = useState(null);
  const { setShowNowPlaying } = useApp();

  // FIX: declare before any function that uses it
  const noTrack = !currentTrack;

  // Close popups on outside click
  React.useEffect(() => {
    if (!showQueue && !showSleep) return;
    const hide = () => { setShowQueue(false); setShowSleep(false); };
    document.addEventListener('click', hide);
    return () => document.removeEventListener('click', hide);
  }, [showQueue, showSleep]);

  // ── Drag-to-reorder helpers ──────────────────────────────────────────────
  const handleDragStart = (e, idx) => {
    setDraggedIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
  };
  const handleDragOver = (e) => e.preventDefault();
  const handleDrop = (e, targetIdx) => {
    e.preventDefault();
    if (draggedIdx === null || draggedIdx === targetIdx) return;
    const currentIdx = currentTrack ? queue.findIndex(t => t.id === currentTrack.id) : -1;
    const visibleQueue = currentIdx !== -1 ? queue.slice(currentIdx + 1) : queue;
    const newItems = [...visibleQueue];
    const dragged = newItems.splice(draggedIdx, 1)[0];
    newItems.splice(targetIdx, 0, dragged);
    const fullQueue = currentIdx !== -1
      ? [...queue.slice(0, currentIdx + 1), ...newItems]
      : (currentTrack ? [currentTrack, ...newItems] : newItems);
    setQueue(fullQueue);
    setDraggedIdx(null);
  };

  // ── FIX: unified drag handler that supports both mouse and touch ─────────
  const makeDragHandler = (type) => (e) => {
    if (noTrack && type === 'seek') return;

    const getX = (evt) => {
      if (evt.touches && evt.touches.length > 0) return evt.touches[0].clientX;
      if (evt.changedTouches && evt.changedTouches.length > 0) return evt.changedTouches[0].clientX;
      return evt.clientX;
    };

    const bar = e.currentTarget;
    const r = bar.getBoundingClientRect();
    const compute = (clientX) => Math.max(0, Math.min(1, (clientX - r.left) / r.width));

    const apply = (val, isEnd = false) => {
      if (type === 'seek') {
        if (isEnd) seek(val);
        else {
          setProgress(val);
          if (duration) setCurrentTime(val * duration);
        }
      } else {
        updateVolume(val);
      }
    };

    apply(compute(getX(e)));

    const onMove = (mE) => {
      if (mE.cancelable) mE.preventDefault();
      apply(compute(getX(mE)), false);
    };
    const onEnd = (mE) => {
      apply(compute(getX(mE)), true);
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

  const handleSeekDrag = makeDragHandler('seek');
  const handleVolumeDrag = makeDragHandler('volume');

  return (
    <div className="player">
      {/* ── Top Seekbar ── */}
      <div
        className={`player-top-seekbar ${isDownloading ? 'loading' : ''}`}
        onMouseDown={handleSeekDrag}
        onTouchStart={handleSeekDrag}
        onClick={e => e.stopPropagation()}
        style={{ pointerEvents: noTrack ? 'none' : 'auto' }}
      >
        <div className="player-progress-bg">
          <div className="player-progress-fill" style={{ width: `${progress * 100}%` }} />
          <div className="player-progress-handle" style={{ left: `${progress * 100}%` }} />
        </div>
      </div>

      <div 
        className="player-inner" 
        onClick={() => currentTrack && setShowNowPlaying(true)}
        style={{ cursor: currentTrack ? 'pointer' : 'default' }}
      >

        {/* ── Left: Now Playing ── */}
        <div className="player-now-playing">
          {currentTrack?.coverUrl && !currentTrack.coverUrl.includes('images.unsplash.com') ? (
            <img
              src={currentTrack.coverUrl}
              alt={currentTrack.title}
              className="now-playing-cover"
            />
          ) : (
            <img
              src={logo}
              alt="logo"
              className="now-playing-cover"
              style={{ objectFit: 'contain', opacity: 0.8 }}
            />
          )}
          <div className="now-playing-text">
            <span className="now-playing-title ellipsis">{currentTrack?.title || 'No track selected'}</span>
            <span className="now-playing-artist ellipsis">{currentTrack?.artist || 'Unknown Artist'}</span>
          </div>
        </div>

        {/* ── Center: Controls ── */}
        <div className="player-center">
          <div className="player-controls" onClick={e => e.stopPropagation()}>
            <span className="player-time" style={{ marginRight: '8px' }}>{formatTime(currentTime)}</span>
            
            <button className={`p-ctrl-btn ${isShuffled ? 'ctrl-active' : ''}`} onClick={toggleShuffle} title="Shuffle">
              <FaRandom />
            </button>
            <button className="p-skip-btn" onClick={prevTrack} disabled={noTrack} title="Previous">
              <FaStepBackward />
            </button>

            <div className={`p-play-btn-wrapper ${isPlaying ? 'is-playing' : ''}`}>
              <button className="p-play-btn" onClick={togglePlay} disabled={noTrack}>
                {isPlaying ? <FaPause /> : <FaPlay style={{ marginLeft: '1px' }} />}
              </button>
            </div>

            <button className="p-skip-btn" onClick={nextTrack} disabled={noTrack} title="Next">
              <FaStepForward />
            </button>
            <button className={`p-ctrl-btn ${isRepeating ? 'ctrl-active' : ''}`} onClick={toggleRepeat} title="Repeat">
              <FaRedoAlt />
            </button>

            <span className="player-time" style={{ marginLeft: '8px' }}>{formatTime(duration)}</span>
          </div>
        </div>

        {/* ── Right: Volume + Queue + Sleep ── */}
        <div className="player-right" onClick={e => e.stopPropagation()}>

          {/* Sleep Timer */}
          <div className="sleep-timer-wrap" style={{ position: 'relative' }}>
            <button
              className={`p-ctrl-btn ${sleepTimeLeft ? 'ctrl-active' : ''}`}
              onClick={(e) => { e.stopPropagation(); setShowSleep(!showSleep); }}
              title="Sleep Timer"
            >
              <FaMoon />
              {sleepTimeLeft && <span className="sleep-badge">{Math.ceil(sleepTimeLeft / 60)}m</span>}
            </button>
            {showSleep && (
              <div className="sleep-popup" onClick={e => e.stopPropagation()}>
                <div className="sleep-popup-title">Sleep Timer</div>
                {[0, 5, 15, 30, 60].map(m => (
                  <button key={m} className="sleep-item" onClick={() => { startSleepTimer(m); setShowSleep(false); }}>
                    {m === 0 ? 'Off' : `${m} min`}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Queue */}
          <button
            className={`p-queue-btn ${showQueue ? 'active' : ''}`}
            onClick={(e) => { e.stopPropagation(); setShowQueue(!showQueue); }}
            title="Queue"
          >
            <FaListUl />
          </button>

          {/* Volume — mouse + touch */}
          <div className="volume-wrapper" onClick={e => e.stopPropagation()}>
            <button className="p-icon-btn" onClick={toggleMute} title={volume === 0 ? 'Unmute' : 'Mute'}>
              {volume === 0 ? <FaVolumeMute /> : <FaVolumeUp />}
            </button>
            <div
              className="volume-track"
              onMouseDown={handleVolumeDrag}
              onTouchStart={handleVolumeDrag}
              title="Volume"
            >
              <div className="volume-fill" style={{ width: `${volume * 100}%` }} />
              <div className="volume-handle" style={{ left: `${volume * 100}%` }} />
            </div>
          </div>

          {/* Queue popup */}
          {showQueue && (
            <div className="queue-popup" onClick={e => e.stopPropagation()}>
              <div className="queue-popup-hdr">Queue</div>
              <div className="queue-popup-list">
                {currentTrack && (
                  <div className="queue-item queue-item-active now-playing-row">
                    <img 
                      src={currentTrack.coverUrl && !currentTrack.coverUrl.includes('images.unsplash.com') ? currentTrack.coverUrl : logo} 
                      alt={currentTrack.title} 
                      className="queue-item-cover" 
                      style={{ objectFit: 'contain' }}
                    />
                    <div className="queue-item-info">
                      <div className="queue-item-title ellipsis">{currentTrack.title}</div>
                      <div className="queue-item-artist ellipsis">{currentTrack.artist || 'Unknown Artist'}</div>
                    </div>
                  </div>
                )}
                {(() => {
                  const currentIdx = currentTrack ? queue.findIndex(t => t.id === currentTrack.id) : -1;
                  const nextUp = currentIdx !== -1 ? queue.slice(currentIdx + 1) : queue;
                  const userAddedTracks = nextUp.filter(t => t.isUserAdded);
                  const regularNextUp = nextUp.filter(t => !t.isUserAdded);
                  
                  return (
                    <>
                      {userAddedTracks.map((t) => {
                        const absoluteIdx = nextUp.indexOf(t);
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
                            <div className="queue-drag-handle" title="Drag to reorder"><FaBars /></div>
                          </div>
                        );
                      })}
                      
                      {regularNextUp.map((t) => {
                        const absoluteIdx = nextUp.indexOf(t);
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
                            <div className="queue-drag-handle" title="Drag to reorder"><FaBars /></div>
                          </div>
                        );
                      })}
                    </>
                  );
                })()}
                {queue.length === 0 && <div className="queue-empty">Your queue is empty.</div>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Player;