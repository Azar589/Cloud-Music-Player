// ── Upload Context ─────────────────────────────────────────────────────────
// Global background upload queue. Survives modal open/close.
// Processes files sequentially so the Worker isn't overwhelmed.
// ──────────────────────────────────────────────────────────────────────────

import React, { createContext, useContext, useState, useRef, useCallback } from 'react';
import { uploadTrack } from '../services/UploadService';
import { useApp } from './AppContext';

export const STATUS = {
  PENDING:   'pending',
  UPLOADING: 'uploading',
  DONE:      'done',
  ERROR:     'error',
};

const UploadContext = createContext(null);
export const useUpload = () => useContext(UploadContext);

export const UploadProvider = ({ children }) => {
  const { allTracks } = useApp();
  const [items, setItems] = useState([]);
  // itemsRef mirrors state so async callbacks never see stale values
  const itemsRef      = useRef([]);
  const runningRef    = useRef(false);
  const allTracksRef  = useRef(allTracks);

  // Keep allTracksRef in sync without triggering re-creation of stable functions
  React.useEffect(() => {
    allTracksRef.current = allTracks;
  }, [allTracks]);

  // ── Sync helper: keeps ref + state in lock-step ────────────────────────
  const patch = useCallback((updater) => {
    setItems(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      itemsRef.current = next;
      return next;
    });
  }, []);

  const patchItem = useCallback((id, changes) => {
    patch(prev => prev.map(i => (i.id === id ? { ...i, ...changes } : i)));
  }, [patch]);

  // ── Sequential processor ───────────────────────────────────────────────
  const processNext = useCallback(async () => {
    if (runningRef.current) return;

    const next = itemsRef.current.find(i => i.status === STATUS.PENDING);
    if (!next) return;

    runningRef.current = true;
    patchItem(next.id, { status: STATUS.UPLOADING });

    try {
      await uploadTrack({
        file:          next.file,
        folderId:      next.folderId,
        adminSecret:   next.adminSecret,
        onProgress:    (pct) => patchItem(next.id, { progress: pct }),
        onStatusChange: () => {},
      });
      patchItem(next.id, { status: STATUS.DONE, progress: 100 });
    } catch (err) {
      patchItem(next.id, { status: STATUS.ERROR, error: err.message });
    }

    runningRef.current = false;
    processNext();           // chain to next pending item
  }, [patchItem]);

  // ── Public API ─────────────────────────────────────────────────────────
  const enqueue = useCallback((files, folderId, adminSecret) => {
    const ALLOWED = ['mp3', 'flac', 'wav', 'ogg', 'm4a', 'aac'];
    const entries = Array.from(files).map(file => {
      const ext   = file.name.split('.').pop().toLowerCase();
      const valid = ALLOWED.includes(ext);
      
      const safeName = file.name.replace(/[^\w\s.\-()[\]]/g, '_');
      const expectedKey = folderId && folderId !== 'root' ? `${folderId}/${safeName}` : safeName;
      
      const isDuplicateInCloud = allTracksRef.current.some(t => t.id === expectedKey);
      const isDuplicateInQueue = itemsRef.current.some(i => 
        i.status !== STATUS.DONE && i.file.name === file.name && i.file.size === file.size
      );

      let initialStatus = valid ? STATUS.PENDING : STATUS.ERROR;
      let initialError  = valid ? null : `".${ext}" not allowed`;
      
      if (valid && (isDuplicateInCloud || isDuplicateInQueue)) {
        initialStatus = STATUS.ERROR;
        initialError = isDuplicateInCloud ? 'Already exists in cloud' : 'Already in upload queue';
      }

      return {
        id:          `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
        file,
        folderId,
        adminSecret,
        status:   initialStatus,
        progress: 0,
        error:    initialError,
      };
    });

    patch(prev => {
      // De-duplicate by name + size
      const seen = new Set(prev.map(e => `${e.file.name}-${e.file.size}`));
      const fresh = entries.filter(e => !seen.has(`${e.file.name}-${e.file.size}`));
      return [...prev, ...fresh];
    });

    // Kick off after state update settles
    setTimeout(processNext, 0);
  }, [patch, processNext]); // allTracks removed from deps to keep enqueue stable

  const retryErrors = useCallback((adminSecret) => {
    patch(prev => prev.map(i =>
      i.status === STATUS.ERROR
        ? { ...i, status: STATUS.PENDING, progress: 0, error: null, adminSecret: adminSecret || i.adminSecret }
        : i
    ));
    setTimeout(processNext, 0);
  }, [patch, processNext]);

  const removeItem = useCallback((id) => {
    patch(prev => prev.filter(i => i.id !== id));
  }, [patch]);

  const clearCompleted = useCallback(() => {
    patch(prev => prev.filter(i => i.status !== STATUS.DONE));
  }, [patch]);

  // ── Derived values for indicator ───────────────────────────────────────
  const activeCount  = items.filter(i => i.status === STATUS.PENDING || i.status === STATUS.UPLOADING).length;
  const doneCount    = items.filter(i => i.status === STATUS.DONE).length;
  const errorCount   = items.filter(i => i.status === STATUS.ERROR).length;
  const currentItem  = items.find(i => i.status === STATUS.UPLOADING);
  const hasActivity  = items.length > 0;

  return (
    <UploadContext.Provider value={{
      items, enqueue, retryErrors, removeItem, clearCompleted,
      activeCount, doneCount, errorCount, currentItem, hasActivity,
    }}>
      {children}
    </UploadContext.Provider>
  );
};
