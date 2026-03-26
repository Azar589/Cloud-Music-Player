import React, { useState } from 'react';
import logo from '../assets/logo.png';
import {
  FaHome, FaMusic, FaMicrophone, FaListUl,
  FaPlus, FaTrash, FaSignOutAlt,
  FaChevronDown, FaChevronRight, FaTimes,
} from 'react-icons/fa';
import { BiSearchAlt } from 'react-icons/bi';
import { useApp } from '../context/AppContext';
import { usePlaylists } from '../context/PlaylistContext';
import './Sidebar.css';

const Sidebar = () => {
  const {
    activeView, viewParam, navigate,
    allTracks, mobileNavOpen, setMobileNavOpen,
    searchQuery, setSearchQuery,
  } = useApp();
  const { playlists, createPlaylist, deletePlaylist } = usePlaylists();

  const user = { name: 'Mohamed Azarudeen F', email: 'Cloudflare' };
  const logout = () => { };

  const [playlistsOpen, setPlaylistsOpen] = useState(true);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [showNewInput, setShowNewInput] = useState(false);

  const handleCreatePlaylist = (e) => {
    e.preventDefault();
    if (!newPlaylistName.trim()) return;
    const id = createPlaylist(newPlaylistName.trim());
    setNewPlaylistName('');
    setShowNewInput(false);
    // Navigate to the new playlist immediately
    navigate('playlist-detail', id);
    setMobileNavOpen(false);
  };

  const navItems = [
    { icon: <FaHome />, label: 'Home', view: 'home' },
    { icon: <FaMusic />, label: `Songs (${allTracks.length})`, view: 'songs' },
    { icon: <FaMicrophone />, label: 'Artists', view: 'artists' },
  ];

  const handleSearchChange = (e) => {
    const val = e.target.value;
    setSearchQuery(val);
    // If there is a search query, show search results in main view
    if (val.trim()) {
      navigate('search', null);
    } else {
      navigate('home', null, true);
    }
  };

  return (
    <>
      <div 
        className={`sidebar-overlay ${mobileNavOpen ? 'overlay-active' : ''}`} 
        onClick={() => setMobileNavOpen(false)} 
      />
      <nav className={`sidebar ${mobileNavOpen ? 'mobile-nav-open' : ''}`}>

      {/* Logo */}
      <div className="sidebar-logo">
        <img src={logo} alt="Cloud Music" className="sidebar-logo-img" />
        <span>Cloud Music</span>
      </div>

      {/* Search — FIX: wired up with value + onChange */}
      <div className="sidebar-search">
        <BiSearchAlt className="s-icon" />
        <input
          type="text"
          placeholder="Search tracks..."
          value={searchQuery}
          onChange={handleSearchChange}
        />
        {searchQuery && (
          <button
            onClick={() => { setSearchQuery(''); navigate('home', null, true); }}
            style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: '0.75rem' }}
            title="Clear search"
          >
            ✕
          </button>
        )}
      </div>

      {/* Main nav */}
      <div className="sidebar-group">
        <ul className="nav-menu">
          {navItems.map((item) => (
            <li
              key={item.view}
              className={`nav-item ${activeView === item.view ? 'active' : ''}`}
              onClick={() => { navigate(item.view, null, true); setMobileNavOpen(false); }}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Playlists */}
      <div className="sidebar-group sidebar-playlists">
        <div className="sidebar-group-header playlist-header" onClick={() => setPlaylistsOpen(v => !v)}>
          <FaListUl style={{ fontSize: '0.8rem' }} />
          <span>Playlists</span>
          <span className="badge-count">{playlists.length}</span>
          <button
            className="pl-add-btn"
            title="New playlist"
            onClick={(e) => { e.stopPropagation(); setShowNewInput(v => !v); }}
          >
            <FaPlus />
          </button>
          <span className="pl-chevron">{playlistsOpen ? <FaChevronDown /> : <FaChevronRight />}</span>
        </div>

        {showNewInput && (
          <form className="new-playlist-form" onSubmit={handleCreatePlaylist}>
            <input
              type="text"
              placeholder="Playlist name..."
              value={newPlaylistName}
              onChange={e => setNewPlaylistName(e.target.value)}
              autoFocus
            />
            <button type="submit">Add</button>
          </form>
        )}

        {playlistsOpen && (
          <ul className="nav-menu playlist-list">
            {playlists.length === 0 && (
              <li className="pl-empty-hint">No playlists yet. Click + to create one.</li>
            )}
            {playlists.map(pl => (
              <li
                key={pl.id}
                // FIX: check both activeView AND viewParam so only the selected playlist highlights
                className={`nav-item pl-item ${activeView === 'playlist-detail' && viewParam === pl.id ? 'active' : ''}`}
                onClick={() => { navigate('playlist-detail', pl.id); setMobileNavOpen(false); }}
              >
                <span className="nav-icon"><FaListUl /></span>
                <span className="nav-label ellipsis">{pl.name}</span>
                <span className="pl-count">{pl.trackIds.length}</span>
                <button
                  className="pl-delete-btn"
                  title="Delete playlist"
                  onClick={(e) => { e.stopPropagation(); deletePlaylist(pl.id); }}
                >
                  <FaTrash />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* User footer */}
      <div className="sidebar-user">
        <div className="user-avatar-box">
          {user?.picture
            ? <img src={user.picture} alt={user.name} />
            : <span>{user?.name?.[0] || 'U'}</span>}
        </div>
        <div className="user-text">
          <span className="user-name ellipsis">{user?.name || 'User'}</span>
          <span className="user-sub ellipsis">{user?.email || ''}</span>
        </div>
        <button className="sidebar-logout" onClick={logout} title="Sign out"><FaSignOutAlt /></button>
      </div>
    </nav>
    </>
  );
};

export default Sidebar;