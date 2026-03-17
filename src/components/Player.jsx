import React, { useState } from 'react';
import { useAudioPlayer } from '../context/AudioPlayerContext';
import { FaPlay, FaPause, FaStepBackward, FaStepForward, FaRandom, FaRedoAlt, FaVolumeUp, FaVolumeMute, FaListUl, FaBars, FaMoon } from 'react-icons/fa';
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
    nextTrack, prevTrack, playTrack, setQueue
  } = useAudioPlayer();

  const [showQueue, setShowQueue] = useState(false);
  const [showSleep, setShowSleep] = useState(false);
  const [draggedIdx, setDraggedIdx] = useState(null);
  const { setShowNowPlaying } = useApp();

  // Close popups on click outside
  React.useEffect(() => {
    if (!showQueue && !showSleep) return;
    const hidePopups = () => {
      setShowQueue(false);
      setShowSleep(false);
    };
    document.addEventListener('click', hidePopups);
    return () => document.removeEventListener('click', hidePopups);
  }, [showQueue, showSleep]);

  const handleDragStart = (e, idx) => {
    setDraggedIdx(idx);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e, targetIdx) => {
    e.preventDefault();
    if (draggedIdx === null || draggedIdx === targetIdx) return;

    const visibleQueue = currentTrack ? queue.filter(t => t.id !== currentTrack.id) : queue;
    const newItems = [...visibleQueue];
    const draggedItem = newItems[draggedIdx];
    newItems.splice(draggedIdx, 1);
    newItems.splice(targetIdx, 0, draggedItem);

    const fullQueue = currentTrack ? [currentTrack, ...newItems] : newItems;
    setQueue(fullQueue);
    setDraggedIdx(null);
  };

  const handleDrag = (e, type) => {
    if (noTrack && type === 'seek') return;
    const bar = e.currentTarget;

    const update = (clientX) => {
      const r = bar.getBoundingClientRect();
      const val = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
      if (type === 'seek') seek(val);
      else updateVolume(val);
    };

    update(e.clientX);

    const onMove = (mE) => update(mE.clientX);
    const onEnd = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onEnd);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onEnd);
  };

  const noTrack = !currentTrack;

  return (
    <div className="player">
      <div className="player-inner">
        {/* 1. Left: Now Playing Info + Actions */}
        <div className="player-now-playing">
          {currentTrack?.coverUrl && !currentTrack.coverUrl.includes('images.unsplash.com') ? (
            <img
              src={currentTrack.coverUrl}
              alt={currentTrack.title}
              className="now-playing-cover"
              onClick={() => currentTrack && setShowNowPlaying(true)}
              style={{ cursor: currentTrack ? 'pointer' : 'default' }}
            />
          ) : (
            <img
              src={logo}
              alt="logo"
              className="now-playing-cover"
              style={{ objectFit: 'cover', opacity: 0.8, cursor: currentTrack ? 'pointer' : 'default' }}
              onClick={() => currentTrack && setShowNowPlaying(true)}
            />
          )}
          <div className="now-playing-text">
            <span className="now-playing-title ellipsis">{currentTrack?.title || 'No track selected'}</span>
            <span className="now-playing-artist ellipsis">{currentTrack?.artist || 'Unknown Artist'}</span>
          </div>

        </div>

        {/* 2. Center: Playback Controls & Seekbar Stacked */}
        <div className="player-center">
          <div className="player-controls">
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
          </div>

          {/* Seekbar beneath controls */}
          <div className="player-seekbar-row">
            <span className="player-time">{formatTime(currentTime)}</span>

            <div className={`player-progress-wrap ${isDownloading ? 'loading' : ''}`} onMouseDown={e => handleDrag(e, 'seek')} style={{ pointerEvents: noTrack ? 'none' : 'auto' }}>
              <div className="player-progress-bg">
                <div className="player-progress-fill" style={{ width: `${progress * 100}%` }} />
                <div className="player-progress-handle" style={{ left: `${progress * 100}%` }} />
              </div>
            </div>

            <span className="player-time">{formatTime(duration)}</span>
          </div>
        </div>

        {/* 3. Right: Volume & More Tools */}
        <div className="player-right">
          
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
                <button className="sleep-item" onClick={() => { startSleepTimer(0); setShowSleep(false); }}>Off</button>
                <button className="sleep-item" onClick={() => { startSleepTimer(5); setShowSleep(false); }}>5 min</button>
                <button className="sleep-item" onClick={() => { startSleepTimer(15); setShowSleep(false); }}>15 min</button>
                <button className="sleep-item" onClick={() => { startSleepTimer(30); setShowSleep(false); }}>30 min</button>
                <button className="sleep-item" onClick={() => { startSleepTimer(60); setShowSleep(false); }}>60 min</button>
              </div>
            )}
          </div>


          <button
            className={`p-queue-btn ${showQueue ? 'active' : ''}`}
            onClick={(e) => { e.stopPropagation(); setShowQueue(!showQueue); }}
            title="Queue"
          >
            <FaListUl />
          </button>



          <div className="volume-wrapper">
            <button className="p-icon-btn" onClick={toggleMute} title={volume === 0 ? 'Unmute' : 'Mute'}>
              {volume === 0 ? <FaVolumeMute /> : <FaVolumeUp />}
            </button>
            <div className="volume-track" onMouseDown={e => handleDrag(e, 'volume')} title="Volume">
              <div className="volume-fill" style={{ width: `${volume * 100}%` }} />
              <div className="volume-handle" style={{ left: `${volume * 100}%` }} />
            </div>
          </div>



          {showQueue && (
            <div className="queue-popup">
              <div className="queue-popup-hdr">Queue</div>
              <div className="queue-popup-list">
                {/* 1. Now Playing always at top */}
                {currentTrack && (
                  <div className="queue-item queue-item-active now-playing-row">
                    <span className="queue-item-idx"><FaPlay style={{ fontSize: '0.6rem' }} /></span>
                    <div className="queue-item-info">
                      <div className="queue-item-title ellipsis">{currentTrack.title}</div>
                      <div className="queue-item-artist ellipsis">{currentTrack.artist || 'Unknown Artist'}</div>
                    </div>
                  </div>
                )}

                {currentTrack && queue.filter(t => t.id !== currentTrack.id).length > 0 && (
                  <div className="queue-sec-hdr">Next Up</div>
                )}

                {/* 2. Scrollable / Draggable rest */}
                {queue
                  .filter(t => t.id !== currentTrack?.id)
                  .map((t, idx) => (
                    <div
                      key={t.id}
                      className="queue-item draggable"
                      onClick={() => { playTrack(t); setShowQueue(false); }}
                      draggable
                      onDragStart={(e) => handleDragStart(e, idx)}
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDrop(e, idx)}
                    >
                      <span className="queue-item-idx">{idx + 1}</span>
                      <div className="queue-item-info">
                        <div className="queue-item-title ellipsis">{t.title}</div>
                        <div className="queue-item-artist ellipsis">{t.artist || 'Unknown Artist'}</div>
                      </div>
                      <div className="queue-drag-handle" title="Drag to reorder">
                        <FaBars />
                      </div>
                    </div>
                  ))}

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
