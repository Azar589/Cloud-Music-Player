import React, { useEffect, useRef } from 'react';
import { AudioPlayerProvider } from './context/AudioPlayerContext';
import { AppProvider } from './context/AppContext';
import { PlaylistProvider } from './context/PlaylistContext';
import { UploadProvider } from './context/UploadContext';
import { useUpload, STATUS } from './context/UploadContext';
import Sidebar from './components/Sidebar';
import MainView from './components/MainView';
import MobileNavPlayer from './components/MobileNavPlayer';
import './App.css';

import { useAudioPlayer } from './context/AudioPlayerContext';
import { useApp } from './context/AppContext';

// ── Error Boundary ──────────────────────────────────────────────────────────
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('App crashed:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          height: '100vh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: '#0a0a0e', color: '#fff', gap: 16, padding: 24,
        }}>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 700 }}>Something went wrong</h2>
          <p style={{ color: '#a1a1aa', fontSize: '0.9rem', textAlign: 'center', maxWidth: 400 }}>
            {this.state.error?.message || 'An unexpected error occurred.'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              background: '#8b3dff', color: '#fff', border: 'none',
              borderRadius: 8, padding: '10px 24px', cursor: 'pointer',
              fontSize: '0.9rem', fontWeight: 600,
            }}
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Layout (inner — needs context) ─────────────────────────────────────────
const AppLayout = () => {
  const { currentTrack } = useAudioPlayer();
  const { showNowPlaying, refreshLibrary } = useApp();
  const { items } = useUpload();

  // ── Auto-refresh library when any upload finishes ────────────────────────
  // Tracks the previous done count so we only react to NEW completions.
  const prevDoneRef = useRef(0);
  useEffect(() => {
    const doneCount = items.filter(i => i.status === STATUS.DONE).length;
    if (doneCount > prevDoneRef.current) {
      // At least one new file just completed — pull fresh track list
      refreshLibrary?.();
    }
    prevDoneRef.current = doneCount;
  }, [items, refreshLibrary]);

  return (
    <div className={`app-container ${showNowPlaying ? 'np-expanded' : ''}`}>
      {currentTrack?.coverUrl && (
        <div
          className="ambient-bg"
          style={{ backgroundImage: `url(${currentTrack.coverUrl})` }}
        />
      )}
      {!showNowPlaying && <Sidebar />}
      <MainView />
      <MobileNavPlayer />
    </div>
  );
};


// ── Root — ErrorBoundary is INSIDE providers so context is always available ─
export default function App() {
  return (
    <AppProvider>
      <UploadProvider>
        <PlaylistProvider>
          <AudioPlayerProvider>
            <ErrorBoundary>
              <AppLayout />
            </ErrorBoundary>
          </AudioPlayerProvider>
        </PlaylistProvider>
      </UploadProvider>
    </AppProvider>
  );
}