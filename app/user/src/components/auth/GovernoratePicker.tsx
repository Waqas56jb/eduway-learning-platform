import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { BottomSheet, EmptyState, Input } from '@/components/ui';
import { useGovernorates, type Governorate } from '@/api';
import { useI18n } from '@/hooks/useI18n';
import { space } from '@/theme';
import { haptic } from '@/utils/haptics';
import { AUTH_INPUT_STYLE } from './MobileField';
import { PickerRow } from './PickerRow';
import { usePickerBodyHeight } from './usePickerBodyHeight';

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
  const [query, setQuery] = useState('');
  const bodyHeight = usePickerBodyHeight(false);
  const { data: governorates = [], isLoading } = useGovernorates();

  useEffect(() => {
    if (!visible) setQuery('');
  }, [visible]);

  const data = useMemo(() => {
    const q = normalize(query);
    if (!q) return governorates;
    return governorates.filter((g) => normalize(g.name.en).includes(q) || normalize(g.name.ar).includes(q));
  }, [query, governorates]);

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
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={t('pickers.governorate.title')}
      snap="auto"
      scrollable={false}
    >
      <View style={[styles.body, { height: bodyHeight }]}>
        <Input
          icon="search"
          placeholder={t('pickers.governorate.search')}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
          style={AUTH_INPUT_STYLE}
          accessibilityLabel={t('pickers.governorate.search')}
        />
        <FlatList
          data={data}
          keyExtractor={(g) => g.id}
          renderItem={renderItem}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={styles.list}
          style={styles.flex}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={isLoading ? null : <EmptyState icon="search" title={t('pickers.noResults')} />}
        />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.md },
  flex: { flex: 1 },
  list: { gap: space.xs, paddingBottom: space.lg },
});
