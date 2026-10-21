import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, useWindowDimensions, View } from 'react-native';
import { BottomSheet, Button, Input, Text } from '@/components/ui';
import { getGovernorate } from '@/data';
import { schools, type School } from '@/data/schools';
import { useI18n } from '@/hooks/useI18n';
import { space } from '@/theme';
import { haptic } from '@/utils/haptics';
import { PickerRow } from './PickerRow';

interface SchoolPickerProps {
  visible: boolean;
  onClose: () => void;
  /** Governorate id used to rank schools (local schools first). */
  governorate: string;
  /** Current school name (free text or a localized directory name). */
  value: string;
  onSelect: (name: string) => void;
}

type Row =
  | { kind: 'header'; key: string; label: string }
  | { kind: 'school'; key: string; school: School }
  | { kind: 'custom'; key: string; name: string };

const normalize = (s: string) => s.toLowerCase().replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').trim();

/** Searchable school directory; schools in the chosen governorate come first, free text is allowed. */
export function SchoolPicker({ visible, onClose, governorate, value, onSelect }: SchoolPickerProps) {
  const { t, L } = useI18n('auth');
  const { height } = useWindowDimensions();
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!visible) setQuery('');
  }, [visible]);

  const rows = useMemo<Row[]>(() => {
    const q = normalize(query);
    const matches = q
      ? schools.filter((s) => normalize(s.name.en).includes(q) || normalize(s.name.ar).includes(q))
      : schools;
    const local = matches.filter((s) => s.governorate === governorate);
    const others = matches.filter((s) => s.governorate !== governorate);
    const out: Row[] = [];
    const typed = query.trim();
    const exact = matches.some((s) => normalize(s.name.en) === q || normalize(s.name.ar) === q);
    if (typed.length >= 2 && !exact) out.push({ kind: 'custom', key: 'custom', name: typed });
    const gov = getGovernorate(governorate);
    if (local.length) {
      out.push({ kind: 'header', key: 'h-local', label: t('pickers.school.inGovernorate', { name: L(gov?.name) }) });
      local.forEach((s) => out.push({ kind: 'school', key: s.id, school: s }));
    }
    if (others.length) {
      out.push({
        kind: 'header',
        key: 'h-others',
        label: local.length ? t('pickers.school.otherSchools') : t('pickers.school.allSchools'),
      });
      others.forEach((s) => out.push({ kind: 'school', key: s.id, school: s }));
    }
    return out;
  }, [query, governorate, t, L]);

  const pick = useCallback(
    (name: string) => {
      haptic.selection();
      onSelect(name);
      onClose();
    },
    [onSelect, onClose],
  );

  const renderItem = useCallback(
    ({ item }: { item: Row }) => {
      if (item.kind === 'header') {
        return (
          <Text variant="overline" color="muted" style={styles.header}>
            {item.label}
          </Text>
        );
      }
      if (item.kind === 'custom') {
        return (
          <PickerRow
            title={t('pickers.school.useCustom', { name: item.name })}
            subtitle={t('pickers.school.customHint')}
            icon="edit"
            onPress={() => pick(item.name)}
          />
        );
      }
      const name = L(item.school.name);
      const selected = value === item.school.name.en || value === item.school.name.ar;
      return (
        <PickerRow
          title={name}
          subtitle={L(getGovernorate(item.school.governorate)?.name)}
          icon="school"
          selected={selected}
          onPress={() => pick(name)}
        />
      );
    },
    [L, t, value, pick],
  );

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={t('pickers.school.title')}
      snap="full"
      footer={
        value ? (
          <Button title={t('pickers.school.clear')} variant="ghost" size="md" fullWidth onPress={() => pick('')} />
        ) : undefined
      }
    >
      <View style={styles.body}>
        <Input
          icon="search"
          placeholder={t('pickers.school.search')}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={() => {
            if (query.trim().length >= 2) pick(query.trim());
          }}
          accessibilityLabel={t('pickers.school.search')}
        />
        <FlatList
          data={rows}
          keyExtractor={(r) => r.key}
          renderItem={renderItem}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.list}
          style={{ maxHeight: height * 0.55 }}
          ListEmptyComponent={
            <Text variant="body" color="muted" align="center" style={styles.empty}>
              {t('pickers.noResults')}
            </Text>
          }
        />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.md },
  list: { gap: space.xs, paddingBottom: space.lg },
  header: { marginTop: space.md, marginBottom: space.xs, paddingHorizontal: space.xs },
  empty: { paddingVertical: space.xxl },
});
