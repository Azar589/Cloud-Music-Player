import React, { useState } from 'react';
import { useAudioPlayer } from '../context/AudioPlayerContext';
import {
  FaPlay, FaPause, FaStepBackward, FaStepForward,
  FaRandom, FaRedoAlt, FaVolumeUp, FaVolumeMute, FaListUl,
  FaTimes, FaBars, FaMoon
} from 'react-icons/fa';
import logo from '../assets/logo.png';
import './NowPlayingPanel.css';

const formatTime = (s) => {
  if (!s || isNaN(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
};

const NowPlayingPanel = ({ onClose }) => {
  const {
    isPlaying, currentTrack, progress, currentTime, duration, volume,
    isShuffled, isRepeating, queue, sleepTimeLeft, startSleepTimer,
    togglePlay, toggleShuffle, toggleRepeat,
    seek, nextTrack, prevTrack, updateVolume, toggleMute, playTrack, setQueue
  } = useAudioPlayer();

  const [showQueue, setShowQueue] = useState(false);
  const [showSleep, setShowSleep] = useState(false);
  const [draggedIdx, setDraggedIdx] = useState(null);

  const handleDragStart = (e, idx) => {
    setDraggedIdx(idx);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e) => e.preventDefault();

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

  const handleSeekDrag = (e) => {
    const bar = e.currentTarget;
    const r = bar.getBoundingClientRect();
    const val = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    seek(val);

    const onMove = (mE) => {
      const moveVal = Math.max(0, Math.min(1, (mE.clientX - r.left) / r.width));
      seek(moveVal);
    };
    const onEnd = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onEnd);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onEnd);
  };

  const handleVolumeDrag = (e) => {
    const bar = e.currentTarget;
    const r = bar.getBoundingClientRect();
    const val = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    updateVolume(val);

    const onMove = (mE) => {
      const moveVal = Math.max(0, Math.min(1, (mE.clientX - r.left) / r.width));
      updateVolume(moveVal);
    };
    const onEnd = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onEnd);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onEnd);
  };

  const coverSrc = currentTrack?.coverUrl && !currentTrack.coverUrl.includes('images.unsplash.com')
    ? currentTrack.coverUrl
    : logo;

  return (
    <div className="np-overlay">
      {/* Close */}
      <button className="np-close" onClick={onClose}><FaTimes /></button>

      <div className="np-panel" onClick={e => e.stopPropagation()}>

        {/* Blurred background art */}
        <div
          className="np-bg"
          style={{ backgroundImage: `url(${coverSrc})` }}
        />

        {/* Vinyl Turntable */}
        <div className="np-turntable" style={{ cursor: 'default' }}>
          {/* The tonearm */}
          <div
            className={`tonearm-wrap ${isPlaying ? 'arm-on' : 'arm-off'}`}
            onClick={(e) => { e.stopPropagation(); togglePlay(); }}
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {/* The base pivot circle assembly */}
            <div className="tonearm-base">
              <div className="tonearm-base-inner" />
              <div className="tonearm-base-ring" />
              <div className="tonearm-base-dot" />
            </div>

            {/* Top counterweight/connector piece */}
            <div className="tonearm-counterweight" />

            {/* The main arm constructed from two angled segments */}
            <div className="tonearm-segment-1">
              <div className="tonearm-segment-2">
                {/* cartridge/needle head */}
                <div className="tonearm-head">
                  <div className="tonearm-head-connector" />
                  <div className="tonearm-head-body">
                    <div className="tonearm-needle-lines" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Vinyl record disc */}
          <div className={`vinyl-disc ${isPlaying ? 'spinning' : ''}`}>
            {/* Grooves */}
            <div className="vinyl-groove g1" />
            <div className="vinyl-groove g2" />
            <div className="vinyl-groove g3" />
            <div className="vinyl-groove g4" />
            {/* Center label with album art */}
            <div className="vinyl-label">
              <img src={coverSrc} alt="album" className="vinyl-label-img" />
              <div className="vinyl-spindle" />
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
          <span className="np-time">{formatTime(currentTime)}</span>
          <div className="np-seekbar" onMouseDown={handleSeekDrag}>
            <div className="np-seekbar-fill" style={{ width: `${progress * 100}%` }} />
            <div className="np-seekbar-handle" style={{ left: `${progress * 100}%` }} />
          </div>
          <span className="np-time">{formatTime(duration)}</span>
        </div>

        {/* Controls */}
        <div className="np-controls">
          <button className={`np-ctrl-btn ${isShuffled ? 'ctrl-active' : ''}`} onClick={toggleShuffle} title="Shuffle">
            <FaRandom />
          </button>
          <button className="np-skip-btn" onClick={prevTrack} title="Previous">
            <FaStepBackward />
          </button>
          <div className={`np-play-wrap ${isPlaying ? 'is-playing' : ''}`}>
            <button className="np-play-btn" onClick={togglePlay}>
              {isPlaying ? <FaPause /> : <FaPlay style={{ marginLeft: 3 }} />}
            </button>
          </div>
          <button className="np-skip-btn" onClick={nextTrack} title="Next">
            <FaStepForward />
          </button>
          <button className={`np-ctrl-btn ${isRepeating ? 'ctrl-active' : ''}`} onClick={toggleRepeat} title="Repeat">
            <FaRedoAlt />
          </button>
        </div>
      </div>

      {/* Secondary controls mirroring bottom bar (Volume, Queue, Menu) */}
      <div className="np-secondary-controls" onClick={e => e.stopPropagation()}>
        <div className="np-volume-section">
          <button className="np-vol-btn" onClick={toggleMute} title={volume === 0 ? "Unmute" : "Mute"}>
            {volume === 0 ? <FaVolumeMute /> : <FaVolumeUp />}
          </button>
          <div className="np-vol-slider" onMouseDown={handleVolumeDrag}>
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
                <div className="queue-popup-hdr">Queue</div>
                <div className="queue-popup-list">
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
    </div>
  );
};

export default NowPlayingPanel;
