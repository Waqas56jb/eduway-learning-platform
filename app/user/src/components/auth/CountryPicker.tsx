import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { BottomSheet, EmptyState, Input, Text } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import { space } from '@/theme';
import { haptic } from '@/utils/haptics';
import { PINNED_COUNTRIES, countryOptions, filterCountries, type CountryOption } from '@/utils/phone';
import { AUTH_INPUT_STYLE } from './MobileField';
import { PickerRow } from './PickerRow';
import { usePickerBodyHeight } from './usePickerBodyHeight';

interface CountryPickerProps {
  visible: boolean;
  onClose: () => void;
  /** Selected ISO country code (e.g. "IQ"). */
  value: string;
  onSelect: (code: string) => void;
}

type Row = { kind: 'header'; key: string; label: string } | { kind: 'country'; key: string; country: CountryOption };

/** Unicode LTR isolate so "+964" never reorders inside Arabic text. */
const ltr = (s: string) => `⁦${s}⁩`;

/**
 * Searchable BottomSheet of every country libphonenumber knows (flag, localized name, calling code).
 * Iraq and the region are pinned on top; search matches EN/AR names, ISO code and calling code.
 */
export function CountryPicker({ visible, onClose, value, onSelect }: CountryPickerProps) {
  const { t, lang } = useI18n('auth');
  const [query, setQuery] = useState('');
  const bodyHeight = usePickerBodyHeight(false);
  const all = useMemo(() => countryOptions(lang === 'ar' ? 'ar' : 'en'), [lang]);

  useEffect(() => {
    if (!visible) setQuery('');
  }, [visible]);

  const rows = useMemo<Row[]>(() => {
    const toRow = (c: CountryOption): Row => ({ kind: 'country', key: c.code, country: c });
    if (query.trim()) return filterCountries(all, query).map(toRow);
    const pinnedCount = PINNED_COUNTRIES.length;
    return [
      { kind: 'header', key: 'h-suggested', label: t('pickers.country.suggested') },
      ...all.slice(0, pinnedCount).map(toRow),
      { kind: 'header', key: 'h-all', label: t('pickers.country.all') },
      ...all.slice(pinnedCount).map(toRow),
    ];
  }, [all, query, t]);

  const renderItem = useCallback(
    ({ item }: { item: Row }) => {
      if (item.kind === 'header') {
        return (
          <Text variant="overline" color="muted" style={styles.header}>
            {item.label}
          </Text>
        );
      }
      const c = item.country;
      return (
        <PickerRow
          title={c.name}
          subtitle={ltr(c.dial)}
          leading={
            <Text style={styles.flag} accessible={false} maxFontSizeMultiplier={1.2}>
              {c.flag}
            </Text>
          }
          selected={c.code === value}
          onPress={() => {
            haptic.selection();
            onSelect(c.code);
            onClose();
          }}
        />
      );
    },
    [value, onSelect, onClose],
  );

  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('pickers.country.title')} snap="auto" scrollable={false}>
      <View style={[styles.body, { height: bodyHeight }]}>
        <Input
          icon="search"
          placeholder={t('pickers.country.search')}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          clearButtonMode="while-editing"
          style={AUTH_INPUT_STYLE}
          accessibilityLabel={t('pickers.country.search')}
        />
        <FlatList
          data={rows}
          keyExtractor={(r) => r.key}
          renderItem={renderItem}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={styles.list}
          style={styles.flex}
          initialNumToRender={16}
          maxToRenderPerBatch={24}
          windowSize={7}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={<EmptyState icon="search" title={t('pickers.country.noResults')} />}
        />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.md },
  flex: { flex: 1 },
  list: { gap: space.xs, paddingBottom: space.lg },
  header: { marginTop: space.md, marginBottom: space.xs, paddingHorizontal: space.xs },
  flag: { fontSize: 20, lineHeight: 26 },
});
