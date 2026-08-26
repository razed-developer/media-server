import { Expand, Maximize2, Minus, X } from 'lucide-react';

export function WindowBar() {
  const run = async (action: 'minimize' | 'maximize' | 'fullscreen' | 'close') => {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const win = getCurrentWindow();
    if (action === 'minimize') await win.minimize();
    else if (action === 'maximize') await win.toggleMaximize();
    else if (action === 'close') await win.close();
    else {
      const next = !(await win.isFullscreen());
      await win.setFullscreen(next);
      document.body.classList.toggle('app-fullscreen', next);
    }
  };
  return <div className="window-bar" data-tauri-drag-region onDoubleClick={() => void run('maximize')}><div className="window-drag" data-tauri-drag-region>Onyx</div><div className="window-controls"><button aria-label="Minimize" onClick={() => void run('minimize')}><Minus size={13} /></button><button aria-label="Maximize" onClick={() => void run('maximize')}><Maximize2 size={12} /></button><button aria-label="Fullscreen" onClick={() => void run('fullscreen')}><Expand size={12} /></button><button className="window-close" aria-label="Close" onClick={() => void run('close')}><X size={13} /></button></div></div>;
}
