import React, { createContext, useContext, useState, useEffect } from 'react';

const PlaylistContext = createContext();
export const usePlaylists = () => useContext(PlaylistContext);

const STORAGE_KEY = 'drivemusic_playlists';

const load = () => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
};
const save = (data) => localStorage.setItem(STORAGE_KEY, JSON.stringify(data));

export const PlaylistProvider = ({ children }) => {
  const [playlists, setPlaylists] = useState(load);

  // Persist on every change
  useEffect(() => save(playlists), [playlists]);

  const createPlaylist = (name) => {
    const p = { id: Date.now().toString(), name, trackIds: [], createdAt: Date.now() };
    setPlaylists(prev => [...prev, p]);
    return p.id;
  };

  const deletePlaylist = (id) =>
    setPlaylists(prev => prev.filter(p => p.id !== id));

  const renamePlaylist = (id, name) =>
    setPlaylists(prev => prev.map(p => p.id === id ? { ...p, name } : p));

  const addToPlaylist = (playlistId, trackId) =>
    setPlaylists(prev => prev.map(p =>
      p.id === playlistId && !p.trackIds.includes(trackId)
        ? { ...p, trackIds: [...p.trackIds, trackId] }
        : p
    ));

  const removeFromPlaylist = (playlistId, trackId) =>
    setPlaylists(prev => prev.map(p =>
      p.id === playlistId
        ? { ...p, trackIds: p.trackIds.filter(id => id !== trackId) }
        : p
    ));

  return (
    <PlaylistContext.Provider value={{
      playlists, createPlaylist, deletePlaylist, renamePlaylist,
      addToPlaylist, removeFromPlaylist,
    }}>
      {children}
    </PlaylistContext.Provider>
  );
};
