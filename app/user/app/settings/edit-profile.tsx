import { zodResolver } from '@hookform/resolvers/zod';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Keyboard, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { z } from 'zod';
import { Icon } from '@/components/icons';
import { Header, Screen } from '@/components/layout';
import { AVATAR_OPTIONS } from '@/components/settings';
import { Avatar, BottomSheet, Button, Input, PressableScale, Text, toast } from '@/components/ui';
import { BLURHASH } from '@/constants/images';
import { useAppConfig, useGovernorates, useMeQuery, useUpdateMe, type UpdateMeBody } from '@/api';
import { useI18n } from '@/hooks/useI18n';
import { useAuthStore } from '@/store/authStore';
import { useLangStore } from '@/store/langStore';
import { palette, radius, SCREEN_PADDING, space, useTheme } from '@/theme';
import { haptic } from '@/utils/haptics';
import { formatPhoneInternational } from '@/utils/phone';

/** True while the software keyboard is on screen. */
function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const a = Keyboard.addListener(showEvt, () => setVisible(true));
    const b = Keyboard.addListener(hideEvt, () => setVisible(false));
    return () => {
      a.remove();
      b.remove();
    };
  }, []);
  return visible;
}

export default function EditProfileScreen() {
  const { t, L } = useI18n('settings');
  const isAr = useLangStore((s) => s.isAr);
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardVisible();
  const user = useAuthStore((s) => s.user);
  useMeQuery();
  const updateMe = useUpdateMe();
  const { data: governorates = [] } = useGovernorates();
  // Avatar presets are server-configured (PUB-01 `avatarPresets`); the bundled list is only a fallback.
  const presets = useAppConfig().data?.avatarPresets;
  const avatarOptions = presets?.length ? presets : AVATAR_OPTIONS;
  const initialAvatar = user?.avatar || '';
  const [avatar, setAvatar] = useState(initialAvatar);
  const [avatarSheet, setAvatarSheet] = useState(false);
  const [govSheet, setGovSheet] = useState(false);
  const saving = updateMe.isPending;
  const schoolRef = useRef<TextInput>(null);

  const schema = useMemo(
    () =>
      z.object({
        name: z
          .string()
          .trim()
          .min(1, t('editProfile.errors.nameRequired'))
          .min(3, t('editProfile.errors.nameShort'))
          .max(60, t('editProfile.errors.nameLong')),
        governorate: z.string().min(1, t('editProfile.errors.governorateRequired')),
        school: z.string().trim().max(80, t('editProfile.errors.schoolLong')),
      }),
    [t],
  );
  type FormValues = z.infer<typeof schema>;

  const {
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: user ? L(user.name) : '',
      governorate: user?.governorate ?? '',
      school: user ? L(user.school) : '',
    },
  });

  const governorateId = watch('governorate');
  const governorateName = L(governorates.find((g) => g.id === governorateId)?.name);
  const changed = isDirty || avatar !== initialAvatar;
  const initialSchool = user ? L(user.school) : '';

  const onSave = handleSubmit(
    async (values) => {
      Keyboard.dismiss();
      // PATCH /me — only send what changed; a typed school replaces the directory pick.
      const body: UpdateMeBody = { name: values.name.trim(), governorateId: values.governorate };
      if (values.school.trim() !== initialSchool.trim()) {
        body.schoolId = null;
        body.schoolName = values.school.trim() || null;
      }
      if (avatar && avatar !== initialAvatar) body.avatarPreset = avatar;
      try {
        await updateMe.mutateAsync(body);
      } catch {
        haptic.error();
        return;
      }
      haptic.success();
      toast.success(t('editProfile.saved'));
      router.back();
    },
    () => haptic.error(),
  );

  if (!user) return <Screen />;

  const footerPad = keyboardVisible ? space.md : Math.max(insets.bottom, space.lg);

  return (
    <Screen padded={false} keyboard>
      <Header title={t('editProfile.title')} />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInDown.duration(320)} style={styles.avatarBlock}>
          <PressableScale
            onPress={() => setAvatarSheet(true)}
            accessibilityRole="button"
            accessibilityLabel={t('editProfile.changePhoto')}
            hitSlop={8}
          >
            <Avatar uri={avatar} name={L(user.name)} size={108} ring />
            <View style={[styles.camBadge, { borderColor: colors.background }]}>
              <Icon name="image" size={15} color={palette.navy} strokeWidth={2.2} />
            </View>
          </PressableScale>
          <Pressable
            onPress={() => setAvatarSheet(true)}
            onPressIn={() => haptic.light()}
            hitSlop={8}
            accessibilityRole="button"
            style={({ pressed }) => [styles.changeLink, pressed && styles.pressed]}
          >
            <Text variant="label" color={isDark ? colors.accentLight : colors.accent}>
              {t('editProfile.changePhoto')}
            </Text>
          </Pressable>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(320).delay(60)}>
          <Text variant="overline" color="muted" style={[styles.section, !isAr && styles.upper]}>
            {t('editProfile.sections.personal')}
          </Text>
          <View style={styles.form}>
            <Controller
              control={control}
              name="name"
              render={({ field: { value, onChange, onBlur } }) => (
                <Input
                  label={t('editProfile.name')}
                  placeholder={t('editProfile.namePlaceholder')}
                  icon="user"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.name?.message}
                  autoCapitalize="words"
                  autoComplete="name"
                  textContentType="name"
                  returnKeyType="next"
                  submitBehavior="submit"
                  onSubmitEditing={() => schoolRef.current?.focus()}
                />
              )}
            />

            <View>
              <Text variant="label" color={errors.governorate ? colors.danger : colors.ink} style={styles.fieldLabel}>
                {t('editProfile.governorate')}
              </Text>
              <PressableScale
                onPress={() => {
                  Keyboard.dismiss();
                  setGovSheet(true);
                }}
                scaleTo={0.985}
                accessibilityRole="button"
                accessibilityLabel={`${t('editProfile.governorate')}: ${governorateName || t('editProfile.governoratePlaceholder')}`}
                style={[
                  styles.picker,
                  { backgroundColor: colors.surface, borderColor: errors.governorate ? colors.danger : colors.border },
                ]}
              >
                <View style={styles.pickerIcon}>
                  <Icon name="map-pin" size={20} color={colors.muted} />
                </View>
                <Text variant="body" color={governorateName ? 'ink' : 'muted'} style={styles.flex} numberOfLines={1}>
                  {governorateName || t('editProfile.governoratePlaceholder')}
                </Text>
                <Icon name="chevron-down" size={18} color={colors.muted} />
              </PressableScale>
              {errors.governorate?.message ? (
                <View style={styles.errorRow}>
                  <Icon name="alert" size={14} color={colors.danger} strokeWidth={2} />
                  <Text variant="caption" color="danger" style={styles.flex}>
                    {errors.governorate.message}
                  </Text>
                </View>
              ) : null}
            </View>

            <Controller
              control={control}
              name="school"
              render={({ field: { value, onChange, onBlur } }) => (
                <Input
                  ref={schoolRef}
                  label={t('editProfile.school')}
                  placeholder={t('editProfile.schoolPlaceholder')}
                  icon="school"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.school?.message}
                  returnKeyType="done"
                  onSubmitEditing={() => void onSave()}
                />
              )}
            />
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(320).delay(120)}>
          <Text variant="overline" color="muted" style={[styles.section, !isAr && styles.upper]}>
            {t('editProfile.sections.account')}
          </Text>
          <Input
            label={t('editProfile.mobile')}
            icon="phone"
            value={formatPhoneInternational(user.mobile)}
            editable={false}
            keyboardType="phone-pad"
            hint={t('editProfile.mobileLocked')}
            rightElement={<Icon name="lock" size={18} color={colors.muted} />}
            accessibilityState={{ disabled: true }}
          />
        </Animated.View>
      </ScrollView>

      {/* Sticky save bar — rides above the keyboard (Screen keyboard avoidance). */}
      <View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.border, paddingBottom: footerPad }]}>
        <Button
          title={t('editProfile.save')}
          size="lg"
          icon="check"
          fullWidth
          loading={saving}
          disabled={!changed}
          onPress={() => void onSave()}
        />
      </View>

      <BottomSheet visible={avatarSheet} onClose={() => setAvatarSheet(false)} title={t('editProfile.choosePhoto')}>
        <View style={styles.avatarGrid}>
          {avatarOptions.map((uri, i) => {
            const selected = uri === avatar;
            return (
              <PressableScale
                key={uri}
                onPress={() => {
                  haptic.selection();
                  setAvatar(uri);
                  setAvatarSheet(false);
                }}
                haptics={false}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={t('editProfile.photoOption', { n: i + 1 })}
                style={[styles.avatarOption, { borderColor: selected ? colors.accent : colors.border }]}
              >
                <Image
                  source={{ uri }}
                  placeholder={{ blurhash: BLURHASH }}
                  transition={300}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  style={styles.avatarImg}
                />
                {selected ? (
                  <View style={[styles.avatarCheck, { backgroundColor: colors.accent }]}>
                    <Icon name="check" size={12} color={palette.navy} strokeWidth={2.8} />
                  </View>
                ) : null}
              </PressableScale>
            );
          })}
        </View>
      </BottomSheet>

      <BottomSheet visible={govSheet} onClose={() => setGovSheet(false)} title={t('editProfile.chooseGovernorate')} snap="half" scrollable>
        {governorates.map((g) => {
          const selected = g.id === governorateId;
          return (
            <Pressable
              key={g.id}
              onPressIn={() => haptic.selection()}
              onPress={() => {
                setValue('governorate', g.id, { shouldValidate: true, shouldDirty: true });
                setGovSheet(false);
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              style={({ pressed }) => [
                styles.govRow,
                selected && { backgroundColor: colors.accentSoft },
                pressed && !selected && { backgroundColor: colors.surfaceMuted },
              ]}
            >
              <Text variant={selected ? 'bodyBold' : 'body'} style={styles.flex} numberOfLines={1}>
                {L(g.name)}
              </Text>
              {selected ? <Icon name="check" size={18} color={colors.accent} strokeWidth={2.4} /> : null}
            </Pressable>
          );
        })}
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: SCREEN_PADDING, paddingBottom: space.xxl },
  avatarBlock: { alignItems: 'center', gap: space.sm, paddingTop: space.lg, paddingBottom: space.xl },
  camBadge: {
    position: 'absolute',
    bottom: 2,
    end: 2,
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 3,
    backgroundColor: palette.goldLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  changeLink: { minHeight: 36, paddingHorizontal: space.md, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.6 },
  section: { marginBottom: space.md, marginStart: space.xs },
  upper: { textTransform: 'uppercase' },
  form: { gap: space.lg, marginBottom: space.xxl + space.xs },
  fieldLabel: { marginBottom: space.sm },
  picker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm + 2,
    minHeight: 52,
    paddingHorizontal: space.lg - 2,
    borderRadius: radius.md,
    borderWidth: 1.25,
  },
  pickerIcon: { width: 22, alignItems: 'center', justifyContent: 'center' },
  errorRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: space.sm - 2 },
  footer: {
    paddingHorizontal: SCREEN_PADDING,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  avatarGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, paddingBottom: space.lg },
  avatarOption: { flexGrow: 1, flexBasis: '21%', maxWidth: '25%', aspectRatio: 1, borderRadius: radius.lg, borderWidth: 2.5, padding: 3 },
  avatarImg: { flex: 1, borderRadius: radius.md },
  avatarCheck: {
    position: 'absolute',
    top: 6,
    end: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  govRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    paddingHorizontal: space.md,
    borderRadius: radius.sm,
  },
});
