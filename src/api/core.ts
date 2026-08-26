export const isTauriDesktop = () =>
  Boolean(
    (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__,
  );

export const serverBaseUrl = () =>
  isTauriDesktop() ? "http://127.0.0.1:8765" : "";

export const resolveMediaUrl = (url?: string | null) => {
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url)) return url;
  return `${serverBaseUrl()}${url.startsWith("/") ? url : `/${url}`}`;
};

export let activeUserId =
  localStorage.getItem("onyx-user") ||
  localStorage.getItem("home-media-user") ||
  "owner";

export const getActiveUserId = () => activeUserId;

export const setActiveUserId = (id: string) => {
  activeUserId = id;
  localStorage.setItem("onyx-user", id);
};

const userHeaders = (extra: Record<string, string> = {}) => ({
  "x-home-media-user": activeUserId,
  ...extra,
});

export const browserFetch = (input: string, init?: RequestInit) =>
  fetch(input, {
    ...init,
    credentials: "include",
    headers: {
      ...userHeaders(),
      ...((init?.headers as Record<string, string> | undefined) ?? {}),
    },
  });

export async function json<T>(
  response: Response,
  message: string,
): Promise<T> {
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `${message} (${response.status})`);
  }
  return response.json();
}
