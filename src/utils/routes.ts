export const profileSlug = (name: string) => name.trim().toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const routeSlug = () => window.location.pathname.split('/').filter(Boolean)[0]?.toLowerCase() ?? '';
export const projectorProfileSlug = () => routeSlug().startsWith('live-') ? routeSlug().slice(5) : undefined;
export const requestedProfileSlug = () => (projectorProfileSlug() ?? routeSlug()) || undefined;
