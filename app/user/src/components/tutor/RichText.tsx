import { memo, useMemo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui';
import { useLangStore } from '@/store/langStore';
import { fontFor, space } from '@/theme';

interface RichTextProps {
  text: string;
  color: string;
  accent: string;
}

type Line = { kind: 'p' | 'bullet' | 'number'; marker?: string; text: string };

function parseLines(src: string): Line[][] {
  // Paragraph groups separated by blank lines.
  return src
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((group) =>
      group
        .split('\n')
        .filter((l) => l.trim().length > 0)
        .map<Line>((raw) => {
          const line = raw.trim();
          const bullet = /^[-•*]\s+(.*)$/.exec(line);
          if (bullet) return { kind: 'bullet', text: bullet[1] ?? '' };
          const num = /^(\d+)[.)]\s+(.*)$/.exec(line);
          if (num) return { kind: 'number', marker: `${num[1]}.`, text: num[2] ?? '' };
          return { kind: 'p', text: line };
        }),
    )
    .filter((g) => g.length > 0);
}

/** `**bold**` and `*italic*` spans as nested native Text. */
function renderInline(src: string, boldFamily: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(src))) {
    if (m.index > last) out.push(src.slice(last, m.index));
    if (m[1] !== undefined) {
      out.push(
        <Text key={`${keyPrefix}-${i++}`} variant="body" style={{ fontFamily: boldFamily }}>
          {renderInline(m[1], boldFamily, `${keyPrefix}-b${i}`)}
        </Text>,
      );
    } else if (m[2] !== undefined) {
      out.push(
        <Text key={`${keyPrefix}-${i++}`} variant="body" style={styles.italic}>
          {m[2]}
        </Text>,
      );
    }
    last = m.index + m[0].length;
  }
  if (last < src.length) out.push(src.slice(last));
  return out;
}

/**
 * Lightweight native renderer for tutor replies without LaTeX: paragraphs,
 * bullets, numbered steps, bold/italic. Plain `Text` only — no WebView.
 */
export const RichText = memo(function RichText({ text, color, accent }: RichTextProps) {
  const isAr = useLangStore((s) => s.isAr);
  const groups = useMemo(() => parseLines(text), [text]);
  const bold = fontFor('bold', isAr);

  return (
    <View style={styles.root}>
      {groups.map((lines, gi) => (
        <View key={gi} style={styles.group}>
          {lines.map((line, li) => {
            const key = `${gi}-${li}`;
            const body = (
              <Text variant="body" color={color} style={line.kind === 'p' ? undefined : styles.itemText}>
                {renderInline(line.text, bold, key)}
              </Text>
            );
            if (line.kind === 'p') return <View key={key}>{body}</View>;
            return (
              <View key={key} style={styles.item}>
                {line.kind === 'bullet' ? (
                  <View style={styles.bulletBox}>
                    <View style={[styles.bullet, { backgroundColor: accent }]} />
                  </View>
                ) : (
                  <Text variant="bodyBold" color={accent} tabular style={styles.number}>
                    {line.marker}
                  </Text>
                )}
                {body}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  root: { gap: space.md },
  group: { gap: space.xs + 2 },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  itemText: { flex: 1 },
  bulletBox: { height: 22, justifyContent: 'center' },
  bullet: { width: 6, height: 6, borderRadius: 3 },
  number: { minWidth: 18 },
  italic: { fontStyle: 'italic' },
});
