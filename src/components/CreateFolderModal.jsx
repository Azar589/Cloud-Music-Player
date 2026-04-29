import React, { useState } from 'react';
import { FaTimes, FaFolderPlus } from 'react-icons/fa';
import { WORKER_URL } from '../services/R2Service';
import './CreateFolderModal.css';

const ADMIN_SECRET_KEY = 'drivemusic_admin_secret';

const FOLDER_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9 _\-()[\]]{0,49}$/;

const CreateFolderModal = ({ onClose, onCreated }) => {
  const [name, setName]         = useState('');
  const [adminSecret, setAdminSecret] = useState(
    () => localStorage.getItem(ADMIN_SECRET_KEY) || ''
  );
  const [phase, setPhase]       = useState('idle'); // idle | creating | done | error
  const [errorMsg, setErrorMsg] = useState('');

  const validate = () => {
    if (!name.trim()) return 'Folder name is required.';
    if (!FOLDER_NAME_RE.test(name.trim()))
      return 'Use only letters, numbers, spaces, hyphens, or underscores.';
    if (!adminSecret.trim()) return 'Admin secret is required.';
    return null;
  };

  const handleCreate = async () => {
    const err = validate();
    if (err) { setErrorMsg(err); return; }

    const safeName = name.trim();
    localStorage.setItem(ADMIN_SECRET_KEY, adminSecret.trim());
    setPhase('creating');
    setErrorMsg('');

    try {
      // Create a placeholder file "_keep" inside the folder prefix in R2.
      // The Worker reads R2 prefixes dynamically — any audio file uploaded
      // to "FolderName/" will make it appear as a folder.
      // We use the /api/upload/stream endpoint with a tiny placeholder
      // so the folder prefix is created immediately.
      const placeholder = new Blob([''], { type: 'text/plain' });
      const key = `${safeName}/_keep`;

      const res = await fetch(
        `${WORKER_URL}/folders/create`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Admin-Secret': adminSecret.trim(),
          },
          body: JSON.stringify({ name: safeName }),
        }
      );

      if (res.status === 401) throw new Error('Invalid admin secret.');
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Error ${res.status}: ${text}`);
      }

      setPhase('done');
      setTimeout(() => { onCreated?.(); onClose(); }, 900);
    } catch (e) {
      setErrorMsg(e.message);
      setPhase('error');
    }
  };

  return (
    <div className="cf-backdrop" onClick={onClose}>
      <div className="cf-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="cf-header">
          <div className="cf-title">
            <FaFolderPlus className="cf-title-icon" />
            <span>New Folder</span>
          </div>
          <button className="cf-close-btn" onClick={onClose} aria-label="Close">
            <FaTimes />
          </button>
        </div>

        <div className="cf-body">
          <label className="cf-label" htmlFor="cf-name-input">Folder Name</label>
          <input
            id="cf-name-input"
            className="cf-input"
            type="text"
            placeholder="e.g. Hi-Res, Classical, Favourites"
            value={name}
            onChange={(e) => { setName(e.target.value); setErrorMsg(''); }}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            autoFocus
            maxLength={50}
            disabled={phase === 'creating' || phase === 'done'}
          />

          <label className="cf-label" htmlFor="cf-secret-input">Admin Secret</label>
          <input
            id="cf-secret-input"
            className="cf-input"
            type="password"
            placeholder="Your ADMIN_SECRET from Worker env"
            value={adminSecret}
            onChange={(e) => { setAdminSecret(e.target.value); setErrorMsg(''); }}
            autoComplete="current-password"
            disabled={phase === 'creating' || phase === 'done'}
          />

          {errorMsg && (
            <div className="cf-error">{errorMsg}</div>
          )}

          {phase === 'done' && (
            <div className="cf-success">✅ Folder "{name.trim()}" created!</div>
          )}
        </div>

        <div className="cf-footer">
          <button className="cf-btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className="cf-btn-primary"
            onClick={handleCreate}
            disabled={phase === 'creating' || phase === 'done' || !name.trim()}
          >
            {phase === 'creating' ? 'Creating…' : 'Create Folder'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateFolderModal;
