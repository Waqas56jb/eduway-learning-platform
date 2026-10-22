import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { BottomSheet, Button, Input, Text } from '@/components/ui';
import { useGovernorates, useSchools, type PublicSchool } from '@/api';
import { useI18n } from '@/hooks/useI18n';
import { space } from '@/theme';
import { haptic } from '@/utils/haptics';
import { AUTH_INPUT_STYLE } from './MobileField';
import { PickerRow } from './PickerRow';
import { usePickerBodyHeight } from './usePickerBodyHeight';

interface SchoolPickerProps {
  visible: boolean;
  onClose: () => void;
  /** Governorate id used to rank schools (local schools first). */
  governorate: string;
  /** Current school name (free text or a localized directory name). */
  value: string;
  /** `schoolId` is the directory id (null for a free-text name or a cleared selection). */
  onSelect: (name: string, schoolId: string | null) => void;
}

type Row =
  | { kind: 'header'; key: string; label: string }
  | { kind: 'school'; key: string; school: PublicSchool }
  | { kind: 'custom'; key: string; name: string };

const normalize = (s: string) => s.toLowerCase().replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').trim();

/** Searchable school directory (GET /public/schools); local schools first, free text is allowed. */
export function SchoolPicker({ visible, onClose, governorate, value, onSelect }: SchoolPickerProps) {
  const { t, L } = useI18n('auth');
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const bodyHeight = usePickerBodyHeight(!!value);
  const { data: governorates = [] } = useGovernorates();
  const { data: schools = [] } = useSchools(governorate || undefined, debounced.trim() || undefined, visible);

  useEffect(() => {
    if (!visible) {
      setQuery('');
      setDebounced('');
    }
  }, [visible]);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(id);
  }, [query]);

  const govName = useCallback(
    (id: string) => {
      const g = governorates.find((x) => x.id === id);
      return g ? L(g.name) : '';
    },
    [governorates, L],
  );

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
    if (local.length) {
      out.push({ kind: 'header', key: 'h-local', label: t('pickers.school.inGovernorate', { name: govName(governorate) }) });
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
  }, [query, schools, governorate, t, govName]);

  const pick = useCallback(
    (name: string, id: string | null) => {
      haptic.selection();
      onSelect(name, id);
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
            onPress={() => pick(item.name, null)}
          />
        );
      }
      const name = L(item.school.name);
      const selected = value === item.school.name.en || value === item.school.name.ar;
      return (
        <PickerRow
          title={name}
          subtitle={govName(item.school.governorate)}
          icon="school"
          selected={selected}
          onPress={() => pick(name, item.school.id)}
        />
      );
    },
    [L, t, value, pick, govName],
  );

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={t('pickers.school.title')}
      snap="auto"
      scrollable={false}
      footer={
        value ? (
          <Button
            title={t('pickers.school.clear')}
            variant="ghost"
            size="md"
            icon="close"
            fullWidth
            onPress={() => pick('', null)}
          />
        ) : undefined
      }
    >
      <View style={[styles.body, { height: bodyHeight }]}>
        <Input
          icon="search"
          placeholder={t('pickers.school.search')}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          returnKeyType="done"
          clearButtonMode="while-editing"
          style={AUTH_INPUT_STYLE}
          onSubmitEditing={() => {
            if (query.trim().length >= 2) pick(query.trim(), null);
          }}
          accessibilityLabel={t('pickers.school.search')}
        />
        <FlatList
          data={rows}
          keyExtractor={(r) => r.key}
          renderItem={renderItem}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={styles.list}
          style={styles.flex}
          showsVerticalScrollIndicator={false}
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
  flex: { flex: 1 },
  list: { gap: space.xs, paddingBottom: space.lg },
  header: { marginTop: space.md, marginBottom: space.xs, paddingHorizontal: space.xs },
  empty: { paddingVertical: space.xxl },
});
