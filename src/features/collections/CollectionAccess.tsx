import { useState } from 'react';
import { KeyRound, Lock } from 'lucide-react';

export function ProtectedCollectionGate({ name, onUnlock }: { name: string; onUnlock: (pin: string) => Promise<void> }) {
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const submit = async () => { if (pin.length < 4 || busy) return; setBusy(true); setMessage(''); try { await onUnlock(pin); setPin(''); } catch { setMessage('That PIN did not unlock this collection.'); } finally { setBusy(false); } };
  return <section className="collection-lock-gate"><Lock size={38} /><p className="eyebrow">PROTECTED COLLECTION</p><h1>{name}</h1><p>Enter the PIN to view this source.</p><div className="collection-pin-dots" aria-label={`${pin.length} PIN digits entered`}>{Array.from({ length: Math.max(4, pin.length) }, (_, index) => <i key={index} className={index < pin.length ? 'filled' : ''} />)}</div><div className="collection-pin-pad">{[1,2,3,4,5,6,7,8,9].map(value => <button key={value} onClick={() => setPin(current => current.length < 12 ? `${current}${value}` : current)}>{value}</button>)}<button onClick={() => setPin(current => current.slice(0, -1))}>⌫</button><button onClick={() => setPin(current => current.length < 12 ? `${current}0` : current)}>0</button><button className="pin-enter" disabled={pin.length < 4 || busy} onClick={() => void submit()}><KeyRound size={18} /></button></div>{message && <div className="login-error">{message}</div>}<small>It relocks after 30 minutes without playback.</small></section>;
}

export function CollectionRelockIndicator({ name, idleSince }: { name: string; idleSince: number }) {
  const remaining = Math.max(0, 30 * 60 - Math.floor((Date.now() - idleSince) / 1000));
  return <div className="collection-relock-indicator"><Lock size={14} /><span><strong>{name}</strong> relocks in {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}</span></div>;
}
