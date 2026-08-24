import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { BrandingEnhancer } from './components/BrandingEnhancer';
import { FullscreenGuard } from './components/FullscreenGuard';
import { GlobalMediaSearch } from './components/GlobalMediaSearch';
import { HouseholdActivityFeed } from './components/HouseholdActivityFeed';
import { LibraryJumpBridge } from './components/LibraryJumpBridge';
import { OnyxDialogProvider } from './components/OnyxDialogProvider';
import { OnyxVideoControls } from './components/OnyxVideoControls';
import { PerformanceMonitor } from './components/PerformanceMonitor';
import { PlayerEpisodeSocial } from './components/PlayerEpisodeSocial';
import { PlayerPlaybackEnhancer } from './components/PlayerPlaybackEnhancer';
import { PlayerSubtitleSearch } from './components/PlayerSubtitleSearch';
import { QuickLibraryRefresh } from './components/QuickLibraryRefresh';
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
import './liveChannelPicker.css';
import './projectorLive.css';
import './fullscreen.css';
import './scrollEnhancements.css';
import './onyxDialogs.css';
import './libraryRoots.css';
import './remote.css';
import './subtitleFinder.css';
import './playbackContinuity.css';
import './startupWarmup.css';
import './continuityPolish.css';
import './socialDiscovery.css';
import './sleepTimer.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <OnyxDialogProvider>
      <SetupGate><StartupWarmup><App /></StartupWarmup></SetupGate>
      <BrandingEnhancer />
      <QuickLibraryRefresh />
      <LibraryJumpBridge />
      <FullscreenGuard />
      <PlayerPlaybackEnhancer />
      <OnyxVideoControls />
      <PlayerSubtitleSearch />
      <PlayerEpisodeSocial />
      <GlobalMediaSearch />
      <HouseholdActivityFeed />
      <PerformanceMonitor />
    </OnyxDialogProvider>
  </React.StrictMode>,
);

installRemoteNavigation();
installScrollEnhancements();
