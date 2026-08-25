import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Moon, Sunrise } from 'lucide-react';
import { isTauriDesktop } from '../api';

const STORAGE_KEY = 'onyx-sleep-until';
const CHANGE_EVENT = 'onyx-sleep-timer-change';
let audioContext: AudioContext | undefined;
let masterGain: GainNode | undefined;

type Star = { left: string; top: string; size: number; opacity: number; delay: string; duration: string; color: string };
const makeStars = (count: number): Star[] => Array.from({ length: count }, () => {
  const temperature = Math.random();
  return {
    left: `${(Math.random() * 100).toFixed(3)}%`, top: `${(Math.random() * 100).toFixed(3)}%`,
    size: .6 + Math.random() * (Math.random() > .94 ? 3.1 : 1.7), opacity: .25 + Math.random() * .75,
    delay: `${(-Math.random() * 9).toFixed(2)}s`, duration: `${(2.4 + Math.random() * 6.8).toFixed(2)}s`,
    color: temperature > .88 ? '#b9d7ff' : temperature < .1 ? '#ffe2bd' : '#ffffff',
  };
});

function prepareLofi() {
  if (audioContext) return;
  const AudioContextClass = window.AudioContext;
  audioContext = new AudioContextClass();
  masterGain = audioContext.createGain();
  masterGain.gain.value = 0;
  masterGain.connect(audioContext.destination);
  const filter = audioContext.createBiquadFilter();
  filter.type = 'lowpass'; filter.frequency.value = 1050; filter.Q.value = .7;
  filter.connect(masterGain);
  const notes = [130.81, 164.81, 196, 246.94];
  notes.forEach((frequency, index) => {
    const oscillator = audioContext!.createOscillator();
    const gain = audioContext!.createGain();
    oscillator.type = index % 2 ? 'triangle' : 'sine'; oscillator.frequency.value = frequency;
    gain.gain.value = .03; oscillator.connect(gain).connect(filter); oscillator.start();
  });
  const buffer = audioContext.createBuffer(1, audioContext.sampleRate * 2, audioContext.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * .055;
  const noise = audioContext.createBufferSource(); noise.buffer = buffer; noise.loop = true;
  const noiseFilter = audioContext.createBiquadFilter(); noiseFilter.type = 'lowpass'; noiseFilter.frequency.value = 700;
  noise.connect(noiseFilter).connect(masterGain); noise.start();
}

function setLofiVolume(value: number) {
  if (!audioContext || !masterGain) return;
  void audioContext.resume();
  masterGain.gain.cancelScheduledValues(audioContext.currentTime);
  masterGain.gain.linearRampToValueAtTime(value, audioContext.currentTime + 2.5);
}

export function SleepTimer({ projector = false }: { projector?: boolean }) {
  const [until, setUntil] = useState(() => Number(localStorage.getItem(STORAGE_KEY)) || 0);
  const [sleeping, setSleeping] = useState(false);
  const [stars, setStars] = useState<Star[]>([]);
  const timeout = useRef<number | undefined>(undefined);
  const enteredFullscreen = useRef(false);
  const update = (next: number) => {
    setUntil(next);
    if (next) localStorage.setItem(STORAGE_KEY, String(next)); else localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: next }));
  };
  useEffect(() => {
    const changed = (event: Event) => setUntil(Number((event as CustomEvent<number>).detail) || 0);
    window.addEventListener(CHANGE_EVENT, changed);
    return () => window.removeEventListener(CHANGE_EVENT, changed);
  }, []);
  useEffect(() => {
    window.clearTimeout(timeout.current);
    if (!until) return;
    const begin = () => {
      document.body.classList.add('sleep-mode');
      window.dispatchEvent(new CustomEvent('onyx-sleep-mode', { detail: true }));
      document.querySelectorAll<HTMLMediaElement>('video,audio').forEach(media => media.pause());
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
      setStars(makeStars(280)); setSleeping(true); update(0); setLofiVolume(.32);
      if (isTauriDesktop()) void import('@tauri-apps/api/window').then(async ({ getCurrentWindow }) => {
        const win = getCurrentWindow(); enteredFullscreen.current = !(await win.isFullscreen());
        if (enteredFullscreen.current) await win.setFullscreen(true);
      }).catch(() => undefined);
    };
    const remaining = until - Date.now();
    if (remaining <= 0) begin(); else timeout.current = window.setTimeout(begin, remaining);
    return () => window.clearTimeout(timeout.current);
  }, [until]);
  const choose = (minutes: number) => {
    if (!minutes) { update(0); return; }
    prepareLofi(); void audioContext?.resume(); update(minutes < 0 ? Date.now() : Date.now() + minutes * 60_000);
  };
  const wake = () => {
    setSleeping(false); setLofiVolume(0); document.body.classList.remove('sleep-mode');
    window.dispatchEvent(new CustomEvent('onyx-sleep-mode', { detail: false }));
    if (enteredFullscreen.current && isTauriDesktop()) void import('@tauri-apps/api/window').then(({ getCurrentWindow }) => getCurrentWindow().setFullscreen(false)).catch(() => undefined);
    enteredFullscreen.current = false;
  };
  const remainingMinutes = Math.max(0, (until - Date.now()) / 60_000);
  const selectedDuration = !until ? '' : remainingMinutes > 90 ? '120' : remainingMinutes > 45 ? '60' : '30';
  const scene = useMemo(() => sleeping ? <div className="sleep-scene" role="dialog" aria-modal="true" aria-label="Sleep mode">
    <div className="sleep-starfield" aria-hidden="true">{stars.map((star,index)=><i key={index} style={{left:star.left,top:star.top,width:star.size,height:star.size,opacity:star.opacity,animationDelay:star.delay,animationDuration:star.duration,background:star.color}} />)}</div>
    <div className="sleep-nebula sleep-nebula-one" /><div className="sleep-nebula sleep-nebula-two" />
    <div className="sleep-moon" /><div className="sleep-message"><small>ONYX SLEEP MODE</small><h1>Good night</h1><p>Calm sounds will keep playing until you wake Onyx.</p><button autoFocus onClick={wake}><Sunrise size={18} />Wake up</button></div>
  </div> : null,[sleeping,stars]);
  return <>
    <label className={`sleep-timer ${projector ? 'projector-sleep-timer' : ''}`} title="Sleep timer">
      <Moon size={projector ? 17 : 18} />
      <span>{projector ? 'Sleep' : 'Sleep timer'}</span>
      <select value={selectedDuration} onChange={event => choose(Number(event.target.value))}>
        <option value="">Off</option><option value="-1">Now</option><option value="30">30 min</option><option value="60">1 hour</option><option value="120">2 hours</option>
      </select>
    </label>
    {scene&&createPortal(scene,document.body)}
  </>;
}
