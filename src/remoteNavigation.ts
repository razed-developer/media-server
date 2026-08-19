type Direction = 'up' | 'down' | 'left' | 'right';

const CARD_SELECTOR = '.media-card';
const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'video',
  '[tabindex]:not([tabindex="-1"])',
  CARD_SELECTOR,
].join(',');

function isVisible(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
}

function prepareElement(element: HTMLElement) {
  if (element.matches(CARD_SELECTOR)) {
    if (!element.hasAttribute('tabindex')) element.tabIndex = 0;
    if (!element.hasAttribute('role')) element.setAttribute('role', 'button');
  }
  if (element instanceof HTMLVideoElement && !element.hasAttribute('tabindex')) {
    element.tabIndex = 0;
  }
}

function focusables(): HTMLElement[] {
  const elements = Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  elements.forEach(prepareElement);
  return elements.filter(isVisible);
}

function center(rect: DOMRect) {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function directionalScore(from: HTMLElement, to: HTMLElement, direction: Direction): number | null {
  const a = center(from.getBoundingClientRect());
  const b = center(to.getBoundingClientRect());
  const dx = b.x - a.x;
  const dy = b.y - a.y;

  let primary = 0;
  let secondary = 0;
  switch (direction) {
    case 'left':
      if (dx >= -2) return null;
      primary = -dx;
      secondary = Math.abs(dy);
      break;
    case 'right':
      if (dx <= 2) return null;
      primary = dx;
      secondary = Math.abs(dy);
      break;
    case 'up':
      if (dy >= -2) return null;
      primary = -dy;
      secondary = Math.abs(dx);
      break;
    case 'down':
      if (dy <= 2) return null;
      primary = dy;
      secondary = Math.abs(dx);
      break;
  }

  // Prefer the nearest element in the requested direction while heavily
  // favouring candidates aligned with the current row/column.
  return primary + secondary * 2.75;
}

function moveFocus(direction: Direction) {
  const candidates = focusables();
  if (!candidates.length) return;

  const active = document.activeElement instanceof HTMLElement && isVisible(document.activeElement)
    ? document.activeElement
    : null;

  if (!active || !candidates.includes(active)) {
    const first = candidates.find((element) => !element.closest('.sidebar')) ?? candidates[0];
    first.focus({ preventScroll: true });
    first.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    return;
  }

  let best: HTMLElement | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    if (candidate === active) continue;
    const score = directionalScore(active, candidate, direction);
    if (score != null && score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  if (best) {
    best.focus({ preventScroll: true });
    best.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }
}

function isTextControl(element: Element | null): boolean {
  return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement;
}

function activeVideo(): HTMLVideoElement | null {
  return document.querySelector<HTMLVideoElement>('.player-overlay video');
}

function closeTopLayer(): boolean {
  const player = document.querySelector<HTMLElement>('.player-overlay');
  if (player) {
    const close = Array.from(player.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.textContent?.trim().toLowerCase() === 'close');
    if (close) close.click();
    else player.click();
    return true;
  }

  const focused = document.activeElement;
  if (isTextControl(focused)) {
    (focused as HTMLElement).blur();
    return true;
  }
  return false;
}

function handleVideoRemote(event: KeyboardEvent, video: HTMLVideoElement): boolean {
  const active = document.activeElement;
  if (active !== video && (active instanceof HTMLButtonElement || isTextControl(active))) return false;

  switch (event.key) {
    case 'Enter':
    case ' ':
    case 'MediaPlayPause':
      if (video.paused) void video.play();
      else video.pause();
      return true;
    case 'ArrowLeft':
      video.currentTime = Math.max(0, video.currentTime - 10);
      return true;
    case 'ArrowRight':
      video.currentTime = Math.min(Number.isFinite(video.duration) ? video.duration : video.currentTime + 10, video.currentTime + 10);
      return true;
    case 'ArrowUp':
      video.volume = Math.min(1, video.volume + 0.1);
      return true;
    case 'ArrowDown':
      video.volume = Math.max(0, video.volume - 0.1);
      return true;
    default:
      return false;
  }
}

function normalizeDirection(key: string): Direction | null {
  if (key === 'ArrowUp') return 'up';
  if (key === 'ArrowDown') return 'down';
  if (key === 'ArrowLeft') return 'left';
  if (key === 'ArrowRight') return 'right';
  return null;
}

function onKeyDown(event: KeyboardEvent) {
  if (event.altKey || event.ctrlKey || event.metaKey) return;

  if (['Escape', 'BrowserBack', 'GoBack'].includes(event.key) || (event.key === 'Backspace' && !isTextControl(document.activeElement))) {
    if (closeTopLayer()) {
      event.preventDefault();
      event.stopPropagation();
    }
    return;
  }

  const video = activeVideo();
  if (video && handleVideoRemote(event, video)) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }

  const active = document.activeElement;
  const direction = normalizeDirection(event.key);
  if (direction && !isTextControl(active) && !(active instanceof HTMLVideoElement)) {
    event.preventDefault();
    moveFocus(direction);
    return;
  }

  if ((event.key === 'Enter' || event.key === ' ') && active instanceof HTMLElement && active.matches(CARD_SELECTOR)) {
    event.preventDefault();
    active.click();
  }
}

function refreshFocusableElements(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>(`${CARD_SELECTOR}, video`).forEach(prepareElement);
}

export function installRemoteNavigation() {
  refreshFocusableElements();
  document.addEventListener('keydown', onKeyDown, true);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.matches(`${CARD_SELECTOR}, video`)) prepareElement(node);
        refreshFocusableElements(node);

        // When a player opens, put remote focus directly on the video.
        const video = node.matches('.player-overlay')
          ? node.querySelector<HTMLVideoElement>('video')
          : node.querySelector<HTMLVideoElement>('.player-overlay video');
        if (video) requestAnimationFrame(() => video.focus({ preventScroll: true }));
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  return () => {
    observer.disconnect();
    document.removeEventListener('keydown', onKeyDown, true);
  };
}
