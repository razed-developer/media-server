import { Check } from 'lucide-react';

export function ProgressLine({ value }: { value: number }) {
  return <div className="mini-progress"><span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>;
}

export function WatchedBadge({ done }: { done: boolean }) {
  return done ? <span className="watched-badge" title="Watched"><Check size={13} /></span> : null;
}
