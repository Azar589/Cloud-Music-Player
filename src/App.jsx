import React from 'react';
import { AudioPlayerProvider } from './context/AudioPlayerContext';
import { AppProvider } from './context/AppContext';
import { PlaylistProvider } from './context/PlaylistContext';
import Sidebar from './components/Sidebar';
import MainView from './components/MainView';
import './App.css';

import { useAudioPlayer } from './context/AudioPlayerContext';
import { useApp } from './context/AppContext';

const AppLayout = () => {
  const { currentTrack } = useAudioPlayer();
  const { showNowPlaying } = useApp();
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
    </div>
  );
};

export default function App() {
  return (
    <AppProvider>
      <PlaylistProvider>
        <AudioPlayerProvider>
          <AppLayout />
        </AudioPlayerProvider>
      </PlaylistProvider>
    </AppProvider>
  );
}
