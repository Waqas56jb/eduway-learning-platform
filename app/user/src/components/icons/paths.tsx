import type { ReactElement, ReactNode } from 'react';
import { Circle, Defs, Ellipse, G, Mask, Path, Rect, Text as SvgText } from 'react-native-svg';

/**
 * EDUWAY icon set — custom outline glyphs on a 24px grid.
 * Drawn for a 1.75 stroke with round caps/joins. The parent <G> provides
 * stroke/fill defaults, so each glyph only declares geometry plus explicit fills.
 */

export const ICON_NAMES = [
  'home', 'subjects', 'practice', 'tutor', 'profile', 'play', 'pause', 'lesson', 'quiz',
  'question-bank', 'mistakes', 'exam', 'timer', 'flag', 'bookmark', 'star', 'bell', 'search',
  'filter', 'lock', 'check-circle', 'check', 'x-circle', 'chevron', 'chevron-down', 'settings',
  'language', 'logout', 'crown', 'shield', 'flame', 'chart', 'wallet', 'card', 'receipt',
  'calendar', 'globe', 'moon', 'sun', 'phone', 'otp', 'back', 'close', 'plus', 'minus', 'send',
  'image', 'paperclip', 'sparkles', 'file-pdf', 'download', 'note', 'share', 'trash', 'refresh',
  'info', 'alert', 'wifi-off', 'devices', 'mail', 'headset', 'skip-forward', 'skip-back',
  'rewind-10', 'forward-10', 'fullscreen', 'captions', 'speed', 'gear-quality', 'target',
  'trophy', 'grid', 'user', 'edit', 'eye', 'arrow', 'map-pin', 'school', 'gift', 'clock',
  'history', 'medal', 'book', 'video', 'heart', 'cap',
] as const;

export type IconName = (typeof ICON_NAMES)[number];

/** Icons that point in a reading direction and flip under RTL by default. */
export const DIRECTIONAL_ICONS: ReadonlySet<IconName> = new Set<IconName>([
  'chevron', 'back', 'arrow', 'skip-forward', 'skip-back', 'send',
]);

export interface GlyphCtx {
  /** stroke / fill color */
  c: string;
  /** filled (active) variant */
  f: boolean;
  /** unique id for masks */
  id: string;
  /** stroke width */
  sw: number;
}

type Glyph = (x: GlyphCtx) => ReactElement;

/* ───────────────────────── helpers ───────────────────────── */

/** Solid fill when filled, otherwise outline. */
const solid = (x: GlyphCtx) => ({ fill: x.f ? x.c : 'none' });
/** Soft 15% duotone fill when filled. */
const soft = (x: GlyphCtx) => (x.f ? { fill: x.c, fillOpacity: 0.15 } : { fill: 'none' });
/** Small solid dot (i, ?, !). */
const dot = (x: GlyphCtx, cx: number, cy: number, r = 1.05) => (
  <Circle cx={cx} cy={cy} r={r} fill={x.c} stroke="none" />
);

/**
 * Filled glyph with knocked-out details: `shape` is filled with the color and
 * `holes` are stroked through it (transparent), so it works on any background.
 * `over` is drawn on top, unmasked.
 */
function cut(x: GlyphCtx, shape: ReactNode, holes: ReactNode, over?: ReactNode): ReactElement {
  return (
    <>
      <Defs>
        <Mask id={x.id} maskUnits="userSpaceOnUse" x="-2" y="-2" width="28" height="28">
          <Rect x="-2" y="-2" width="28" height="28" fill="#FFFFFF" stroke="none" />
          <G
            stroke="#000000"
            strokeWidth={x.sw * 1.05}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          >
            {holes}
          </G>
        </Mask>
      </Defs>
      <G mask={`url(#${x.id})`} fill={x.c}>
        {shape}
      </G>
      {over}
    </>
  );
}

/** Gear outline generated once (teeth with flat tops, inner arcs). */
function gearPath(teeth: number, rO: number, rI: number, cx = 12, cy = 12): string {
  const step = (Math.PI * 2) / teeth;
  const hO = step * 0.17;
  const hI = step * 0.27;
  const p = (r: number, a: number) =>
    `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`;
  let d = '';
  for (let i = 0; i < teeth; i++) {
    const a = i * step - Math.PI / 2;
    d += `${i === 0 ? 'M' : 'L'}${p(rI, a - hI)} L${p(rO, a - hO)} A${rO} ${rO} 0 0 1 ${p(rO, a + hO)} L${p(rI, a + hI)} `;
    d += `A${rI} ${rI} 0 0 1 ${p(rI, a + step - hI)} `;
  }
  return `${d}Z`;
}

const GEAR_8 = gearPath(8, 9.4, 7.1);
const GEAR_6 = gearPath(6, 9.2, 6.9);

const D = {
  home: 'M3.75 10.2 11.2 4.1a1.25 1.25 0 0 1 1.6 0l7.45 6.1V19a1.75 1.75 0 0 1-1.75 1.75H15v-5a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v5H5.5A1.75 1.75 0 0 1 3.75 19z',
  star: 'M12 3.5 14.47 9.35 20.8 9.89 15.99 14.05 17.44 20.23 12 16.95 6.56 20.23 8.01 14.05 3.2 9.89 9.53 9.35Z',
  heart:
    'M12 20.25s-7.75-4.6-7.75-10.4A4.35 4.35 0 0 1 12 7.1a4.35 4.35 0 0 1 7.75 2.75c0 5.8-7.75 10.4-7.75 10.4z',
  bookmark:
    'M6.5 3.75h11a1 1 0 0 1 1 1v15.3a.5.5 0 0 1-.8.4L12 16.25l-5.7 4.2a.5.5 0 0 1-.8-.4V4.75a1 1 0 0 1 1-1z',
  bell: 'M6 16.75V11a6 6 0 0 1 12 0v5.75l1.5 1.75h-15z',
  tutor:
    'M12 3.75c4.7 0 8.25 3.2 8.25 7.5s-3.55 7.5-8.25 7.5c-1 0-1.95-.13-2.83-.4L5 19.75l.95-3.45C4.6 14.95 3.75 13.2 3.75 11.25c0-4.3 3.55-7.5 8.25-7.5z',
  sparkSmall:
    'M12 8.1c.32 1.7 1.45 2.83 3.15 3.15-1.7.32-2.83 1.45-3.15 3.15-.32-1.7-1.45-2.83-3.15-3.15 1.7-.32 2.83-1.45 3.15-3.15z',
  flame:
    'M12 21c-3.9 0-6.75-2.7-6.75-6.4 0-2.9 1.7-4.9 3.3-6.6.4 1.5 1.2 2.6 2.3 3.2C10.6 7.6 12.3 4.8 14.5 3c.4 2.6 1.9 4.3 3.1 5.9 1 1.4 1.65 3 1.65 5.1 0 4-3.2 7-7.25 7z',
  flameInner: 'M12 21a2.75 2.75 0 0 1-2.75-2.75c0-1.7 1.4-2.6 2.25-4c.9 1.3 3.25 2.1 3.25 4A2.75 2.75 0 0 1 12 21z',
  page: 'M14 3H7a2.5 2.5 0 0 0-2.5 2.5v13A2.5 2.5 0 0 0 7 21h10a2.5 2.5 0 0 0 2.5-2.5V8.5z',
  pageFold: 'M14 3v4a1.5 1.5 0 0 0 1.5 1.5h4',
  ccw: 'M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4.5 8.9',
  ccwHead: 'M4.5 4.75V8.9h4.15',
  cw: 'M19.5 12a7.5 7.5 0 1 1-2.2-5.3l2.2 2.2',
  cwHead: 'M19.5 4.75V8.9h-4.15',
  shield: 'M12 3.25l7 2.75v5.6c0 4.35-2.95 7.9-7 9.15-4.05-1.25-7-4.8-7-9.15V6z',
  crown: 'M4 8l3.75 3.25L12 5.25l4.25 6L20 8l-1.5 9.25h-13z',
  flag: 'M5 4.5c2.3-1.3 4.6-1.3 7 0s4.7 1.3 7 0v9c-2.3 1.3-4.6 1.3-7 0s-4.7-1.3-7 0',
  pin: 'M12 21s-6.75-5.6-6.75-11.25a6.75 6.75 0 0 1 13.5 0C18.75 15.4 12 21 12 21z',
  capBoard: 'M2.5 9.25 12 4.75l9.5 4.5-9.5 4.5z',
  moon: 'M20 14.2A8.25 8.25 0 0 1 9.8 4a8.25 8.25 0 1 0 10.2 10.2z',
  sparkBig:
    'M10.5 4.5c.55 3.3 2.7 5.45 6 6-3.3.55-5.45 2.7-6 6-.55-3.3-2.7-5.45-6-6 3.3-.55 5.45-2.7 6-6z',
  sparkTiny: 'M18.5 15.5c.25 1.5 1 2.25 2.5 2.5-1.5.25-2.25 1-2.5 2.5-.25-1.5-1-2.25-2.5-2.5 1.5-.25 2.25-1 2.5-2.5z',
  play: 'M7.5 5.6v12.8a1 1 0 0 0 1.5.86l10.6-6.4a1 1 0 0 0 0-1.72L9 4.74a1 1 0 0 0-1.5.86z',
  book:
    'M12 6.5C10.3 5 7.9 4.25 4.75 4.25a1 1 0 0 0-1 1V17.5a1 1 0 0 0 1 1c3 0 5.3.7 7.25 2.25 1.95-1.55 4.25-2.25 7.25-2.25a1 1 0 0 0 1-1V5.25a1 1 0 0 0-1-1C16.1 4.25 13.7 5 12 6.5z',
};

/* ───────────────────────── glyphs ───────────────────────── */

export const glyphs: Record<IconName, Glyph> = {
  home: (x) => <Path d={D.home} {...solid(x)} />,

  subjects: (x) => {
    const books = (
      <>
        <Rect x="3.5" y="4" width="10" height="16" rx="1.4" />
        <Rect x="14.6" y="5.8" width="3.4" height="13.5" rx="1.1" transform="rotate(12 14.6 19.3)" />
      </>
    );
    const lines = <Path d="M8.5 4v16M3.5 7.75h10M3.5 16.25h10" />;
    return x.f ? cut(x, books, lines) : <>{books}{lines}</>;
  },

  practice: (x) => {
    const body = <Rect x="5" y="4.5" width="14" height="16.5" rx="2.5" />;
    const clip = <Rect x="8.75" y="2.75" width="6.5" height="3.5" rx="1.25" />;
    const marks = <Path d="M8.75 12.25l1.75 1.75 3.5-3.5M8.75 17.25h6.5" />;
    if (x.f) return cut(x, body, <>{marks}<Rect x="8.75" y="2.75" width="6.5" height="3.5" rx="1.25" strokeWidth={x.sw * 2.2} /></>, <G fill={x.c}>{clip}</G>);
    return <>{body}{clip}{marks}</>;
  },

  tutor: (x) =>
    x.f ? (
      cut(x, <Path d={D.tutor} />, <Path d={D.sparkSmall} fill="#000000" strokeWidth={x.sw * 0.6} />)
    ) : (
      <>
        <Path d={D.tutor} />
        <Path d={D.sparkSmall} fill={x.c} strokeWidth={x.sw * 0.5} />
      </>
    ),

  profile: (x) =>
    x.f ? (
      <G fill={x.c}>
        <Circle cx="12" cy="8.25" r="3.9" />
        <Path d="M4.75 20.25c.8-3.6 3.7-5.75 7.25-5.75s6.45 2.15 7.25 5.75z" />
      </G>
    ) : (
      <>
        <Circle cx="12" cy="8.25" r="3.75" />
        <Path d="M4.75 20.25c.8-3.6 3.7-5.75 7.25-5.75s6.45 2.15 7.25 5.75" />
      </>
    ),

  user: (x) => (
    <>
      <Circle cx="12" cy="12" r="8.75" {...soft(x)} />
      <Circle cx="12" cy="10" r="3" />
      <Path d="M6.4 18.3c1.25-1.95 3.3-3.05 5.6-3.05s4.35 1.1 5.6 3.05" />
    </>
  ),

  play: (x) => <Path d={D.play} {...solid(x)} />,

  pause: (x) => (
    <>
      <Rect x="6.25" y="4.75" width="3.75" height="14.5" rx="1.25" {...solid(x)} />
      <Rect x="14" y="4.75" width="3.75" height="14.5" rx="1.25" {...solid(x)} />
    </>
  ),

  lesson: (x) => (
    <>
      <Rect x="3" y="4.5" width="18" height="13" rx="3" {...soft(x)} />
      <Path d="M10.25 8.4v5.2a.6.6 0 0 0 .9.52l4.2-2.6a.6.6 0 0 0 0-1.04l-4.2-2.6a.6.6 0 0 0-.9.52z" fill={x.c} strokeWidth={x.sw * 0.6} />
      <Path d="M7.5 20.75h9" />
    </>
  ),

  video: (x) => (
    <>
      <Rect x="2.75" y="6" width="12.5" height="12" rx="2.75" {...soft(x)} />
      <Path d="M15.25 10.4l4.45-2.5a.9.9 0 0 1 1.35.78v6.64a.9.9 0 0 1-1.35.78l-4.45-2.5" {...soft(x)} />
    </>
  ),

  quiz: (x) => (
    <>
      <Rect x="3.75" y="3.75" width="16.5" height="16.5" rx="4.5" {...soft(x)} />
      <Path d="M9.6 9.6a2.45 2.45 0 0 1 4.75.8c0 1.65-2.35 2.2-2.35 3.6" />
      {dot(x, 12, 16.9)}
    </>
  ),

  'question-bank': (x) => (
    <>
      <Path d="M7 3.5h10.5a3 3 0 0 1 3 3V17" />
      <Rect x="3.5" y="6.5" width="14" height="14" rx="3" {...soft(x)} />
      <Path d="M8.55 11.6a2 2 0 0 1 3.9.65c0 1.35-1.95 1.75-1.95 2.9" />
      {dot(x, 10.5, 17.3, 0.95)}
    </>
  ),

  mistakes: (x) => (
    <>
      <Rect x="5" y="3.5" width="14" height="17" rx="2.5" {...soft(x)} />
      <Path d="M8.75 7.5h6.5M9.9 11.4l4.2 4.2M14.1 11.4l-4.2 4.2" />
    </>
  ),

  exam: (x) => (
    <>
      <Path d={D.page} {...soft(x)} />
      <Path d={D.pageFold} />
      <Path d="M8.75 14.25l2 2 4-4" />
    </>
  ),

  'file-pdf': (x) => (
    <>
      <Path d={D.page} {...soft(x)} />
      <Path d={D.pageFold} />
      <SvgText
        x="12"
        y="17.4"
        fontSize="5.4"
        fontWeight="800"
        textAnchor="middle"
        fill={x.c}
        stroke="none"
        letterSpacing={0.2}
      >
        PDF
      </SvgText>
    </>
  ),

  note: (x) => (
    <>
      <Path d="M5.75 4h12.5A1.75 1.75 0 0 1 20 5.75V14l-6 6H5.75A1.75 1.75 0 0 1 4 18.25V5.75A1.75 1.75 0 0 1 5.75 4z" {...soft(x)} />
      <Path d="M14 20v-4.25A1.75 1.75 0 0 1 15.75 14H20M8 8.75h8M8 12.25h4.5" />
    </>
  ),

  timer: (x) => (
    <>
      <Circle cx="12" cy="13.5" r="7.25" {...soft(x)} />
      <Path d="M12 13.5V10M10 2.75h4M12 2.75v3.5M18.1 6.9l1.4-1.4" />
    </>
  ),

  clock: (x) => (
    <>
      <Circle cx="12" cy="12" r="8.75" {...soft(x)} />
      <Path d="M12 7.5V12l3 2" />
    </>
  ),

  history: () => (
    <>
      <Path d={D.ccw} />
      <Path d={D.ccwHead} />
      <Path d="M12 8.25V12l2.75 1.75" />
    </>
  ),

  flag: (x) =>
    x.f ? (
      <>
        <Path d={`${D.flag}z`} fill={x.c} />
        <Path d="M5 21V4" />
      </>
    ) : (
      <>
        <Path d="M5 21V4" />
        <Path d={D.flag} />
      </>
    ),

  bookmark: (x) =>
    x.f ? <Path d={D.bookmark} fill={x.c} /> : <Path d={D.bookmark} />,

  star: (x) => <Path d={D.star} {...solid(x)} />,

  heart: (x) => <Path d={D.heart} {...solid(x)} />,

  bell: (x) => (
    <>
      <Path d={D.bell} {...solid(x)} />
      <Path d="M10.25 20.75a1.9 1.9 0 0 0 3.5 0M12 3.25V5" />
    </>
  ),

  search: (x) => (
    <>
      <Circle cx="10.75" cy="10.75" r="6.5" {...soft(x)} />
      <Path d="M15.6 15.6 20 20" />
    </>
  ),

  filter: (x) => (
    <>
      <Path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
      <Circle cx="16" cy="7" r="2" {...solid(x)} />
      <Circle cx="10" cy="17" r="2" {...solid(x)} />
    </>
  ),

  lock: (x) => {
    const body = <Rect x="4.75" y="10.5" width="14.5" height="10" rx="2.5" />;
    const shackle = <Path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />;
    const key = <Path d="M12 14.5v2" />;
    return x.f ? cut(x, body, key, shackle) : <>{body}{shackle}{key}</>;
  },

  'check-circle': (x) => {
    const ring = <Circle cx="12" cy="12" r="8.75" />;
    const mark = <Path d="M8.25 12.25l2.5 2.5 5-5" />;
    return x.f ? cut(x, ring, mark) : <>{ring}{mark}</>;
  },

  check: () => <Path d="M5 12.5l4.5 4.5L19 7.5" />,

  'x-circle': (x) => {
    const ring = <Circle cx="12" cy="12" r="8.75" />;
    const mark = <Path d="M9.25 9.25l5.5 5.5M14.75 9.25l-5.5 5.5" />;
    return x.f ? cut(x, ring, mark) : <>{ring}{mark}</>;
  },

  chevron: () => <Path d="M9.5 5.5 16 12l-6.5 6.5" />,
  'chevron-down': () => <Path d="M5.5 9.5 12 16l6.5-6.5" />,
  back: () => <Path d="M19.5 12h-15M10.5 6l-6 6 6 6" />,
  arrow: () => <Path d="M4.5 12h15M13.5 6l6 6-6 6" />,
  close: () => <Path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  plus: () => <Path d="M12 5v14M5 12h14" />,
  minus: () => <Path d="M5 12h14" />,

  settings: (x) => {
    const gear = <Path d={GEAR_8} />;
    const hub = <Circle cx="12" cy="12" r="2.9" />;
    return x.f ? cut(x, gear, hub) : <>{gear}{hub}</>;
  },

  'gear-quality': (x) => (
    <>
      <Path d={GEAR_6} {...soft(x)} />
      <Circle cx="12" cy="12" r="2.6" />
    </>
  ),

  language: () => (
    <>
      <Path d="M3.75 5.5h8M7.75 3.5v2M10.25 5.5c-.6 3.3-2.8 6-5.75 7.4M6.5 8.75c1 1.55 2.55 2.85 4.4 3.6" />
      <Path d="M12.75 20.5l3.75-9 3.75 9M14.1 17.25h4.8" />
    </>
  ),

  logout: () => (
    <>
      <Path d="M9.5 19.25H7A2.25 2.25 0 0 1 4.75 17V7A2.25 2.25 0 0 1 7 4.75h2.5" />
      <Path d="M10.5 12h9.5M16 8l4 4-4 4" />
    </>
  ),

  crown: (x) => (
    <>
      <Path d={D.crown} {...solid(x)} />
      <Path d="M6 20.25h12" />
    </>
  ),

  shield: (x) => {
    const s = <Path d={D.shield} />;
    const mark = <Path d="M9 12.25l2.1 2.1 3.9-3.9" />;
    return x.f ? cut(x, s, mark) : <>{s}{mark}</>;
  },

  flame: (x) => {
    const outer = <Path d={D.flame} />;
    const inner = <Path d={D.flameInner} />;
    return x.f ? cut(x, outer, inner) : <>{outer}{inner}</>;
  },

  chart: (x) => (
    <>
      <Rect x="5.25" y="12" width="3" height="5.5" rx="1" {...solid(x)} />
      <Rect x="10.5" y="6.5" width="3" height="11" rx="1" {...solid(x)} />
      <Rect x="15.75" y="9.5" width="3" height="8" rx="1" {...solid(x)} />
      <Path d="M3.75 20.5h16.5" />
    </>
  ),

  wallet: (x) => (
    <>
      <Path d="M5.5 7.25l9.4-3.1a1.5 1.5 0 0 1 2 1.42v1.68" />
      <Rect x="3.75" y="7.25" width="16.5" height="12.75" rx="2.5" {...soft(x)} />
      <Path d="M20.25 11.25h-3.5a2.25 2.25 0 0 0 0 4.5h3.5" />
      {dot(x, 16.9, 13.5, 0.95)}
    </>
  ),

  card: (x) => (
    <>
      <Rect x="2.75" y="5.25" width="18.5" height="13.5" rx="2.5" {...soft(x)} />
      <Path d="M2.75 9.75h18.5M6.5 15h3" />
    </>
  ),

  receipt: (x) => (
    <>
      <Path d="M6 3.75h12v16.5l-2-1.25-2 1.25-2-1.25-2 1.25-2-1.25-2 1.25z" {...soft(x)} />
      <Path d="M9 8.25h6M9 11.75h6M9 15.25h3" />
    </>
  ),

  calendar: (x) => (
    <>
      <Rect x="3.75" y="5" width="16.5" height="15.25" rx="2.5" {...soft(x)} />
      <Path d="M3.75 9.75h16.5M8 3v4M16 3v4" />
      {dot(x, 8, 13.6, 0.95)}
      {dot(x, 12, 13.6, 0.95)}
      {dot(x, 16, 13.6, 0.95)}
      {dot(x, 8, 16.9, 0.95)}
      {dot(x, 12, 16.9, 0.95)}
    </>
  ),

  globe: (x) => (
    <>
      <Circle cx="12" cy="12" r="8.75" {...soft(x)} />
      <Path d="M3.25 12h17.5M12 3.25c2.4 2.4 3.6 5.3 3.6 8.75S14.4 18.35 12 20.75C9.6 18.35 8.4 15.45 8.4 12S9.6 5.65 12 3.25z" />
    </>
  ),

  moon: (x) => <Path d={D.moon} {...solid(x)} />,

  sun: (x) => (
    <>
      <Circle cx="12" cy="12" r="3.75" {...solid(x)} />
      <Path d="M12 2.75v1.75M12 19.5v1.75M2.75 12h1.75M19.5 12h1.75M5.46 5.46l1.24 1.24M17.3 17.3l1.24 1.24M5.46 18.54l1.24-1.24M17.3 6.7l1.24-1.24" />
    </>
  ),

  phone: (x) => (
    <>
      <Rect x="6.25" y="2.75" width="11.5" height="18.5" rx="2.75" {...soft(x)} />
      <Path d="M10.5 18h3" />
    </>
  ),

  otp: (x) => (
    <>
      <Rect x="2.75" y="6" width="18.5" height="12" rx="3" {...soft(x)} />
      {dot(x, 7.75, 12, 1.2)}
      {dot(x, 12, 12, 1.2)}
      {dot(x, 16.25, 12, 1.2)}
    </>
  ),

  send: (x) => (
    <>
      <Path d="M20.5 12 4.6 4.4a.6.6 0 0 0-.83.73L6.25 12l-2.48 6.87a.6.6 0 0 0 .83.73z" {...solid(x)} />
      {x.f ? null : <Path d="M6.25 12h6.25" />}
    </>
  ),

  image: (x) => (
    <>
      <Rect x="3.25" y="4.25" width="17.5" height="15.5" rx="2.75" {...soft(x)} />
      <Circle cx="9" cy="9.75" r="1.75" />
      <Path d="M20.75 15.5l-4.6-4.6a1.2 1.2 0 0 0-1.7 0L5.5 19.75" />
    </>
  ),

  paperclip: () => (
    <Path d="M19.5 11.6l-7.3 7.3a4.6 4.6 0 0 1-6.5-6.5l7.6-7.6a3.05 3.05 0 0 1 4.3 4.3l-7.6 7.6a1.5 1.5 0 0 1-2.15-2.15l7-7" />
  ),

  sparkles: (x) => (
    <>
      <Path d={D.sparkBig} {...solid(x)} />
      <Path d={D.sparkTiny} {...solid(x)} />
      <Path d="M18 2.75v3.5M16.25 4.5h3.5" />
    </>
  ),

  download: () => <Path d="M12 4v11M7.5 10.75 12 15.25l4.5-4.5M4.75 19.75h14.5" />,

  share: (x) => (
    <>
      <Circle cx="17.5" cy="5.75" r="2.5" {...solid(x)} />
      <Circle cx="6.5" cy="12" r="2.5" {...solid(x)} />
      <Circle cx="17.5" cy="18.25" r="2.5" {...solid(x)} />
      <Path d="M8.7 10.75l6.6-3.75M8.7 13.25l6.6 3.75" />
    </>
  ),

  trash: (x) => (
    <>
      <Path d="M6.25 6.75l.8 12.1A1.75 1.75 0 0 0 8.8 20.5h6.4a1.75 1.75 0 0 0 1.75-1.65l.8-12.1" {...soft(x)} />
      <Path d="M4.5 6.75h15M9.25 6.75V5a1.25 1.25 0 0 1 1.25-1.25h3A1.25 1.25 0 0 1 14.75 5v1.75M10.25 10.75v5.5M13.75 10.75v5.5" />
    </>
  ),

  refresh: () => (
    <Path d="M4.5 12a7.5 7.5 0 0 1 12.9-5.2L19.5 9M19.5 4.5V9H15M19.5 12a7.5 7.5 0 0 1-12.9 5.2L4.5 15M4.5 19.5V15H9" />
  ),

  info: (x) => {
    const ring = <Circle cx="12" cy="12" r="8.75" />;
    const mark = <Path d="M12 11v5.25" />;
    if (x.f) return cut(x, ring, <>{mark}<Circle cx="12" cy="7.9" r="1.05" fill="#000000" stroke="none" /></>);
    return <>{ring}{mark}{dot(x, 12, 7.9)}</>;
  },

  alert: (x) => {
    const tri = (
      <Path d="M10.4 4.6 3.2 17.5A1.85 1.85 0 0 0 4.8 20.25h14.4a1.85 1.85 0 0 0 1.6-2.75L13.6 4.6a1.85 1.85 0 0 0-3.2 0z" />
    );
    const mark = <Path d="M12 9.75v4" />;
    if (x.f) return cut(x, tri, <>{mark}<Circle cx="12" cy="17" r="1.05" fill="#000000" stroke="none" /></>);
    return <>{tri}{mark}{dot(x, 12, 17)}</>;
  },

  'wifi-off': (x) => (
    <>
      <Path d="M2.75 9.1a13.4 13.4 0 0 1 4.3-2.75M10.9 5.3a13.4 13.4 0 0 1 10.35 3.8M5.75 12.4a8.8 8.8 0 0 1 3.8-2.15M14.7 10.5a8.8 8.8 0 0 1 3.55 1.9M8.9 15.6a4.6 4.6 0 0 1 6.2 0M3.5 3.5l17 17" />
      {dot(x, 12, 19)}
    </>
  ),

  devices: (x) => (
    <>
      <Path d="M12.5 16H5.75A1.75 1.75 0 0 1 4 14.25v-7.5A1.75 1.75 0 0 1 5.75 5h11.5A1.75 1.75 0 0 1 19 6.75V8M2.5 19.25h10" />
      <Rect x="15" y="10" width="6.25" height="10.25" rx="1.5" {...soft(x)} />
      <Path d="M17.6 17.75h1.05" />
    </>
  ),

  mail: (x) => (
    <>
      <Rect x="3" y="5.25" width="18" height="13.5" rx="2.5" {...soft(x)} />
      <Path d="M3.75 7.5l7.2 5.1a1.8 1.8 0 0 0 2.1 0l7.2-5.1" />
    </>
  ),

  headset: (x) => (
    <>
      <Path d="M4.5 14v-2a7.5 7.5 0 0 1 15 0v2" />
      <Rect x="3.75" y="13" width="3.75" height="6" rx="1.5" {...solid(x)} />
      <Rect x="16.5" y="13" width="3.75" height="6" rx="1.5" {...solid(x)} />
      <Path d="M18.4 19v.25c0 1.1-1.1 1.75-2.65 1.75H13.5" />
    </>
  ),

  'skip-forward': (x) => (
    <>
      <Path d="M5.5 6.1v11.8a.8.8 0 0 0 1.25.66l8.4-5.9a.8.8 0 0 0 0-1.32l-8.4-5.9a.8.8 0 0 0-1.25.66z" {...solid(x)} />
      <Path d="M18.5 5.5v13" />
    </>
  ),

  'skip-back': (x) => (
    <>
      <Path d="M18.5 6.1v11.8a.8.8 0 0 1-1.25.66l-8.4-5.9a.8.8 0 0 1 0-1.32l8.4-5.9a.8.8 0 0 1 1.25.66z" {...solid(x)} />
      <Path d="M5.5 5.5v13" />
    </>
  ),

  'rewind-10': (x) => (
    <>
      <Path d={D.ccw} />
      <Path d={D.ccwHead} />
      <SvgText x="12.2" y="14.35" fontSize="6.4" fontWeight="700" textAnchor="middle" fill={x.c} stroke="none">
        10
      </SvgText>
    </>
  ),

  'forward-10': (x) => (
    <>
      <Path d={D.cw} />
      <Path d={D.cwHead} />
      <SvgText x="11.8" y="14.35" fontSize="6.4" fontWeight="700" textAnchor="middle" fill={x.c} stroke="none">
        10
      </SvgText>
    </>
  ),

  fullscreen: () => (
    <Path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15" />
  ),

  captions: (x) => (
    <>
      <Rect x="3" y="5.5" width="18" height="13" rx="3" {...soft(x)} />
      <Path d="M10.15 10.6a2 2 0 1 0 0 2.8M16.65 10.6a2 2 0 1 0 0 2.8" />
    </>
  ),

  speed: (x) => (
    <>
      <Path d="M4.86 17.63A8.25 8.25 0 1 1 19.14 17.63" {...soft(x)} />
      <Path d="M12 13.5l3.75-3.75" />
      {dot(x, 12, 13.5, 1.4)}
    </>
  ),

  target: (x) => (
    <>
      <Circle cx="12" cy="12" r="8.75" {...soft(x)} />
      <Circle cx="12" cy="12" r="5.1" />
      {dot(x, 12, 12, 1.7)}
    </>
  ),

  trophy: (x) => (
    <>
      <Path d="M7.25 4h9.5v5.25a4.75 4.75 0 0 1-9.5 0z" {...solid(x)} />
      <Path d="M7.25 6H5.5a1.75 1.75 0 0 0-1.75 1.75c0 2 1.6 3.5 3.75 3.6M16.75 6h1.75a1.75 1.75 0 0 1 1.75 1.75c0 2-1.6 3.5-3.75 3.6M12 14v3.25" />
      <Path d="M9.5 17.25h5a1 1 0 0 1 1 1v2h-7v-2a1 1 0 0 1 1-1z" {...solid(x)} />
    </>
  ),

  grid: (x) => (
    <>
      <Rect x="3.75" y="3.75" width="7" height="7" rx="2" {...solid(x)} />
      <Rect x="13.25" y="3.75" width="7" height="7" rx="2" {...soft(x)} />
      <Rect x="3.75" y="13.25" width="7" height="7" rx="2" {...soft(x)} />
      <Rect x="13.25" y="13.25" width="7" height="7" rx="2" {...solid(x)} />
    </>
  ),

  edit: (x) => (
    <>
      <Path d="M15.4 4.6a2.05 2.05 0 0 1 2.9 2.9L8.5 17.3l-3.9 1.1 1.1-3.9z" {...soft(x)} />
      <Path d="M13.6 6.4l3 3M12.5 20h7" />
    </>
  ),

  eye: (x) => (
    <>
      <Path d="M2.75 12S6 5.75 12 5.75 21.25 12 21.25 12 18 18.25 12 18.25 2.75 12 2.75 12z" {...soft(x)} />
      <Circle cx="12" cy="12" r="3" {...solid(x)} />
    </>
  ),

  'map-pin': (x) => {
    const pin = <Path d={D.pin} />;
    const hole = <Circle cx="12" cy="9.75" r="2.5" />;
    return x.f ? cut(x, pin, hole) : <>{pin}{hole}</>;
  },

  school: (x) => (
    <>
      <Path d="M3.5 9.75 12 4.75l8.5 5z" {...soft(x)} />
      <Path d="M5.5 10.25v8.5M18.5 10.25v8.5M9.75 12.5v4.5M14.25 12.5v4.5M3.25 19.75h17.5" />
    </>
  ),

  gift: (x) => (
    <>
      <Rect x="4" y="11" width="16" height="9.25" rx="1.75" {...soft(x)} />
      <Rect x="3" y="7.5" width="18" height="3.5" rx="1.1" {...soft(x)} />
      <Path d="M12 7.5v12.75M12 7.5c-1.4-2.7-5-3.3-5-1.15C7 7.6 9.6 7.5 12 7.5zM12 7.5c1.4-2.7 5-3.3 5-1.15C17 7.6 14.4 7.5 12 7.5z" />
    </>
  ),

  medal: (x) => (
    <>
      <Path d="M8.6 10.6 6.2 3.75h3.5L12 9.3M15.4 10.6l2.4-6.85h-3.5l-1.2 2.9" />
      <Circle cx="12" cy="15.25" r="5.5" {...soft(x)} />
      <G transform="translate(12 15.25) scale(0.34) translate(-12 -12.6)">
        <Path d={D.star} fill={x.c} stroke="none" />
      </G>
    </>
  ),

  book: (x) => (
    <>
      <Path d={D.book} {...soft(x)} />
      <Path d="M12 6.5v14.25" />
    </>
  ),

  cap: (x) => (
    <>
      <Path d={D.capBoard} {...solid(x)} />
      <Path d="M6.5 11.25v4.6c1.4 1.4 3.4 2.15 5.5 2.15s4.1-.75 5.5-2.15v-4.6M21.5 9.25v5.25" />
    </>
  ),
};

/* ───────────────────────── subject glyphs ───────────────────────── */

export const subjectGlyphs = {
  math: () => <Path d="M17.25 6.25V4.5H6.5l6 7.5-6 7.5h10.75v-1.75" />,
  physics: (c: string) => (
    <>
      <Ellipse cx="12" cy="12" rx="9" ry="3.6" />
      <Ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(60 12 12)" />
      <Ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(120 12 12)" />
      <Circle cx="12" cy="12" r="1.6" fill={c} stroke="none" />
    </>
  ),
  chemistry: (c: string) => (
    <>
      <Path d="M9.25 3.25h5.5M10.25 3.25v5.9L5 18.2a1.5 1.5 0 0 0 1.3 2.3h11.4a1.5 1.5 0 0 0 1.3-2.3l-5.25-9.05v-5.9" />
      <Path d="M7.35 14.5h9.3" />
      <Circle cx="10.5" cy="17.4" r="0.95" fill={c} stroke="none" />
      <Circle cx="13.9" cy="16.6" r="0.7" fill={c} stroke="none" />
    </>
  ),
  biology: () => (
    <>
      <Path d="M7 3c0 4.5 10 4.5 10 9s-10 4.5-10 9M17 3c0 4.5-10 4.5-10 9s10 4.5 10 9" />
      <Path d="M8.75 5.25h6.5M8.75 9.75h6.5M8.75 14.25h6.5M8.75 18.75h6.5" />
    </>
  ),
  english: () => (
    <>
      <Path d="M3.25 18.5l4.25-12 4.25 12M4.75 14.5h5.5" />
      <Circle cx="16.5" cy="15.75" r="2.75" />
      <Path d="M19.25 12.5v6" />
    </>
  ),
};
