import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Icon } from '@/components/icons';
import { BottomSheet, Card, PressableScale, ProgressBar, Text } from '@/components/ui';
import { getResourceUrl } from '@/api/catalog';
import { handleActionError } from '@/api/locked';
import { useI18n } from '@/hooks/useI18n';
import { space, useTheme } from '@/theme';
import type { Resource } from '@/types';
import { haptic } from '@/utils/haptics';

/** PDF resources: signed download URL (GET /lessons/:id/resources/:rid/url) opened in the in-app browser. */
export const ResourceList = memo(function ResourceList({ resources, lessonId }: { resources: Resource[]; lessonId: string }) {
  const { t, L } = useI18n('lesson');
  const { colors } = useTheme();
  const [opening, setOpening] = useState<Resource | null>(null);
  const [progress, setProgress] = useState(0);
  const [downloaded, setDownloaded] = useState<Set<string>>(() => new Set());
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  useEffect(() => {
    if (!opening) return;
    let cancelled = false;
    setProgress(0);
    const p = setTimeout(() => setProgress(70), 60);
    const key = L(opening.title);
    void (async () => {
      try {
        if (!opening.id) throw new Error('missing resource id');
        const res = await getResourceUrl(lessonId, opening.id);
        if (cancelled || !mounted.current) return;
        setProgress(100);
        setDownloaded((prev) => new Set(prev).add(key));
        setOpening(null);
        haptic.success();
        await WebBrowser.openBrowserAsync(res.url).catch(() => undefined);
      } catch (err) {
        if (cancelled || !mounted.current) return;
        setOpening(null);
        handleActionError(err);
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(p);
    };
  }, [opening, L, lessonId]);

  const close = useCallback(() => setOpening(null), []);

  if (!resources.length) {
    return (
      <Card variant="muted" elevated={false}>
        <Text variant="body" color="muted">
          {t('resources.empty')}
        </Text>
      </Card>
    );
  }

  return (
    <>
      <Card padded={false}>
        {resources.map((r, i) => {
          const title = L(r.title);
          const isDone = downloaded.has(title);
          return (
            <Animated.View key={`${title}-${i}`} entering={FadeInDown.duration(250).delay(i * 40)}>
              {i > 0 ? <View style={[styles.sep, { backgroundColor: colors.border }]} /> : null}
              <PressableScale
                onPress={() => setOpening(r)}
                accessibilityRole="button"
                accessibilityLabel={t('resources.openA11y', { title })}
                style={styles.row}
              >
                <View style={[styles.fileIcon, { backgroundColor: colors.dangerSoft }]}>
                  <Icon name="file-pdf" size={22} color={colors.danger} />
                </View>
                <View style={styles.texts}>
                  <Text variant="bodyMedium" numberOfLines={2}>
                    {title}
                  </Text>
                  <Text variant="caption" color="muted" tabular>
                    {`${t('resources.pdf')} · ${r.size} · ${t('resources.pages', { count: r.pages })}`}
                  </Text>
                </View>
                <View style={[styles.action, { backgroundColor: isDone ? colors.successSoft : colors.accentSoft }]}>
                  <Icon name={isDone ? 'check' : 'download'} size={18} color={isDone ? colors.success : colors.accent} />
                </View>
              </PressableScale>
            </Animated.View>
          );
        })}
      </Card>

      <BottomSheet visible={!!opening} onClose={close} title={t('resources.openingTitle')}>
        <View style={styles.sheet}>
          <View style={styles.sheetRow}>
            <View style={[styles.fileIconLg, { backgroundColor: colors.dangerSoft }]}>
              <Icon name="file-pdf" size={28} color={colors.danger} />
            </View>
            <View style={styles.texts}>
              <Text variant="bodyBold" numberOfLines={2}>
                {opening ? L(opening.title) : ''}
              </Text>
              <Text variant="caption" color="muted" tabular>
                {opening ? `${opening.size} · ${t('resources.pages', { count: opening.pages })}` : ''}
              </Text>
            </View>
          </View>
          <Text variant="body" color="muted">
            {opening ? t('resources.openingMessage', { title: L(opening.title) }) : ''}
          </Text>
          <ProgressBar progress={progress} gradient height={8} />
        </View>
      </BottomSheet>
    </>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, minHeight: 72 },
  sep: { height: StyleSheet.hairlineWidth, marginStart: space.lg + 44 + space.md },
  fileIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  fileIconLg: { width: 56, height: 56, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  texts: { flex: 1, gap: 2 },
  action: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  sheet: { gap: space.lg, paddingBottom: space.lg },
  sheetRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
});
