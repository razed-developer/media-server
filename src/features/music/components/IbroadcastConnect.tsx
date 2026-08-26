import { useEffect, useRef, useState } from 'react';
import { Check, ExternalLink, Link2, LoaderCircle, RefreshCw, Unplug } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { disconnectIbroadcast, getActiveUserId, getIbroadcastStatus, isTauriDesktop, syncIbroadcast } from '../../../api';
import type { IbConnectionStatus } from '../../../types';

interface AuthorizationStart {
  authorizationUrl: string;
  redirectUri: string;
}

export function IbroadcastConnect({ onConnected }: { onConnected?: () => void }) {
  const [status, setStatus] = useState<IbConnectionStatus | null>(null);
  const [authorization, setAuthorization] = useState<AuthorizationStart | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<number | null>(null);

  const stopPolling = () => {
    if (timer.current !== null) window.clearInterval(timer.current);
    timer.current = null;
  };

  const refresh = async () => {
    try {
      const next = await getIbroadcastStatus();
      setStatus(next);
      return next;
    } catch (cause) {
      setError(String(cause));
      return null;
    }
  };

  useEffect(() => {
    void refresh();
    return stopPolling;
  }, []);

  const openAuthorization = async (url: string) => {
    try {
      if (isTauriDesktop()) await invoke('open_external_url', { url });
      else window.open(url, '_blank', 'noopener,noreferrer');
    } catch (cause) {
      setError(`Could not open the authorization page automatically. Copy this address into your browser: ${url}\n${String(cause)}`);
    }
  };

  const begin = async () => {
    if (!isTauriDesktop()) {
      setError('Connect iBroadcast from the Onyx desktop/server app.');
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const next = await invoke<AuthorizationStart>('ibroadcast_authorization_start', { userId: getActiveUserId() });
      setAuthorization(next);
      setNotice('Your browser will open for iBroadcast authorization. Return to Onyx after approving access.');
      await openAuthorization(next.authorizationUrl);

      const startedAt = Date.now();
      const poll = async () => {
        const current = await refresh();
        if (current?.connected) {
          stopPolling();
          setAuthorization(null);
          setNotice('iBroadcast connected. Syncing your music library…');
          onConnected?.();
          try {
            await syncIbroadcast();
            await refresh();
            setNotice('iBroadcast connected and library sync completed.');
          } catch (syncError) {
            setNotice(`iBroadcast connected, but the initial library sync reported a problem. You can use Sync to retry. ${String(syncError)}`);
          }
          return;
        }
        if (Date.now() - startedAt > 5 * 60 * 1000) {
          stopPolling();
          setAuthorization(null);
          setError('iBroadcast authorization timed out. Click Connect to try again.');
        }
      };
      timer.current = window.setInterval(() => void poll(), 1200);
      void poll();
    } catch (cause) {
      setError(String(cause));
      setAuthorization(null);
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!window.confirm('Disconnect iBroadcast from this Onyx profile?')) return;
    try {
      await disconnectIbroadcast();
      stopPolling();
      setAuthorization(null);
      setNotice(null);
      await refresh();
      onConnected?.();
    } catch (cause) {
      setError(String(cause));
    }
  };

  const sync = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await syncIbroadcast();
      await refresh();
      setNotice('iBroadcast library sync completed.');
      onConnected?.();
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  };

  if (!status) {
    return <div className="provider-card"><LoaderCircle className="spin" size={20} /> Checking iBroadcast…</div>;
  }

  if (!status.configured) {
    return <div className="provider-card provider-warning"><Link2 size={20} /><div><strong>Onyx needs an iBroadcast client ID</strong><p>Add the Client ID under Settings → Music. Configure the iBroadcast developer app for <strong>Authorization Code</strong> with redirect URI <code>http://127.0.0.1:8770/oauth/ibroadcast/callback</code>.</p></div></div>;
  }

  if (status.connected) {
    return <div className="provider-card"><Check size={22} /><div className="provider-grow"><strong>iBroadcast connected</strong><p>{status.providerUser ?? 'This profile'}{status.lastSyncAt ? ` · synced ${new Date(status.lastSyncAt * 1000).toLocaleString()}` : ''}</p>{notice && <p className="muted">{notice}</p>}</div><button onClick={() => void sync()} disabled={busy}><RefreshCw size={16} />Sync</button><button className="danger-text" onClick={() => void disconnect()}><Unplug size={16} />Disconnect</button>{error && <p className="provider-error">{error}</p>}</div>;
  }

  if (authorization) {
    return <div className="device-auth-card"><p className="eyebrow">CONNECT IBROADCAST</p><h3>Authorize Onyx in your browser</h3><p>iBroadcast should now be open in your browser. Approve access and it will redirect to Onyx automatically.</p><button className="primary" onClick={() => void openAuthorization(authorization.authorizationUrl)}><ExternalLink size={16} />Open authorization page</button><p className="muted">Waiting for the callback at:</p><p className="muted selectable-url">{authorization.redirectUri}</p><p className="muted">You can leave this screen open while authorizing.</p>{notice && <p className="muted">{notice}</p>}{error && <p className="provider-error">{error}</p>}</div>;
  }

  return <div className="provider-card"><Link2 size={22} /><div className="provider-grow"><strong>Connect iBroadcast</strong><p>Uses Authorization Code + PKCE. Music belongs to the current Onyx profile and remains separate from Movies and TV.</p><p className="muted">Developer app Redirect URI: <code>http://127.0.0.1:8770/oauth/ibroadcast/callback</code></p></div><button className="primary" onClick={() => void begin()} disabled={busy}>{busy ? 'Starting…' : 'Connect'}</button>{error && <p className="provider-error">{error}</p>}{notice && <p className="muted">{notice}</p>}</div>;
}
