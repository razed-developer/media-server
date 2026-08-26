import type { AnalyticsSummary } from '../types';
import { PageHero } from '../components/layout/PageHero';

const formatTime = (seconds: number) => {
  const hours = Math.floor(seconds / 3600), minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
};

function AnalyticsBars({ title, entries }: { title: string; entries: { label: string; seconds: number }[] }) {
  const max = Math.max(1, ...entries.map(entry => entry.seconds));
  return <section className="analytics-panel"><h2>{title}</h2>{entries.length ? entries.map(entry => <div className="analytics-row" key={entry.label}><span>{entry.label}</span><div><i style={{ width: `${entry.seconds / max * 100}%` }} /></div><strong>{formatTime(entry.seconds)}</strong></div>) : <p>No data recorded yet.</p>}</section>;
}

export function AnalyticsPage({ analytics }: { analytics: AnalyticsSummary }) {
  return <div className="analytics-page"><PageHero eyebrow="ANALYTICS" title="Your viewing" subtitle={`${formatTime(analytics.totalSeconds)} watched in this profile`} /><section className="stat-grid"><div><span>Total</span><strong>{formatTime(analytics.totalSeconds)}</strong></div><div><span>Movies</span><strong>{formatTime(analytics.movieSeconds)}</strong></div><div><span>TV</span><strong>{formatTime(analytics.tvSeconds)}</strong></div></section><AnalyticsBars title="TV shows" entries={analytics.shows} /><AnalyticsBars title="Genres" entries={analytics.genres ?? []} />{!analytics.genres?.length && <section className="analytics-note"><h3>Genre metadata</h3><p>Genre analytics populate as movies and shows are matched to a metadata provider.</p></section>}</div>;
}
