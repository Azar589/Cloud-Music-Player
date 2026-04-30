import React from 'react';
import { useAudioPlayer } from '../context/AudioPlayerContext';
import { useApp } from '../context/AppContext';
import { FaHome, FaMusic, FaMicrophone, FaListUl, FaPlay, FaPause, FaStepBackward, FaStepForward } from 'react-icons/fa';
import logo from '../assets/logo.png';
import './MobileNavPlayer.css';

const MobileNavPlayer = () => {
  const { currentTrack, isPlaying, togglePlay, nextTrack, prevTrack, dominantColor, isLight } = useAudioPlayer();
  const { activeView, navigate, setShowNowPlaying, showNowPlaying } = useApp();

  return (
    <div className={`mobile-nav-player ${showNowPlaying ? 'panel-open' : ''}`}>
      {/* ── Mini Player ── */}
      {currentTrack && (
        <div 
          className={`mini-player ${isLight ? 'is-light' : ''}`} 
          onClick={() => setShowNowPlaying(true)}
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
