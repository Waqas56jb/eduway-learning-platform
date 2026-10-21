import { AnimatePresence, motion } from 'framer-motion';
import {
  Check,
  Gauge,
  Loader2,
  Maximize,
  Minimize,
  Pause,
  Play,
  RotateCcw,
  Settings2,
  Volume1,
  Volume2,
  VolumeX,
  VideoOff,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useStudent } from '@/hooks/useProgress';
import { clamp, cn, formatClock } from '@/lib/utils';

const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2] as const;
const QUALITIES = ['auto', '1080p', '720p', '480p', '360p'] as const;
type Quality = (typeof QUALITIES)[number];
type Menu = 'speed' | 'quality' | null;

/**
 * Public, hotlink-friendly backups tried in order when a lesson's own source fails
 * (e.g. the sample CDN is unreachable), so the demo never shows a dead player.
 */
const FALLBACK_SOURCES = [
  'https://upload.wikimedia.org/wikipedia/commons/transcoded/c/c0/Big_Buck_Bunny_4K.webm/Big_Buck_Bunny_4K.webm.720p.vp9.webm',
  'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
];

interface VideoPlayerProps {
  lessonId: string;
  src: string;
  poster: string;
  title: string;
  /** Duration from the catalogue, shown until the real metadata loads. */
  durationHint?: number;
  onEnded?: () => void;
  className?: string;
}

/**
 * HTML5 video with a fully custom, keyboard-accessible control bar.
 * Remount per lesson (`key={lessonId}`) — the saved position is read once on mount.
 */
export function VideoPlayer({ lessonId, src, poster, title, durationHint = 0, onEnded, className }: VideoPlayerProps) {
  const { t } = useTranslation();
  const { getLessonProgress, saveVideoPosition } = useStudent();

  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<number>();
  const qualityTimer = useRef<number>();
  const hasPlayed = useRef(false);
  const savedAt = useRef(getLessonProgress(lessonId).position ?? 0);

  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState<number>(1);
  const [quality, setQuality] = useState<Quality>('auto');
  const [switching, setSwitching] = useState<Quality | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [failed, setFailed] = useState(false);
  const [srcIndex, setSrcIndex] = useState(0);
  const [menu, setMenu] = useState<Menu>(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [resumeAt, setResumeAt] = useState<number | null>(null);
  const [started, setStarted] = useState(false);

  const sources = [src, ...FALLBACK_SOURCES.filter((u) => u !== src)];
  const total = duration || durationHint;
  const qualityLabel = (q: Quality) => (q === 'auto' ? t('learn.player.auto') : q);

  /* ------------------------------------------------------------ persistence */

  const persist = useCallback(() => {
    const v = videoRef.current;
    if (!v || !hasPlayed.current || !v.duration) return;
    saveVideoPosition(lessonId, Math.floor(v.currentTime), Math.floor(v.duration));
  }, [lessonId, saveVideoPosition]);

  const persistRef = useRef(persist);
  persistRef.current = persist;

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => persistRef.current(), 5000);
    return () => window.clearInterval(id);
  }, [playing]);

  // Save on unmount (navigating to another lesson / leaving the page).
  useEffect(() => () => persistRef.current(), []);

  /* --------------------------------------------------------------- playback */

  const play = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    setResumeAt(null);
    v.play().catch(() => setPlaying(false));
  }, []);

  const toggle = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused || v.ended) play();
    else v.pause();
  }, [play]);

  const seekTo = useCallback((s: number) => {
    const v = videoRef.current;
    if (!v) return;
    const d = v.duration || 0;
    v.currentTime = clamp(s, 0, d > 0 ? d : s);
    setCurrent(v.currentTime);
  }, []);

  const seekBy = useCallback((delta: number) => seekTo((videoRef.current?.currentTime ?? 0) + delta), [seekTo]);

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    const next = !(v.muted || v.volume === 0);
    v.muted = next;
    if (!next && v.volume === 0) v.volume = 0.6;
  };

  const changeVolume = (val: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = val;
    v.muted = val === 0;
  };

  const changeRate = (r: number) => {
    if (videoRef.current) videoRef.current.playbackRate = r;
    setRate(r);
    setMenu(null);
  };

  const changeQuality = (q: Quality) => {
    setMenu(null);
    if (q === quality) return;
    setQuality(q);
    setSwitching(q);
    window.clearTimeout(qualityTimer.current);
    qualityTimer.current = window.setTimeout(() => setSwitching(null), 1400);
  };

  const toggleFullscreen = () => {
    const el = wrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else if (el.requestFullscreen) void el.requestFullscreen().catch(() => undefined);
  };

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === wrapRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  useEffect(() => () => window.clearTimeout(qualityTimer.current), []);

  /* ---------------------------------------------------- controls auto-hide */

  const poke = useCallback(() => {
    setControlsVisible(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setControlsVisible(false), 2600);
  }, []);

  useEffect(() => {
    if (!playing || menu) {
      window.clearTimeout(hideTimer.current);
      setControlsVisible(true);
    } else {
      poke();
    }
    return () => window.clearTimeout(hideTimer.current);
  }, [playing, menu, poke]);

  // Close open menus when clicking elsewhere.
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(null);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menu]);

  /* --------------------------------------------------------------- keyboard */

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const onControl = target.closest('button, [role="menuitemradio"]');
    const onRange = target instanceof HTMLInputElement && target.type === 'range';
    switch (e.key) {
      case ' ':
      case 'k':
      case 'K':
        if (onControl && e.key === ' ') return;
        e.preventDefault();
        toggle();
        break;
      case 'ArrowRight':
      case 'ArrowLeft':
        if (onRange && target.dataset.role === 'volume') return;
        e.preventDefault();
        seekBy(e.key === 'ArrowRight' ? 5 : -5);
        break;
      case 'm':
      case 'M':
        toggleMute();
        break;
      case 'f':
      case 'F':
        toggleFullscreen();
        break;
      case 'Escape':
        if (menu) setMenu(null);
        break;
      default:
        return;
    }
    poke();
  };

  /* ------------------------------------------------------------- rendering */

  const pct = total > 0 ? (current / total) * 100 : 0;
  const bufPct = total > 0 ? (buffered / total) * 100 : 0;
  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
  const showChrome = controlsVisible || !playing;

  return (
    <div
      ref={wrapRef}
      tabIndex={0}
      role="region"
      aria-label={t('learn.player.region', { title })}
      onKeyDown={onKeyDown}
      onMouseMove={poke}
      onTouchStart={poke}
      onMouseLeave={() => playing && !menu && setControlsVisible(false)}
      className={cn(
        'group/player relative aspect-video w-full overflow-hidden bg-black text-white outline-none focus-visible:ring-2 focus-visible:ring-accent',
        fullscreen ? 'rounded-none' : 'rounded-2xl shadow-lift',
        playing && !showChrome && 'cursor-none',
        className,
      )}
    >
      <video
        ref={videoRef}
        src={sources[srcIndex]}
        poster={poster}
        preload="metadata"
        playsInline
        aria-label={title}
        className="h-full w-full bg-black object-contain"
        onClick={toggle}
        onPlay={() => {
          hasPlayed.current = true;
          setStarted(true);
          setResumeAt(null);
          setPlaying(true);
        }}
        onPause={() => {
          setPlaying(false);
          persist();
        }}
        onEnded={() => {
          setPlaying(false);
          persist();
          onEnded?.();
        }}
        onWaiting={() => setWaiting(true)}
        onPlaying={() => setWaiting(false)}
        onCanPlay={() => setWaiting(false)}
        onError={() => {
          if (srcIndex < sources.length - 1) setSrcIndex((i) => i + 1);
          else setFailed(true);
        }}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onVolumeChange={(e) => {
          setVolume(e.currentTarget.volume);
          setMuted(e.currentTarget.muted);
        }}
        onProgress={(e) => {
          const v = e.currentTarget;
          if (v.buffered.length) setBuffered(v.buffered.end(v.buffered.length - 1));
        }}
        onLoadedMetadata={(e) => {
          const v = e.currentTarget;
          setDuration(v.duration);
          const pos = Math.min(savedAt.current, Math.max(0, v.duration - 3));
          if (pos > 5) {
            v.currentTime = pos;
            setCurrent(pos);
            setResumeAt(pos);
          }
        }}
      />

      {/* Edge-to-edge cover poster until first play (the native poster is letterboxed). */}
      {!started && !failed && (
        <img
          src={poster}
          alt=""
          aria-hidden
          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
          draggable={false}
        />
      )}

      {/* Gradient scrims keep controls legible over bright frames */}
      <div
        className={cn(
          'pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/80 to-transparent transition-opacity duration-300',
          showChrome ? 'opacity-100' : 'opacity-0',
        )}
        aria-hidden
      />

      {/* Center states: loading, error, big play */}
      <AnimatePresence>
        {failed ? (
          <motion.div
            key="error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-primary/90 p-6 text-center"
            role="alert"
          >
            <VideoOff className="h-10 w-10 text-accent" aria-hidden />
            <p className="font-semibold">{t('learn.player.error')}</p>
          </motion.div>
        ) : (waiting && playing) || switching ? (
          <motion.div
            key="spinner"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3"
            role="status"
            aria-live="polite"
          >
            <Loader2 className="h-12 w-12 animate-spin text-accent" aria-hidden />
            <span className={cn('rounded-full bg-black/60 px-3 py-1 text-sm font-medium', !switching && 'sr-only')}>
              {switching ? t('learn.player.switching', { quality: qualityLabel(switching) }) : t('common.loading')}
            </span>
          </motion.div>
        ) : !playing ? (
          <motion.div
            key="bigplay"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.15 }}
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
          >
            <motion.button
              type="button"
              onClick={play}
              whileHover={{ scale: 1.06 }}
              whileTap={{ scale: 0.95 }}
              aria-label={t('learn.player.play')}
              className="pointer-events-auto flex h-16 w-16 items-center justify-center rounded-full bg-gold-grad text-primary shadow-glow ring-8 ring-white/10 sm:h-20 sm:w-20"
            >
              <Play className="h-7 w-7 translate-x-0.5 fill-current sm:h-8 sm:w-8" aria-hidden />
            </motion.button>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Resume prompt */}
      <AnimatePresence>
        {resumeAt !== null && !playing && !failed && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute inset-x-3 top-3 flex justify-center sm:inset-x-auto sm:start-4 sm:top-4"
            role="status"
          >
            <div className="glass-navy flex flex-wrap items-center gap-2 rounded-2xl px-3 py-2 text-sm shadow-lift sm:flex-nowrap">
              <RotateCcw className="h-4 w-4 shrink-0 text-accent" aria-hidden />
              <span className="font-medium">
                {t('learn.player.resumeFrom')}{' '}
                <span className="num font-bold text-accent-light" dir="ltr">
                  {formatClock(resumeAt)}
                </span>
              </span>
              <span className="flex gap-1.5">
                <button
                  type="button"
                  onClick={play}
                  className="rounded-lg bg-accent px-2.5 py-1 text-xs font-bold text-primary transition hover:bg-accent-light"
                >
                  {t('common.resume')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    seekTo(0);
                    play();
                  }}
                  className="rounded-lg bg-white/10 px-2.5 py-1 text-xs font-semibold transition hover:bg-white/20"
                >
                  {t('learn.player.startOver')}
                </button>
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Quality badge */}
      {quality !== 'auto' && !switching && showChrome && (
        <span className="pointer-events-none absolute end-3 top-3 rounded-md bg-black/60 px-2 py-0.5 text-[11px] font-bold tracking-wide text-accent-light">
          {quality}
        </span>
      )}

      {/* Control bar — always LTR so the seek bar runs left → right */}
      <div
        dir="ltr"
        className={cn(
          'absolute inset-x-0 bottom-0 px-3 pb-2.5 pt-6 transition-all duration-300 sm:px-4 sm:pb-3',
          showChrome ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-2 opacity-0',
        )}
      >
        {/* Seek bar */}
        <div className="group/seek relative flex h-4 items-center">
          <div className="relative h-1 w-full overflow-hidden rounded-full bg-white/20 transition-[height] group-hover/seek:h-1.5">
            <div className="absolute inset-y-0 left-0 bg-white/35" style={{ width: `${bufPct}%` }} />
            <div className="absolute inset-y-0 left-0 bg-gold-grad" style={{ width: `${pct}%` }} />
          </div>
          <span
            className="pointer-events-none absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 scale-0 rounded-full bg-accent shadow-glow transition-transform group-hover/seek:scale-100 group-focus-within/seek:scale-100"
            style={{ left: `${pct}%` }}
            aria-hidden
          />
          <input
            type="range"
            min={0}
            max={total || 0}
            step={0.1}
            value={Math.min(current, total || 0)}
            onChange={(e) => seekTo(Number(e.target.value))}
            aria-label={t('learn.player.seek')}
            aria-valuetext={`${formatClock(current)} / ${formatClock(total)}`}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </div>

        <div className="mt-1.5 flex items-center gap-1 sm:gap-2">
          <CtrlButton label={playing ? t('learn.player.pause') : t('learn.player.play')} onClick={toggle}>
            {playing ? <Pause className="h-5 w-5 fill-current" /> : <Play className="h-5 w-5 fill-current" />}
          </CtrlButton>

          <div className="group/vol flex items-center">
            <CtrlButton label={muted || volume === 0 ? t('learn.player.unmute') : t('learn.player.mute')} onClick={toggleMute}>
              <VolumeIcon className="h-5 w-5" />
            </CtrlButton>
            <input
              type="range"
              data-role="volume"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={(e) => changeVolume(Number(e.target.value))}
              aria-label={t('learn.player.volume')}
              className="hidden h-1 w-0 cursor-pointer opacity-0 accent-[#C9A24A] transition-all duration-200 focus:w-20 focus:opacity-100 group-hover/vol:w-20 group-hover/vol:opacity-100 sm:block"
            />
          </div>

          <span className="ms-1 whitespace-nowrap text-xs font-medium text-white/90 num sm:text-sm">
            {formatClock(current)} <span className="text-white/50">/ {formatClock(total)}</span>
          </span>

          <div ref={menuRef} className="ms-auto flex items-center gap-1 sm:gap-2">
            <div className="relative">
              <CtrlButton
                label={t('learn.player.speed')}
                onClick={() => setMenu((m) => (m === 'speed' ? null : 'speed'))}
                expanded={menu === 'speed'}
                wide
              >
                <Gauge className="h-4 w-4" />
                <span className="text-xs font-bold num">{rate}x</span>
              </CtrlButton>
              <PopMenu open={menu === 'speed'} label={t('learn.player.speed')}>
                {SPEEDS.map((s) => (
                  <MenuOption key={s} selected={rate === s} onSelect={() => changeRate(s)}>
                    {s === 1 ? t('learn.player.normal') : `${s}x`}
                  </MenuOption>
                ))}
              </PopMenu>
            </div>

            <div className="relative">
              <CtrlButton
                label={t('learn.player.quality')}
                onClick={() => setMenu((m) => (m === 'quality' ? null : 'quality'))}
                expanded={menu === 'quality'}
              >
                <Settings2 className={cn('h-5 w-5 transition-transform duration-300', menu === 'quality' && 'rotate-90')} />
              </CtrlButton>
              <PopMenu open={menu === 'quality'} label={t('learn.player.quality')}>
                {QUALITIES.map((q) => (
                  <MenuOption key={q} selected={quality === q} onSelect={() => changeQuality(q)}>
                    {qualityLabel(q)}
                    {q === '1080p' && <span className="ms-1.5 rounded bg-accent px-1 text-[9px] font-black text-primary">HD</span>}
                  </MenuOption>
                ))}
              </PopMenu>
            </div>

            <CtrlButton
              label={fullscreen ? t('learn.player.exitFullscreen') : t('learn.player.fullscreen')}
              onClick={toggleFullscreen}
            >
              {fullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
            </CtrlButton>
          </div>
        </div>
      </div>
    </div>
  );
}

function CtrlButton({
  label,
  onClick,
  children,
  expanded,
  wide,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  expanded?: boolean;
  wide?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-haspopup={expanded !== undefined ? 'menu' : undefined}
      aria-expanded={expanded}
      className={cn(
        'flex h-9 items-center justify-center gap-1 rounded-lg text-white/90 transition hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        wide ? 'px-2' : 'w-9',
        expanded && 'bg-white/15 text-accent-light',
      )}
    >
      {children}
    </button>
  );
}

function PopMenu({ open, label, children }: { open: boolean; label: string; children: ReactNode }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="menu"
          aria-label={label}
          initial={{ opacity: 0, y: 8, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 6, scale: 0.96 }}
          transition={{ duration: 0.16 }}
          className="absolute bottom-full right-0 z-20 mb-2 min-w-[8.5rem] origin-bottom-right rounded-xl border border-white/10 bg-primary/95 p-1.5 shadow-lift backdrop-blur-md"
        >
          <p className="px-2.5 pb-1 pt-0.5 text-[10px] font-bold uppercase tracking-wider text-white/50">{label}</p>
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function MenuOption({ selected, onSelect, children }: { selected: boolean; onSelect: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 text-start text-sm transition hover:bg-white/10',
        selected ? 'font-bold text-accent-light' : 'text-white/85',
      )}
    >
      <span className="flex items-center">{children}</span>
      {selected && <Check className="h-4 w-4" aria-hidden />}
    </button>
  );
}
