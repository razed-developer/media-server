import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { installRemoteNavigation } from './remoteNavigation';
import './styles.css';
import './media.css';
import './remote.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

installRemoteNavigation();
