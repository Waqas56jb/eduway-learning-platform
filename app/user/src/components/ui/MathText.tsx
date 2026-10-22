import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';
import { useLangStore } from '@/store/langStore';
import { fontFor, radius, space, useTheme, type ThemeColors } from '@/theme';
import { Text } from './Text';

/* ------------------------------------------------------------------ */
/* Parsing helpers                                                     */
/* ------------------------------------------------------------------ */

const KATEX = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist';
const FONTS_CSS =
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Tajawal:wght@400;500;700&display=swap';
const MATH_RE = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;

type BlockKind = 'p' | 'bullet' | 'number';
interface Block {
  kind: BlockKind;
  /** for numbered items */
  n?: number;
  text: string;
}

/** Split markdown-lite into paragraphs and list items. */
function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ kind: 'p', text: para.join('\n') });
    para = [];
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const bullet = /^\s*[-•]\s+(.*)$/.exec(line) ?? /^\s*\*\s+(.*)$/.exec(line);
    const numbered = /^\s*(\d+)[.)]\s+(.*)$/.exec(line);
    if (!line.trim()) flush();
    else if (bullet) {
      flush();
      blocks.push({ kind: 'bullet', text: bullet[1] });
    } else if (numbered) {
      flush();
      blocks.push({ kind: 'number', n: Number(numbered[1]), text: numbered[2] });
    } else para.push(line.trim());
  }
  flush();
  return blocks;
}

interface Segment {
  text: string;
  bold?: boolean;
  italic?: boolean;
}

/** `**bold**` / `*italic*` inline parsing. */
function parseInline(src: string): Segment[] {
  const out: Segment[] = [];
  const re = /\*\*([^*]+?)\*\*|\*([^*\n]+?)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (m.index > last) out.push({ text: src.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ text: m[1], bold: true });
    else out.push({ text: m[2], italic: true });
    last = m.index + m[0].length;
  }
  if (last < src.length) out.push({ text: src.slice(last) });
  return out;
}

const SYMBOLS: Record<string, string> = {
  times: '×', cdot: '·', div: '÷', pm: '±', mp: '∓', le: '≤', leq: '≤', ge: '≥', geq: '≥', neq: '≠', ne: '≠',
  approx: '≈', infty: '∞', to: '→', rightarrow: '→', Rightarrow: '⇒', leftarrow: '←', degree: '°', circ: '°',
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', Delta: 'Δ', epsilon: 'ε', theta: 'θ', lambda: 'λ', mu: 'μ',
  pi: 'π', rho: 'ρ', sigma: 'σ', Sigma: 'Σ', tau: 'τ', phi: 'φ', omega: 'ω', Omega: 'Ω', int: '∫', sum: 'Σ',
  partial: '∂', nabla: '∇', sqrt: '√', ln: 'ln', log: 'log', sin: 'sin', cos: 'cos', tan: 'tan', lim: 'lim',
};
const SUP: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻', '+': '⁺', n: 'ⁿ' };

/** Best-effort LaTeX → readable plain text (used as a fallback while KaTeX loads). */
export function latexToPlain(latex: string): string {
  let r = latex.replace(/\\(?:text|mathrm|mathbf|operatorname)\s*\{([^{}]*)\}/g, '$1');
  for (let i = 0; i < 4; i++) {
    r = r
      .replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '($1)/($2)')
      .replace(/\\sqrt\s*\{([^{}]*)\}/g, '√($1)');
  }
  r = r
    .replace(/\\(?:left|right|displaystyle|quad|qquad)/g, ' ')
    .replace(/\\[,;:!]/g, ' ')
    .replace(/\\([a-zA-Z]+)/g, (_, name: string) => SYMBOLS[name] ?? name)
    .replace(/\^\{([^{}]*)\}/g, (_, g: string) => (/^[0-9n+-]+$/.test(g) ? g.split('').map((c) => SUP[c] ?? c).join('') : `^(${g})`))
    .replace(/\^([0-9n])/g, (_, c: string) => SUP[c] ?? c)
    .replace(/_\{([^{}]*)\}/g, '_$1')
    .replace(/[{}\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return r;
}

function stripMath(text: string): string {
  return text.replace(MATH_RE, (_, block: string | undefined, inline: string | undefined) => latexToPlain(block ?? inline ?? ''));
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Markdown-lite + LaTeX → HTML body (math left in `.math` spans for KaTeX). */
function toHtmlBody(text: string): string {
  const math: { latex: string; display: boolean }[] = [];
  const protectedText = text.replace(MATH_RE, (_, block: string | undefined, inline: string | undefined) => {
    math.push({ latex: (block ?? inline ?? '').trim(), display: block !== undefined });
    return `\u0001${math.length - 1}\u0002`;
  });
  const inline = (s: string) =>
    escapeHtml(s)
      .replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*\n]+?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br/>')
      .replace(/\u0001(\d+)\u0002/g, (_, i: string) => {
        const m = math[Number(i)];
        return m.display
          ? `<div class="math" data-d="1">${escapeHtml(m.latex)}</div>`
          : `<span class="math">${escapeHtml(m.latex)}</span>`;
      });

  const html: string[] = [];
  let list: 'ul' | 'ol' | null = null;
  const close = () => {
    if (list) html.push(`</${list}>`);
    list = null;
  };
  for (const b of parseBlocks(protectedText)) {
    if (b.kind === 'p') {
      close();
      html.push(`<p>${inline(b.text)}</p>`);
    } else {
      const want = b.kind === 'bullet' ? 'ul' : 'ol';
      if (list !== want) {
        close();
        html.push(want === 'ol' ? `<ol start="${b.n ?? 1}">` : '<ul>');
        list = want;
      }
      html.push(`<li>${inline(b.text)}</li>`);
    }
  }
  close();
  return html.join('');
}

interface DocOptions {
  body: string;
  color: string;
  accent: string;
  size: number;
  isAr: boolean;
  center?: boolean;
}

function buildDocument({ body, color, accent, size, isAr, center }: DocOptions): string {
  const family = isAr ? "'Tajawal','Inter',-apple-system,Roboto,sans-serif" : "'Inter',-apple-system,Roboto,sans-serif";
  const lh = isAr ? 1.65 : 1.47;
  return `<!DOCTYPE html><html dir="${isAr ? 'rtl' : 'ltr'}" lang="${isAr ? 'ar' : 'en'}"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
<link rel="stylesheet" href="${KATEX}/katex.min.css"/><link rel="stylesheet" href="${FONTS_CSS}"/>
<style>
html,body{margin:0;padding:0;background:transparent;overflow:hidden}
body{color:${color};font-family:${family};font-size:${size}px;line-height:${lh};-webkit-text-size-adjust:100%;text-size-adjust:100%;overflow-wrap:break-word;-webkit-user-select:none;user-select:none}
#root{padding:1px 0;${center ? 'text-align:center;' : ''}}
p{margin:0 0 ${Math.round(size * 0.6)}px}p:last-child{margin-bottom:0}
ul,ol{margin:0 0 ${Math.round(size * 0.6)}px;padding-inline-start:1.35em}ul:last-child,ol:last-child{margin-bottom:0}
li{margin:0 0 4px}li::marker{color:${accent};font-weight:700}
strong{font-weight:700}
.katex{font-size:1.08em;direction:ltr;unicode-bidi:isolate}
.katex-display{margin:.45em 0;direction:ltr;overflow-x:auto;overflow-y:hidden}
#root>.math:only-child .katex-display{margin:0}
</style></head><body><div id="root">${body}</div>
<script>
var RN=window.ReactNativeWebView;var last=0;
function post(){var h=Math.ceil(document.getElementById('root').getBoundingClientRect().height);if(h&&h!==last){last=h;RN&&RN.postMessage(JSON.stringify({h:h}));}}
function fail(){RN&&RN.postMessage(JSON.stringify({error:1}));}
function run(){try{var els=document.querySelectorAll('.math');for(var i=0;i<els.length;i++){var el=els[i];katex.render(el.textContent,el,{displayMode:el.getAttribute('data-d')==='1',throwOnError:false});}}catch(e){fail();return;}
post();if(document.fonts&&document.fonts.ready){document.fonts.ready.then(post);}if(window.ResizeObserver){new ResizeObserver(post).observe(document.getElementById('root'));}setTimeout(post,250);setTimeout(post,800);}
</script>
<script src="${KATEX}/katex.min.js" onload="run()" onerror="fail()"></script>
</body></html>`;
}

/* ------------------------------------------------------------------ */
/* WebView renderer                                                    */
/* ------------------------------------------------------------------ */

/** Remember measured heights so recycled rows don't flash the fallback. */
const heightCache = new Map<string, number>();
const LOAD_TIMEOUT = 10000;

const MathWebView = memo(function MathWebView({ html, fallback }: { html: string; fallback: ReactNode }) {
  const [height, setHeight] = useState<number | null>(() => heightCache.get(html) ?? null);
  const [failed, setFailed] = useState(false);
  const readyRef = useRef(height !== null);

  useEffect(() => {
    const id = setTimeout(() => {
      if (!readyRef.current) setFailed(true);
    }, LOAD_TIMEOUT);
    return () => clearTimeout(id);
  }, []);

  const onMessage = useCallback(
    (e: { nativeEvent: { data: string } }) => {
      try {
        const msg = JSON.parse(e.nativeEvent.data) as { h?: number; error?: number };
        if (msg.error) {
          if (!readyRef.current) setFailed(true);
          return;
        }
        if (typeof msg.h === 'number' && msg.h > 0) {
          readyRef.current = true;
          heightCache.set(html, msg.h);
          setHeight((prev) => (prev !== null && Math.abs(prev - msg.h!) < 1 ? prev : msg.h!));
        }
      } catch {
        // ignore malformed messages
      }
    },
    [html],
  );

  const onError = useCallback(() => {
    if (!readyRef.current) setFailed(true);
  }, []);

  if (failed) return <>{fallback}</>;
  const ready = height !== null;

  return (
    <View style={styles.webWrap} pointerEvents="none">
      {ready ? null : fallback}
      <WebView
        source={{ html, baseUrl: 'https://cdn.jsdelivr.net/' }}
        originWhitelist={['*']}
        onMessage={onMessage}
        onError={onError}
        onHttpError={onError}
        scrollEnabled={false}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        overScrollMode="never"
        bounces={false}
        textZoom={100}
        setBuiltInZoomControls={false}
        setSupportMultipleWindows={false}
        allowsLinkPreview={false}
        automaticallyAdjustContentInsets={false}
        androidLayerType="hardware"
        style={[styles.web, ready ? { height } : styles.measuring]}
        containerStyle={ready ? undefined : styles.measuringContainer}
      />
    </View>
  );
});

/* ------------------------------------------------------------------ */
/* Native markdown-lite renderer                                       */
/* ------------------------------------------------------------------ */

function resolveColor(colors: ThemeColors, c: string | undefined): string {
  if (!c) return colors.ink;
  return (colors as unknown as Record<string, string>)[c] ?? c;
}

const NativeMarkdown = memo(function NativeMarkdown({
  text,
  color,
  size,
  block,
  align,
}: {
  text: string;
  color: string;
  size?: number;
  block?: boolean;
  align?: 'start' | 'center';
}) {
  const { colors } = useTheme();
  const isAr = useLangStore((s) => s.isAr);
  const blocks = useMemo(() => parseBlocks(text), [text]);
  const sizeStyle: TextStyle | undefined = size
    ? { fontSize: size, lineHeight: Math.round(size * (isAr ? 1.65 : 1.47)) }
    : undefined;
  const boldFont = fontFor('bold', isAr);
  const gap = block ? space.md : space.sm;

  const renderInline = (src: string) =>
    parseInline(src).map((seg, i) =>
      seg.bold ? (
        <Text key={i} color={color} style={[sizeStyle, { fontFamily: boldFont }]}>
          {seg.text}
        </Text>
      ) : seg.italic ? (
        <Text key={i} color={color} style={[sizeStyle, styles.italic]}>
          {seg.text}
        </Text>
      ) : (
        seg.text
      ),
    );

  return (
    <View style={[styles.native, { gap }]}>
      {blocks.map((b, i) => {
        if (b.kind === 'p') {
          return (
            <Text key={i} variant="body" color={color} align={align} style={sizeStyle}>
              {renderInline(b.text)}
            </Text>
          );
        }
        const marker =
          b.kind === 'bullet' ? (
            <View style={[styles.dot, { backgroundColor: colors.accent, marginTop: ((sizeStyle?.lineHeight as number | undefined) ?? 22) / 2 - 3 }]} />
          ) : (
            <Text variant="bodyBold" color="accent" tabular style={[sizeStyle, styles.num]}>
              {`${b.n ?? i + 1}.`}
            </Text>
          );
        return (
          <View key={i} style={styles.listRow}>
            {marker}
            <Text variant="body" color={color} style={[sizeStyle, styles.listText]}>
              {renderInline(b.text)}
            </Text>
          </View>
        );
      })}
    </View>
  );
});

/* ------------------------------------------------------------------ */
/* Public components                                                   */
/* ------------------------------------------------------------------ */

export interface MathTextProps {
  text: string;
  /** Theme color key or any color string (default `ink`). */
  color?: keyof ThemeColors | (string & {});
  /** Font size in px (default 15). */
  size?: number;
  /** Block layout: full width with roomier paragraph spacing. */
  block?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * Markdown-lite text (`**bold**`, `*italic*`, `- bullets`, `1. lists`, paragraphs) with
 * `$inline$` / `$$display$$` LaTeX. Math is rendered by KaTeX in an auto-sized WebView;
 * plain text renders natively.
 */
export const MathText = memo(function MathText({ text, color, size, block, style }: MathTextProps) {
  const { colors } = useTheme();
  const isAr = useLangStore((s) => s.isAr);
  const resolved = resolveColor(colors, color);
  const hasMath = text.includes('$');

  const html = useMemo(
    () =>
      hasMath
        ? buildDocument({ body: toHtmlBody(text), color: resolved, accent: colors.accent, size: size ?? 15, isAr })
        : '',
    [hasMath, text, resolved, colors.accent, size, isAr],
  );

  const fallbackText = useMemo(() => (hasMath ? stripMath(text) : text), [hasMath, text]);
  const native = <NativeMarkdown text={fallbackText} color={resolved} size={size} block={block} />;

  return (
    <View style={[block ? styles.block : styles.inline, style]}>
      {hasMath ? <MathWebView key={html} html={html} fallback={native} /> : native}
    </View>
  );
});

export interface FormulaProps {
  latex: string;
  color?: keyof ThemeColors | (string & {});
  size?: number;
  /** KaTeX display mode (default true). */
  displayMode?: boolean;
  /** Render without the muted pill background. */
  bare?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** A single centered LaTeX formula in a subtle muted box. */
export const Formula = memo(function Formula({ latex, color, size = 17, displayMode = true, bare, style }: FormulaProps) {
  const { colors } = useTheme();
  const isAr = useLangStore((s) => s.isAr);
  const resolved = resolveColor(colors, color);
  const clean = latex.trim().replace(/^\${1,2}|\${1,2}$/g, '');

  const html = useMemo(() => {
    const body = displayMode
      ? `<div class="math" data-d="1">${escapeHtml(clean)}</div>`
      : `<span class="math">${escapeHtml(clean)}</span>`;
    return buildDocument({ body, color: resolved, accent: colors.accent, size, isAr, center: true });
  }, [clean, displayMode, resolved, colors.accent, size, isAr]);

  const fallback = (
    <Text variant="bodyMedium" color={resolved} align="center" style={{ fontSize: size, lineHeight: Math.round(size * 1.45) }}>
      {latexToPlain(clean)}
    </Text>
  );

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={latexToPlain(clean)}
      style={[
        styles.formula,
        bare ? null : { backgroundColor: colors.surfaceMuted, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth },
        style,
      ]}
    >
      <MathWebView key={html} html={html} fallback={fallback} />
    </View>
  );
});

const styles = StyleSheet.create({
  inline: { alignSelf: 'stretch' },
  block: { alignSelf: 'stretch', width: '100%' },
  webWrap: { alignSelf: 'stretch' },
  web: { backgroundColor: 'transparent', flex: 0 },
  measuring: { height: 1, opacity: 0.01 },
  measuringContainer: { position: 'absolute', top: 0, start: 0, end: 0, height: 1, opacity: 0.01 },
  native: { alignSelf: 'stretch' },
  italic: { fontStyle: 'italic' },
  listRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  dot: { width: 6, height: 6, borderRadius: 3, marginStart: 2 },
  num: { minWidth: 20 },
  listText: { flex: 1 },
  formula: {
    alignSelf: 'stretch',
    borderRadius: radius.md,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    justifyContent: 'center',
  },
});
