import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { SetupGate } from './components/SetupGate';
import { installRemoteNavigation } from './remoteNavigation';
import './styles.css';
import './media.css';
import './onyx-features.css';
import './remote.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SetupGate><App /></SetupGate>
  </React.StrictMode>,
);

installRemoteNavigation();
