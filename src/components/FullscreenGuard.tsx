import { useEffect, useState } from 'react';
import { Minimize2 } from 'lucide-react';
import { isTauriDesktop } from '../api';

export function FullscreenGuard() {
  const [fullscreen, setFullscreenState] = useState(false);

  useEffect(() => {
    if (!isTauriDesktop()) return;
    let disposed = false;

    const currentWindow = async () => (await import('@tauri-apps/api/window')).getCurrentWindow();
    const sync = async () => {
      try {
        const win = await currentWindow();
        const value = await win.isFullscreen();
        if (!disposed) {
          setFullscreenState(value);
          document.body.classList.toggle('app-fullscreen', value);
        }
      } catch { /* desktop window may be closing */ }
    };
    const setFullscreen = async (value: boolean) => {
      const win = await currentWindow();
      await win.setFullscreen(value);
      setFullscreenState(value);
      document.body.classList.toggle('app-fullscreen', value);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'F11') {
        event.preventDefault();
        event.stopPropagation();
        void setFullscreen(!fullscreen);
      } else if (event.key === 'Escape' && fullscreen) {
        event.preventDefault();
        event.stopPropagation();
        void setFullscreen(false);
      }
    };

    void sync();
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('resize', sync);
    return () => {
      disposed = true;
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('resize', sync);
    };
  }, [fullscreen]);

  if (!fullscreen || !isTauriDesktop()) return null;
  return <button className="fullscreen-exit" onClick={async () => {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().setFullscreen(false);
    setFullscreenState(false);
    document.body.classList.remove('app-fullscreen');
  }} title="Exit fullscreen (Esc or F11)"><Minimize2 size={15} />Exit fullscreen</button>;
}
