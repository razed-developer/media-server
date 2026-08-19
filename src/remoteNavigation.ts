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
  return elements.filter((element) => {
    if (!isVisible(element)) return false;
    const card = element.closest<HTMLElement>(CARD_SELECTOR);
    // The whole media card is the remote target; don't make its nested play
    // icon a second stop for the same action.
    if (card && card !== element) return false;
    return true;
  });
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

function selectFocused() {
  const active = document.activeElement;
  if (active instanceof HTMLElement) active.click();
}

function controlVideo(action: 'toggle' | 'left' | 'right' | 'up' | 'down'): boolean {
  const video = activeVideo();
  if (!video) return false;
  const active = document.activeElement;
  if (active !== video && (active instanceof HTMLButtonElement || isTextControl(active))) return false;

  if (action === 'toggle') {
    if (video.paused) void video.play();
    else video.pause();
  } else if (action === 'left') {
    video.currentTime = Math.max(0, video.currentTime - 10);
  } else if (action === 'right') {
    video.currentTime = Math.min(Number.isFinite(video.duration) ? video.duration : video.currentTime + 10, video.currentTime + 10);
  } else if (action === 'up') {
    video.volume = Math.min(1, video.volume + 0.1);
  } else if (action === 'down') {
    video.volume = Math.max(0, video.volume - 0.1);
  }
  return true;
}

function handleVideoRemote(event: KeyboardEvent): boolean {
  if (event.key === 'Enter' || event.key === ' ' || event.key === 'MediaPlayPause' || event.key === 'Select') return controlVideo('toggle');
  if (event.key === 'ArrowLeft') return controlVideo('left');
  if (event.key === 'ArrowRight') return controlVideo('right');
  if (event.key === 'ArrowUp') return controlVideo('up');
  if (event.key === 'ArrowDown') return controlVideo('down');
  return false;
}

function normalizeDirection(key: string): Direction | null {
  if (key === 'ArrowUp' || key === 'Up') return 'up';
  if (key === 'ArrowDown' || key === 'Down') return 'down';
  if (key === 'ArrowLeft' || key === 'Left') return 'left';
  if (key === 'ArrowRight' || key === 'Right') return 'right';
  return null;
}

function onKeyDown(event: KeyboardEvent) {
  if (event.altKey || event.ctrlKey || event.metaKey) return;

  if (['Escape', 'BrowserBack', 'GoBack', 'Back'].includes(event.key) || (event.key === 'Backspace' && !isTextControl(document.activeElement))) {
    if (closeTopLayer()) {
      event.preventDefault();
      event.stopPropagation();
    }
    return;
  }

  if (activeVideo() && handleVideoRemote(event)) {
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

  if (['Enter', ' ', 'Select', 'Accept'].includes(event.key) && active instanceof HTMLElement && active.matches(CARD_SELECTOR)) {
    event.preventDefault();
    active.click();
  }
}

function refreshFocusableElements(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>(`${CARD_SELECTOR}, video`).forEach(prepareElement);
}

function pressed(button: GamepadButton | undefined): boolean {
  return Boolean(button?.pressed || (button?.value ?? 0) > 0.5);
}

function installGamepadNavigation() {
  if (!('getGamepads' in navigator)) return () => {};

  let frame = 0;
  let lastActionAt = 0;
  let previousSelect = false;
  let previousBack = false;
  const repeatMs = 180;

  const tick = (now: number) => {
    const gamepads = navigator.getGamepads?.() ?? [];
    const pad = Array.from(gamepads).find(Boolean);
    if (pad) {
      const up = pressed(pad.buttons[12]) || (pad.axes[1] ?? 0) < -0.65;
      const down = pressed(pad.buttons[13]) || (pad.axes[1] ?? 0) > 0.65;
      const left = pressed(pad.buttons[14]) || (pad.axes[0] ?? 0) < -0.65;
      const right = pressed(pad.buttons[15]) || (pad.axes[0] ?? 0) > 0.65;
      const select = pressed(pad.buttons[0]);
      const back = pressed(pad.buttons[1]) || pressed(pad.buttons[8]);

      if (now - lastActionAt >= repeatMs) {
        const video = activeVideo();
        if (up) {
          if (!(video && controlVideo('up'))) moveFocus('up');
          lastActionAt = now;
        } else if (down) {
          if (!(video && controlVideo('down'))) moveFocus('down');
          lastActionAt = now;
        } else if (left) {
          if (!(video && controlVideo('left'))) moveFocus('left');
          lastActionAt = now;
        } else if (right) {
          if (!(video && controlVideo('right'))) moveFocus('right');
          lastActionAt = now;
        }
      }

      if (select && !previousSelect) {
        if (!(activeVideo() && controlVideo('toggle'))) selectFocused();
      }
      if (back && !previousBack) closeTopLayer();
      previousSelect = select;
      previousBack = back;
    } else {
      previousSelect = false;
      previousBack = false;
    }
    frame = requestAnimationFrame(tick);
  };

  frame = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(frame);
}

export function installRemoteNavigation() {
  refreshFocusableElements();
  document.addEventListener('keydown', onKeyDown, true);
  const stopGamepad = installGamepadNavigation();

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.matches(`${CARD_SELECTOR}, video`)) prepareElement(node);
        refreshFocusableElements(node);

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
    stopGamepad();
    document.removeEventListener('keydown', onKeyDown, true);
  };
}
