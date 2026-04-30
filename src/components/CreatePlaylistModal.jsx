import React, { useState } from 'react';
import { FaTimes, FaListUl } from 'react-icons/fa';
import './CreateFolderModal.css'; // Re-use the same styling for consistency

const CreatePlaylistModal = ({ onClose, onCreated }) => {
  const [name, setName] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const handleCreate = () => {
    if (!name.trim()) {
      setErrorMsg('Playlist name is required.');
      return;
    }
    onCreated?.(name.trim());
    onClose();
  };

  return (
    <div className="cf-backdrop" onClick={onClose}>
      <div className="cf-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cf-header">
          <div className="cf-title">
            <FaListUl className="cf-title-icon" />
            <span>New Playlist</span>
          </div>
          <button className="cf-close-btn" onClick={onClose} aria-label="Close">
            <FaTimes />
          </button>
        </div>

        <div className="cf-body">
          <label className="cf-label" htmlFor="cp-name-input">Playlist Name</label>
          <input
            id="cp-name-input"
            className="cf-input"
            type="text"
            placeholder="e.g. Chill Vibes, Gym Pump, Night Drive"
            value={name}
            onChange={(e) => { setName(e.target.value); setErrorMsg(''); }}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            autoFocus
            maxLength={50}
          />

          {errorMsg && (
            <div className="cf-error">{errorMsg}</div>
          )}
        </div>

        <div className="cf-footer">
          <button className="cf-btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className="cf-btn-primary"
            onClick={handleCreate}
            disabled={!name.trim()}
          >
            Create Playlist
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreatePlaylistModal;
