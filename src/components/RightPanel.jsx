import React from 'react';
import { useAudioPlayer } from '../context/AudioPlayerContext';
import { FaPlay, FaPause, FaStepForward } from 'react-icons/fa';
import './RightPanel.css';

const DEFAULT_COVER = 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=300&q=80';

const RightPanel = () => {
  const { currentTrack, isPlaying, playTrack, togglePlay, queue } = useAudioPlayer();

  // Find where we are in the queue to show what's next
  const currentIndex = queue.findIndex(t => t.id === currentTrack?.id);
  // Show up to 5 upcoming tracks
  const upcomingTracks = currentIndex !== -1 ? queue.slice(currentIndex + 1, currentIndex + 6) : [];

  return (
    <aside className="right-panel">
      {/* ── Now Playing (Top) ── */}
      <section className="rp-section">
        <div className="rp-header">
          <h3>Now Playing</h3>
        </div>
        
        {currentTrack ? (
          <div className="now-playing-large">
            <div className="np-cover-wrap">
              <img src={currentTrack.coverUrl || DEFAULT_COVER} alt={currentTrack.title} className="np-cover" />
            </div>
            <div className="np-info">
              <h4 className="np-title">{currentTrack.title}</h4>
              <p className="np-artist">{currentTrack.artist}</p>
            </div>
          </div>
        ) : (
          <div className="np-empty">
            <div className="np-empty-cover" />
            <p>Ready to play.</p>
          </div>
        )}
      </section>

      {/* ── Queue (Middle) ── */}
      <section className="rp-section rp-queue" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div className="rp-header">
          <h3>Up Next</h3>
          <span className="queue-count">{queue.length > 0 ? queue.length - (currentIndex + 1) : 0} tracks</span>
        </div>

        <div className="queue-list-wrap" style={{ overflowY: 'auto', flex: 1 }}>
          {upcomingTracks.length > 0 ? (
            <ul className="played-list">
              {upcomingTracks.map((track, idx) => (
                <li
                  key={`${track.id}-${idx}`}
                  className="played-item"
                  onClick={() => playTrack(track)}
                >
                  <div className="played-thumb-wrap">
                    <img src={track.coverUrl || DEFAULT_COVER} alt={track.title} className="played-thumb" />
                    <div className="played-thumb-overlay"><FaPlay /></div>
                  </div>
                  <div className="played-info">
                    <span className="played-title ellipsis">{track.title}</span>
                    <span className="played-artist ellipsis">{track.artist}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rp-empty" style={{ marginTop: '20px' }}>
              {queue.length > 0 ? "You've reached the end of the queue." : "No queue active."}
            </p>
          )}
        </div>
      </section>
    </aside>
  );
};

export default RightPanel;
