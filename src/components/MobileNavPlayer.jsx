import React, { useRef } from 'react';
import { useAudioPlayer } from '../context/AudioPlayerContext';
import { useApp } from '../context/AppContext';
import { FaHome, FaMusic, FaMicrophone, FaListUl, FaPlay, FaPause, FaStepBackward, FaStepForward } from 'react-icons/fa';
import logo from '../assets/logo.png';
import './MobileNavPlayer.css';

const MobileNavPlayer = () => {
  const { currentTrack, isPlaying, togglePlay, nextTrack, prevTrack, dominantColor, isLight } = useAudioPlayer();
  const { activeView, navigate, setShowNowPlaying, showNowPlaying } = useApp();

  // ── Swipe Logic ──────────────────────────────────────────────────────────
  const touchStartX = useRef(null);
  const touchEndX = useRef(null);

  const minSwipeDistance = 50;

  const onTouchStart = (e) => {
    touchEndX.current = null;
    touchStartX.current = e.targetTouches[0].clientX;
  };

  const onTouchMove = (e) => {
    touchEndX.current = e.targetTouches[0].clientX;
  };

  const onTouchEnd = (e) => {
    if (!touchStartX.current || !touchEndX.current) {
      return;
    }

    const distance = touchStartX.current - touchEndX.current;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe || isRightSwipe) {
      // Prevent the click event that opens NowPlaying if we swiped
      e.stopPropagation();
      if (isLeftSwipe) nextTrack();
      if (isRightSwipe) prevTrack();
    }

    // Reset
    touchStartX.current = null;
    touchEndX.current = null;
  };

  return (
    <div className={`mobile-nav-player ${showNowPlaying ? 'panel-open' : ''}`}>
      {/* ── Mini Player ── */}
      {currentTrack && (
        <div 
          className={`mini-player ${isLight ? 'is-light' : ''}`} 
          onClick={() => {
            // Only open if we didn't perform a significant swipe
            const distance = touchStartX.current && touchEndX.current ? Math.abs(touchStartX.current - touchEndX.current) : 0;
            if (distance < 10) setShowNowPlaying(true);
          }}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          style={{ backgroundColor: `rgb(${dominantColor})` }}
        >
          <div className="mini-player-info">
            <div className="mini-player-cover-wrap">
              <img 
                src={currentTrack.coverUrl && !currentTrack.coverUrl.includes('images.unsplash.com') ? currentTrack.coverUrl : logo} 
                alt="" 
                className="mini-player-cover" 
              />
            </div>
            <div className="mini-player-text">
              <div className="mini-player-title ellipsis">{currentTrack.title}</div>
              <div className="mini-player-artist ellipsis">{currentTrack.artist || 'Unknown Artist'}</div>
            </div>
          </div>
          <div className="mini-player-controls" onClick={e => e.stopPropagation()}>
            <button className="mini-skip-btn" onClick={prevTrack} aria-label="Previous">
              <FaStepBackward />
            </button>
            <div className="mini-play-btn-wrap">
              <button className="mini-play-btn" onClick={togglePlay} aria-label={isPlaying ? "Pause" : "Play"}>
                {isPlaying ? <FaPause size={14} /> : <FaPlay size={14} style={{ marginLeft: '2px' }} />}
              </button>
            </div>
            <button className="mini-skip-btn" onClick={nextTrack} aria-label="Next">
              <FaStepForward />
            </button>
          </div>
        </div>
      )}

      {/* ── Bottom Navigation ── */}
      <nav className="mobile-bottom-nav">
        <button 
          className={`nav-tab ${activeView === 'home' ? 'active' : ''}`} 
          onClick={() => navigate('home')}
        >
          <FaHome />
          <span>Home</span>
        </button>
        <button 
          className={`nav-tab ${activeView === 'songs' ? 'active' : ''}`} 
          onClick={() => navigate('songs')}
        >
          <FaMusic />
          <span>Songs</span>
        </button>
        <button 
          className={`nav-tab ${activeView === 'artists' || activeView === 'artist-detail' ? 'active' : ''}`} 
          onClick={() => navigate('artists')}
        >
          <FaMicrophone />
          <span>Artists</span>
        </button>
        <button 
          className={`nav-tab ${activeView === 'playlists' || activeView === 'playlist-detail' ? 'active' : ''}`} 
          onClick={() => navigate('playlists')}
        >
          <FaListUl />
          <span>Playlists</span>
        </button>
      </nav>
    </div>
  );
};

export default MobileNavPlayer;
