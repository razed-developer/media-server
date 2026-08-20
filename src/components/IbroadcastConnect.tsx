import { useEffect, useRef, useState } from 'react';
import { Check, ExternalLink, Link2, LoaderCircle, RefreshCw, Unplug } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { disconnectIbroadcast, getIbroadcastStatus, isTauriDesktop, pollIbroadcastDeviceAuth, startIbroadcastDeviceAuth, syncIbroadcast } from '../api';
import type { IbConnectionStatus, IbDeviceCode } from '../types';

export function IbroadcastConnect({ onConnected }: { onConnected?: () => void }) {
  const [status, setStatus] = useState<IbConnectionStatus | null>(null);
  const [device, setDevice] = useState<IbDeviceCode | null>(null);
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
      setStatus(await getIbroadcastStatus());
    } catch (cause) {
      setError(String(cause));
    }
  };

  useEffect(() => {
    void refresh();
    return stopPolling;
  }, []);

  const openAuthorization = async () => {
    if (!device) return;
    const url = device.verificationUriComplete ?? device.verificationUri;
    try {
      if (isTauriDesktop()) await invoke('open_external_url', { url });
      else window.open(url, '_blank', 'noopener,noreferrer');
    } catch (cause) {
      setError(`Could not open the authorization page automatically. Copy this address into your browser: ${device.verificationUri}\n${String(cause)}`);
    }
  };

  const begin = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const next = await startIbroadcastDeviceAuth();
      setDevice(next);

      const poll = async () => {
        try {
          const result = await pollIbroadcastDeviceAuth(next.deviceCode);
          if (!result.connected) return;
          stopPolling();
          setDevice(null);
          await refresh();
          onConnected?.();
          setNotice('iBroadcast connected. Syncing your music library…');
          try {
            await syncIbroadcast();
            await refresh();
            setNotice('iBroadcast connected and library sync completed.');
          } catch (syncError) {
            setNotice(`iBroadcast connected, but the initial library sync reported a problem. You can use Sync to retry. ${String(syncError)}`);
          }
        } catch (cause) {
          // A token may already have been stored even if a follow-up provider request failed.
          // Check the actual connection state before reporting the authorization as failed.
          try {
            const current = await getIbroadcastStatus();
            setStatus(current);
            if (current.connected) {
              stopPolling();
              setDevice(null);
              setNotice(`iBroadcast connected. A follow-up request reported: ${String(cause)}`);
              onConnected?.();
              return;
            }
          } catch { /* preserve original error below */ }
          stopPolling();
          setError(String(cause));
        }
      };

      timer.current = window.setInterval(() => void poll(), Math.max(2, next.interval) * 1000);
      void poll();
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!window.confirm('Disconnect iBroadcast from this Onyx profile?')) return;
    try {
      await disconnectIbroadcast();
      stopPolling();
      setDevice(null);
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
    return <div className="provider-card provider-warning"><Link2 size={20} /><div><strong>Onyx needs an iBroadcast client ID</strong><p>Add the client ID under Settings → Music. Create the app from iBroadcast’s web player under Apps → developer.</p></div></div>;
  }

  if (status.connected) {
    return <div className="provider-card"><Check size={22} /><div className="provider-grow"><strong>iBroadcast connected</strong><p>{status.providerUser ?? 'This profile'}{status.lastSyncAt ? ` · synced ${new Date(status.lastSyncAt * 1000).toLocaleString()}` : ''}</p>{notice && <p className="muted">{notice}</p>}</div><button onClick={() => void sync()} disabled={busy}><RefreshCw size={16} />Sync</button><button className="danger-text" onClick={() => void disconnect()}><Unplug size={16} />Disconnect</button>{error && <p className="provider-error">{error}</p>}</div>;
  }

  if (device) {
    return <div className="device-auth-card"><p className="eyebrow">CONNECT IBROADCAST</p><h3>Authorize Onyx</h3><p>Open the authorization page on this computer or another device, then enter this code if asked:</p><div className="device-code">{device.userCode}</div><button className="primary" onClick={() => void openAuthorization()}><ExternalLink size={16} />Open authorization page</button><p className="muted selectable-url">{device.verificationUri}</p><p className="muted">Waiting for authorization…</p>{error && <p className="provider-error">{error}</p>}</div>;
  }

  return <div className="provider-card"><Link2 size={22} /><div className="provider-grow"><strong>Connect iBroadcast</strong><p>Music belongs to the current Onyx profile and remains separate from Movies and TV.</p></div><button className="primary" onClick={() => void begin()} disabled={busy}>{busy ? 'Starting…' : 'Connect'}</button>{error && <p className="provider-error">{error}</p>}{notice && <p className="muted">{notice}</p>}</div>;
}
