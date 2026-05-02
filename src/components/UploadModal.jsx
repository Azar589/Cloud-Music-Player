import React, { useState, useRef, useCallback } from 'react';
import { FaTimes, FaCloudUploadAlt } from 'react-icons/fa';
import { useUpload } from '../context/UploadContext';
import './UploadModal.css';

const ADMIN_SECRET_KEY = 'drivemusic_admin_secret';

const UploadModal = ({ folderId, folderName, onClose }) => {
  const { enqueue } = useUpload();
  const [files, setFiles]       = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [adminSecret, setAdminSecret] = useState(
    () => localStorage.getItem(ADMIN_SECRET_KEY) || ''
  );
  const [secretError, setSecretError] = useState(false);
  const fileInputRef = useRef(null);

  const addFiles = useCallback((newFiles) => {
    setFiles(prev => {
      const seen = new Set(prev.map(f => `${f.name}-${f.size}`));
      const fresh = Array.from(newFiles).filter(f => !seen.has(`${f.name}-${f.size}`));
      return [...prev, ...fresh];
    });
  }, []);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  };

  const removeFile = (idx) =>
    setFiles(prev => prev.filter((_, i) => i !== idx));

  const handleStart = () => {
    if (!adminSecret.trim()) { setSecretError(true); return; }
    setSecretError(false);
    localStorage.setItem(ADMIN_SECRET_KEY, adminSecret.trim());
    enqueue(files, folderId, adminSecret.trim());
    onClose();  // close modal — uploads continue in background
  };

  const formatSize = (bytes) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  return (
    <div className="upload-modal-backdrop" onClick={onClose}>
      <div className="upload-modal" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="upload-modal-header">
          <div className="upload-modal-title">
            <FaCloudUploadAlt className="upload-title-icon" />
            <span>Upload to <strong>{folderName}</strong></span>
          </div>
          <button className="upload-close-btn" onClick={onClose} aria-label="Close">
            <FaTimes />
          </button>
        </div>

        <div className="upload-modal-body">
          {/* Drop zone */}
          <div
            className={`upload-dropzone ${dragOver ? 'drag-over' : ''} ${files.length ? 'compact' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*,.mp3,.flac,.wav,.ogg,.m4a,.aac"
              multiple
              style={{ 
                opacity: 0, 
                position: 'absolute', 
                pointerEvents: 'none', 
                width: '1px', 
                height: '1px' 
              }}
              onChange={(e) => e.target.files.length && addFiles(e.target.files)}
            />
            {files.length === 0 ? (
              <div className="upload-dropzone-hint">
                <FaCloudUploadAlt className="upload-drop-icon" />
                <span className="upload-drop-text">Drop audio files here</span>
                <span className="upload-drop-sub">or click to browse — multiple files supported</span>
                <span className="upload-drop-formats">MP3 · FLAC · WAV · OGG · M4A · AAC</span>
              </div>
            ) : (
              <div className="upload-add-more">
                <FaCloudUploadAlt />
                <span>Add more files ({files.length} selected)</span>
              </div>
            )}
          </div>

          {/* Selected files list */}
          {files.length > 0 && (
            <div className="upload-file-list">
              <div className="upload-summary-bar">
                <span className="upload-summary-text">
                  {files.length} file{files.length !== 1 ? 's' : ''} selected
                </span>
                <button className="upload-clear-all" onClick={() => setFiles([])}>
                  Clear all
                </button>
              </div>
              <div className="upload-file-rows">
                {files.map((f, idx) => (
                  <div key={`${f.name}-${idx}`} className="upload-file-row pending">
                    <span className="upload-file-emoji">🎵</span>
                    <div className="upload-file-row-info">
                      <span className="upload-file-name">{f.name}</span>
                      <span className="upload-file-size">{formatSize(f.size)}</span>
                    </div>
                    <button
                      className="upload-file-remove"
                      onClick={() => removeFile(idx)}
                      aria-label="Remove"
                    >
                      <FaTimes />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Admin secret */}
          <div className="upload-secret-row">
            <label className="upload-secret-label" htmlFor="upload-admin-secret">
              Admin Secret
            </label>
            <input
              id="upload-admin-secret"
              type="password"
              className={`upload-secret-input ${secretError ? 'input-error' : ''}`}
              placeholder="Your ADMIN_SECRET from Worker env"
              value={adminSecret}
              onChange={(e) => { setAdminSecret(e.target.value); setSecretError(false); }}
              autoComplete="current-password"
            />
            {secretError && (
              <span className="upload-secret-error">Admin secret is required</span>
            )}
          </div>

          {/* Info note */}
          <div className="upload-bg-note">
            <span>⚡</span>
            <span>Uploads continue in the background — you can close this and track progress via the topbar indicator.</span>
          </div>
        </div>

        {/* Footer */}
        <div className="upload-modal-footer">
          <button className="upload-btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className="upload-btn-primary"
            onClick={handleStart}
            disabled={files.length === 0}
          >
            Upload {files.length > 0 ? `${files.length} file${files.length !== 1 ? 's' : ''}` : ''}
          </button>
        </div>
      </div>
    </div>
  );
};

export default UploadModal;
