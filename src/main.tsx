import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { FullscreenGuard } from './components/FullscreenGuard';
import { LibraryJumpBridge } from './components/LibraryJumpBridge';
import { OnyxDialogProvider } from './components/OnyxDialogProvider';
import { PlayerEpisodeSocial } from './components/PlayerEpisodeSocial';
import { PlayerSubtitleSearch } from './components/PlayerSubtitleSearch';
import { SetupGate } from './components/SetupGate';
import { StartupWarmup } from './components/StartupWarmup';
import { installRemoteNavigation } from './remoteNavigation';
import { installScrollEnhancements } from './scrollEnhancements';
import './styles.css';
import './media.css';
import './onyx-features.css';
import './userFeatures.css';
import './libraryCompact.css';
import './liveChannels.css';
import './fullscreen.css';
import './scrollEnhancements.css';
import './onyxDialogs.css';
import './libraryRoots.css';
import './remote.css';
import './subtitleFinder.css';
import './playbackContinuity.css';
import './startupWarmup.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <OnyxDialogProvider>
      <SetupGate><App /></SetupGate>
      <StartupWarmup />
      <LibraryJumpBridge />
      <FullscreenGuard />
      <PlayerSubtitleSearch />
      <PlayerEpisodeSocial />
    </OnyxDialogProvider>
  </React.StrictMode>,
);

installRemoteNavigation();
installScrollEnhancements();
