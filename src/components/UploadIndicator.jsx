import React, { useState, useRef, useEffect } from 'react';
import { FaCloudUploadAlt, FaCheckCircle, FaExclamationCircle, FaSpinner, FaTimes, FaClock } from 'react-icons/fa';
import { useUpload, STATUS } from '../context/UploadContext';
import './UploadIndicator.css';

const UploadIndicator = () => {
  const { items, activeCount, doneCount, errorCount, currentItem, hasActivity, clearCompleted, removeItem } = useUpload();
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);

  // Close panel on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Auto-open when upload starts
  useEffect(() => {
    if (activeCount > 0) setOpen(true);
  }, [activeCount > 0]); // eslint-disable-line

  // Auto-clear success after 3 seconds
  useEffect(() => {
    if (activeCount === 0 && errorCount === 0 && doneCount > 0) {
      const t = setTimeout(() => {
        clearCompleted();
        setOpen(false);
      }, 3000);
      return () => clearTimeout(t);
    }
  }, [activeCount, errorCount, doneCount, clearCompleted]);

  if (!hasActivity) return null;

  const isActive = activeCount > 0;

  const StatusIcon = ({ status }) => {
    if (status === STATUS.DONE)      return <FaCheckCircle className="ui-row-icon done" />;
    if (status === STATUS.ERROR)     return <FaExclamationCircle className="ui-row-icon error" />;
    if (status === STATUS.UPLOADING) return <FaSpinner className="ui-row-icon uploading spin" />;
    return <FaClock className="ui-row-icon pending" />;
  };

  const formatSize = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  return (
    <div className="upload-indicator-root" ref={panelRef}>
      {/* Topbar trigger button */}
      <button
        className={`upload-indicator-btn ${isActive ? 'active' : 'idle'}`}
        onClick={() => setOpen(v => !v)}
        aria-label="Upload queue"
        title={isActive ? `Uploading ${activeCount} file${activeCount !== 1 ? 's' : ''}` : 'Upload history'}
      >
        <FaCloudUploadAlt className={`ui-btn-icon ${isActive ? 'spin-slow' : ''}`} />
        {/* Badge */}
        {activeCount > 0 && (
          <span className="ui-badge">{activeCount}</span>
        )}
        {activeCount === 0 && errorCount > 0 && (
          <span className="ui-badge error">{errorCount}</span>
        )}
        {activeCount === 0 && errorCount === 0 && doneCount > 0 && (
          <span className="ui-badge done">✓</span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="ui-panel">
          {/* Panel header */}
          <div className="ui-panel-header">
            <span className="ui-panel-title">
              {isActive
                ? `Uploading ${activeCount} / ${items.length}`
                : `${doneCount} done${errorCount > 0 ? ` · ${errorCount} failed` : ''}`
              }
            </span>
            <div className="ui-panel-actions">
              {doneCount > 0 && (
                <button className="ui-clear-btn" onClick={clearCompleted}>Clear done</button>
              )}
              <button className="ui-close-panel-btn" onClick={() => setOpen(false)}>
                <FaTimes />
              </button>
            </div>
          </div>

          {/* File list */}
          <div className="ui-item-list">
            {items.length === 0 && (
              <div className="ui-empty">Nothing queued</div>
            )}
            {items.map(item => (
              <div key={item.id} className={`ui-item ${item.status}`}>
                <StatusIcon status={item.status} />
                <div className="ui-item-info">
                  <span className="ui-item-name">{item.file.name}</span>
                  {item.status === STATUS.UPLOADING && (
                    <div className="ui-item-progress-track">
                      <div
                        className="ui-item-progress-fill"
                        style={{ width: `${item.progress}%` }}
                      />
                    </div>
                  )}
                  {item.status === STATUS.ERROR && (
                    <span className="ui-item-error">{item.error}</span>
                  )}
                  {(item.status === STATUS.PENDING || item.status === STATUS.DONE) && (
                    <span className="ui-item-size">{formatSize(item.file.size)}</span>
                  )}
                </div>
                {item.status === STATUS.UPLOADING && (
                  <span className="ui-item-pct">{item.progress}%</span>
                )}
                {(item.status === STATUS.DONE || item.status === STATUS.ERROR || item.status === STATUS.PENDING) && (
                  <button
                    className="ui-item-remove"
                    onClick={() => removeItem(item.id)}
                    aria-label="Remove"
                  >
                    <FaTimes />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default UploadIndicator;
