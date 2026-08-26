import type { ReactNode } from 'react';

type RailProps = {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  children: ReactNode;
};

export function Rail({ title, actionLabel, onAction, children }: RailProps) {
  return <section className="home-rail"><div className="rail-heading"><h2>{title}</h2>{onAction && <button onClick={onAction}>{actionLabel ?? 'View all'} →</button>}</div><div className="rail-scroll">{children}</div></section>;
}
