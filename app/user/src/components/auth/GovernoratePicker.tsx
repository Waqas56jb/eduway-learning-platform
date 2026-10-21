import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, useWindowDimensions, View } from 'react-native';
import { BottomSheet, EmptyState, Input } from '@/components/ui';
import { governorates } from '@/data';
import { useI18n } from '@/hooks/useI18n';
import { space } from '@/theme';
import { haptic } from '@/utils/haptics';
import { PickerRow } from './PickerRow';

type Governorate = (typeof governorates)[number];

interface GovernoratePickerProps {
  visible: boolean;
  onClose: () => void;
  value: string;
  onSelect: (id: string) => void;
}

const normalize = (s: string) => s.toLowerCase().replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').trim();

/** Searchable BottomSheet listing Iraq's governorates (localized, checkmark on selection). */
export function GovernoratePicker({ visible, onClose, value, onSelect }: GovernoratePickerProps) {
  const { t, L } = useI18n('auth');
  const { height } = useWindowDimensions();
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!visible) setQuery('');
  }, [visible]);

  const data = useMemo(() => {
    const q = normalize(query);
    if (!q) return governorates;
    return governorates.filter((g) => normalize(g.name.en).includes(q) || normalize(g.name.ar).includes(q));
  }, [query]);

  const renderItem = useCallback(
    ({ item }: { item: Governorate }) => (
      <PickerRow
        title={L(item.name)}
        icon="map-pin"
        selected={item.id === value}
        onPress={() => {
          haptic.selection();
          onSelect(item.id);
          onClose();
        }}
      />
    ),
    [L, value, onSelect, onClose],
  );

  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('pickers.governorate.title')} snap="full">
      <View style={styles.body}>
        <Input
          icon="search"
          placeholder={t('pickers.governorate.search')}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel={t('pickers.governorate.search')}
        />
        <FlatList
          data={data}
          keyExtractor={(g) => g.id}
          renderItem={renderItem}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.list}
          style={{ maxHeight: height * 0.6 }}
          ListEmptyComponent={<EmptyState icon="search" title={t('pickers.noResults')} />}
        />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.md },
  list: { gap: space.xs, paddingBottom: space.lg },
});
