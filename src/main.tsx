import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { FullscreenGuard } from './components/FullscreenGuard';
import { OnyxDialogProvider } from './components/OnyxDialogProvider';
import { SetupGate } from './components/SetupGate';
import { installRemoteNavigation } from './remoteNavigation';
import { installScrollEnhancements } from './scrollEnhancements';
import './styles.css';
import './media.css';
import './onyx-features.css';
import './libraryCompact.css';
import './liveChannels.css';
import './fullscreen.css';
import './scrollEnhancements.css';
import './onyxDialogs.css';
import './libraryRoots.css';
import './remote.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <OnyxDialogProvider>
      <SetupGate><App /></SetupGate>
      <FullscreenGuard />
    </OnyxDialogProvider>
  </React.StrictMode>,
);

installRemoteNavigation();
installScrollEnhancements();
