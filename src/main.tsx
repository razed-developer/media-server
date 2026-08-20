import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { FullscreenGuard } from './components/FullscreenGuard';
import { SetupGate } from './components/SetupGate';
import { installRemoteNavigation } from './remoteNavigation';
import './styles.css';
import './media.css';
import './onyx-features.css';
import './libraryCompact.css';
import './liveChannels.css';
import './fullscreen.css';
import './remote.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SetupGate><App /></SetupGate>
    <FullscreenGuard />
  </React.StrictMode>,
);

installRemoteNavigation();
