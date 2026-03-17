import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { usePlaylists } from '../context/PlaylistContext';
import { useAudioPlayer } from '../context/AudioPlayerContext';
import { FaPlay, FaPause, FaFolder, FaMusic, FaMicrophone, FaTrash, FaChevronLeft } from 'react-icons/fa';
import Player from './Player';
import NowPlayingPanel from './NowPlayingPanel';
import logo from '../assets/logo.png';
import './MainView.css';

const HERO_BG = 'https://images.unsplash.com/photo-1493225457124-a3a2fcf0c374?w=800&q=80';

const TrackTable = ({ tracks, showHeader = true, playlistId = null }) => {
  const { playTrack, togglePlay, currentTrack, isPlaying, setQueue } = useAudioPlayer();
  const { removeFromPlaylist } = usePlaylists();
  const [hoveredRow, setHoveredRow] = useState(null);

  if (tracks.length === 0) return <p className="track-empty">No tracks here yet.</p>;

  return (
    <table className="track-table">
      {showHeader && (
        <thead>
          <tr className="track-table-hdr">
            <th>  #</th>
            <th>SONG</th>
            <th>QUALITY</th>
            <th>ARTIST</th>
            <th style={{ textAlign: 'right' }}>TIME</th>
            {playlistId && <th style={{ width: 40 }}></th>}
          </tr>
        </thead>
      )}
      <tbody>
        {tracks.map((track, idx) => {
          const isActive = currentTrack?.id === track.id;
          const isHov = hoveredRow === track.id;
          return (
            <tr
              key={track.id}
              className={`track-row ${isActive ? 'row-active' : ''}`}
              onClick={() => {
                if (isActive) togglePlay();
                else { setQueue(tracks); playTrack(track); }
              }}
              onMouseEnter={() => setHoveredRow(track.id)}
              onMouseLeave={() => setHoveredRow(null)}
            >
              <td className="td-num">
                <div className="td-num-content">
                  {isHov
                    ? <span className={`row-play-icon ${isActive ? 'rp-active' : ''}`}>
                      {isActive && isPlaying ? <FaPause /> : <FaPlay />}
                    </span>
                    : (isActive && isPlaying
                      ? <span className="equaliser"><span /><span /><span /></span>
                      : <span className={isActive ? 'active-num' : ''}>{String(idx + 1).padStart(2, '0')}</span>
                    )
                  }
                </div>
              </td>
              <td className="td-title">
                <div className="title-cell">
                  {track.coverUrl && !track.coverUrl.includes('images.unsplash.com') ? (
                    <img src={track.coverUrl} alt={track.title} className="track-cover-mini" />
                  ) : (
                    <img src={logo} alt="icon" className="track-cover-mini" style={{ objectFit: 'cover', opacity: 0.8 }} />
                  )}
                  <span className={`track-title-text ${isActive ? 'text-active' : ''} ellipsis`}>{track.title}</span>
                </div>
              </td>
              <td className="td-quality">
                {track.format ? (
                  <div className="quality-cell">
                    <span className="format-badge">{track.format}</span>
                    <span className="quality-text">{track.quality || 'Standard'}</span>
                  </div>
                ) : <span className="quality-text">Standard</span>}
              </td>
              <td className="td-artist ellipsis">{track.artist || 'Unknown Artist'}</td>
              <td className="td-time" style={{ textAlign: 'right' }}>{track.duration !== 'Unknown' ? track.duration : '--:--'}</td>
              {playlistId && (
                <td className="td-action">
                  <button
                    className="pl-remove-btn"
                    onClick={(e) => { e.stopPropagation(); removeFromPlaylist(playlistId, track.id); }}
                    title="Remove from playlist"
                  >
                    <FaTrash />
                  </button>
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
};

const MainView = () => {
  const { playTrack, currentTrack, isPlaying, togglePlay, setQueue, recentlyPlayed } = useAudioPlayer();
  const {
    isLoading, loadError, allTracks, folders, artistMap,
    activeView, viewParam, navigate, goBack, canGoBack,
    showNowPlaying, setShowNowPlaying
  } = useApp();
  const { playlists } = usePlaylists();
  const [recentCardSize, setRecentCardSize] = useState(160);

  const renderHome = () => (
    <>
      <div className="playlist-title-row" style={{ marginTop: 24 }}><h2 className="playlist-title">Home</h2></div>

      {recentlyPlayed.length > 0 && (
        <div className="recent-section">
          <div className="playlist-title-row"><h3 className="section-subtitle">Recently Played</h3></div>
          <div className="recent-grid" style={{ '--recent-size': `${recentCardSize}px` }}>
            {recentlyPlayed.map(t => (
              <div key={t.id} className="recent-card" onClick={() => { setQueue([t]); playTrack(t); }}>
                <div className="recent-cover-wrap">
                  {t.coverUrl && !t.coverUrl.includes('images.unsplash.com') ? (
                    <img src={t.coverUrl} alt={t.title} className="recent-cover" />
                  ) : (
                    <img src={logo} alt="icon" className="recent-cover" style={{ objectFit: 'cover', opacity: 0.8 }} />
                  )}
                </div>
                <div className="recent-track-info">
                  <span className="recent-title ellipsis">{t.title}</span>
                  <span className="recent-artist ellipsis">{t.artist || 'Unknown Artist'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="playlist-title-row" style={{ marginTop: 32 }}><h2 className="playlist-title">Folders</h2></div>
      <div className="folder-grid">
        {folders.map(f => (
          <div key={f.id} className="folder-card" onClick={() => navigate('folder', f.id)}>
            <div className="folder-icon"><FaFolder /></div>
            <div className="folder-info">
              <span className="folder-name ellipsis">{f.name}</span>
              <span className="folder-count">{f.trackCount} tracks</span>
            </div>
          </div>
        ))}
        {folders.length === 0 && <p className="track-empty" style={{ gridColumn: '1/-1' }}>No audio folders found.</p>}
      </div>
    </>
  );

  const renderSongs = () => (
    <>
      <div className="playlist-title-row"><h2 className="playlist-title">All Songs</h2></div>
      <TrackTable tracks={allTracks} />
    </>
  );

  const renderArtists = () => {
    const artists = Object.keys(artistMap).sort();
    return (
      <>
        <div className="playlist-title-row"><h2 className="playlist-title">Artists</h2></div>
        <div className="folder-grid">
          {artists.map(name => (
            <div key={name} className="folder-card" onClick={() => navigate('artist-detail', name)}>
              <div className="folder-icon" style={{ padding: 0, overflow: 'hidden' }}>
                <img src={logo} alt="artist" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.8 }} />
              </div>
              <div className="folder-info">
                <span className="folder-name ellipsis">{name}</span>
                <span className="folder-count">{artistMap[name].length} tracks</span>
              </div>
            </div>
          ))}
        </div>
      </>
    );
  };

  const renderFolderDetail = () => {
    const folder = folders.find(f => f.id === viewParam);
    const tracks = allTracks.filter(t => t.folderId === viewParam);
    return (
      <>
        <div className="playlist-title-row">
          <h2 className="playlist-title">{folder?.name || 'Folder'}</h2>
          <span className="subtitle-count">{tracks.length} tracks</span>
        </div>
        <TrackTable tracks={tracks} />
      </>
    );
  };

  const renderArtistDetail = () => {
    const tracks = artistMap[viewParam] || [];
    return (
      <>
        <div className="playlist-title-row">
          <h2 className="playlist-title">{viewParam}</h2>
          <span className="subtitle-count">{tracks.length} tracks</span>
        </div>
        <TrackTable tracks={tracks} />
      </>
    );
  };

  const renderPlaylistDetail = () => {
    const playlist = playlists.find(p => p.id === viewParam);
    if (!playlist) return <p className="track-error">Playlist not found.</p>;
    const tracks = playlist.trackIds.map(id => allTracks.find(t => t.id === id)).filter(Boolean);
    return (
      <>
        <div className="playlist-title-row">
          <h2 className="playlist-title">{playlist.name}</h2>
          <span className="subtitle-count">{tracks.length} tracks</span>
        </div>
        <TrackTable tracks={tracks} playlistId={playlist.id} />
      </>
    );
  };

  return (
    <section className="main-view">
      {showNowPlaying && (
        <NowPlayingPanel onClose={() => setShowNowPlaying(false)} />
      )}

      <div className="mv-topbar">
        {canGoBack && (
          <button className="nav-arrow-btn" onClick={goBack} title="Go back">
            <FaChevronLeft />
          </button>
        )}
        <div className="mv-spacer" />
      </div>
      <div className="mv-scroll" style={{ paddingTop: 8 }}>

        {isLoading ? (
          <div className="track-loading">
            <div className="loading-spinner" />
            <p>Loading Your Songs...</p>
          </div>
        ) : loadError ? (
          <p className="track-error">⚠ {loadError}</p>
        ) : (
          <>
            {activeView === 'home' && renderHome()}
            {activeView === 'songs' && renderSongs()}
            {activeView === 'artists' && renderArtists()}
            {activeView === 'folder' && renderFolderDetail()}
            {activeView === 'artist-detail' && renderArtistDetail()}
            {activeView === 'playlist-detail' && renderPlaylistDetail()}
          </>
        )}
      </div>

      {!showNowPlaying && <Player />}
    </section>
  );
};

export default MainView;
