import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { forwardRef, memo, useCallback, useImperativeHandle, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Icon } from '@/components/icons';
import { BottomSheet, PressableScale, Text } from '@/components/ui';
import { BLURHASH, images } from '@/constants/images';
import { useI18n } from '@/hooks/useI18n';
import { fontFor, gradients, HIT_SLOP, palette, radius, shadows, space, useTheme } from '@/theme';
import { haptic } from '@/utils/haptics';

const LINE_HEIGHT = 22;
const MAX_LINES = 5;
const V_PAD = 10;

/** Mock "camera roll" of question photos. */
const SAMPLE_IMAGES = [images.mathBoard, images.physics, images.chemistryGlassware, images.studyDesk];

export interface ComposerHandle {
  /** Put text in the input (e.g. from a suggestion) and focus it. */
  focus: () => void;
}

interface ComposerProps {
  onSend: (text: string, imageUri?: string) => void;
  /** Allowance exhausted — input disabled. */
  disabled?: boolean;
  /** Tutor is replying — sending is blocked but typing is allowed. */
  busy?: boolean;
  placeholder: string;
  accentColor?: string;
}

/** Chat input: auto-growing multiline field, mock image attach, gold send button. */
export const Composer = memo(
  forwardRef<ComposerHandle, ComposerProps>(function Composer({ onSend, disabled, busy, placeholder, accentColor }, ref) {
    const { colors } = useTheme();
    const { t, isAr } = useI18n('tutor');
    const inputRef = useRef<TextInput>(null);
    const [text, setText] = useState('');
    const [imageUri, setImageUri] = useState<string | undefined>();
    const [attachOpen, setAttachOpen] = useState(false);
    const [focused, setFocused] = useState(false);

    useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }), []);

    const canSend = !disabled && !busy && (text.trim().length > 0 || !!imageUri);

    const submit = useCallback(() => {
      if (!canSend) return;
      const body = text.trim() || t('composer.imageOnly');
      haptic.medium();
      onSend(body, imageUri);
      setText('');
      setImageUri(undefined);
    }, [canSend, imageUri, onSend, t, text]);

    const pick = (uri: string) => {
      haptic.selection();
      setImageUri(uri);
      setAttachOpen(false);
    };

    return (
      <View style={styles.wrap}>
        {imageUri ? (
          <Animated.View
            entering={FadeIn.duration(200)}
            exiting={FadeOut.duration(150)}
            style={[styles.preview, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <Image
              source={{ uri: imageUri }}
              placeholder={{ blurhash: BLURHASH }}
              transition={200}
              contentFit="cover"
              cachePolicy="memory-disk"
              style={styles.previewImg}
            />
            <Icon name="image" size={14} color={colors.accent} />
            <Text variant="label" color="ink">
              {t('composer.imageAttached')}
            </Text>
            <Pressable
              onPress={() => {
              haptic.light();
              setImageUri(undefined);
            }}
              hitSlop={HIT_SLOP}
              accessibilityRole="button"
              accessibilityLabel={t('composer.removeImage')}
              style={[styles.previewClose, { backgroundColor: colors.surfaceMuted }]}
            >
              <Icon name="close" size={12} color={colors.muted} />
            </Pressable>
          </Animated.View>
        ) : null}

        <View
          style={[
            styles.bar,
            shadows.md,
            {
              backgroundColor: colors.surface,
              borderColor: focused ? colors.accent : colors.border,
              opacity: disabled ? 0.6 : 1,
            },
          ]}
        >
          <Pressable
            onPress={() => {
              haptic.light();
              setAttachOpen(true);
            }}
            disabled={disabled}
            hitSlop={HIT_SLOP}
            accessibilityRole="button"
            accessibilityLabel={t('composer.attach')}
            style={({ pressed }) => [
              styles.iconBtn,
              pressed && { backgroundColor: colors.surfaceMuted, transform: [{ scale: 0.92 }] },
            ]}
          >
            <Icon name="paperclip" size={22} color={imageUri ? colors.accent : colors.muted} />
          </Pressable>

          <TextInput
            ref={inputRef}
            value={text}
            onChangeText={setText}
            editable={!disabled}
            multiline
            placeholder={placeholder}
            placeholderTextColor={colors.muted}
            selectionColor={accentColor ?? colors.accent}
            cursorColor={colors.accent}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            accessibilityLabel={placeholder}
            textAlignVertical="center"
            scrollEnabled
            maxLength={1200}
            style={[
              styles.input,
              {
                color: colors.ink,
                fontFamily: fontFor('regular', isAr),
                writingDirection: isAr ? 'rtl' : 'ltr',
              },
            ]}
          />

          <PressableScale
            onPress={submit}
            disabled={!canSend}
            disabledOpacity={1}
            scaleTo={0.9}
            haptics={false}
            accessibilityRole="button"
            accessibilityLabel={t('composer.send')}
            accessibilityState={{ disabled: !canSend }}
            style={styles.send}
          >
            <View style={[styles.sendFill, { backgroundColor: colors.surfaceMuted }]} pointerEvents="none">
              <Icon name="send" size={20} color={colors.muted} mirrorInRTL />
            </View>
            <View style={[styles.sendFill, !canSend && styles.hidden]} pointerEvents="none">
              <LinearGradient
                colors={gradients.gold}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[StyleSheet.absoluteFill, styles.round]}
              />
              <Icon name="send" size={20} color={palette.navy} mirrorInRTL />
            </View>
          </PressableScale>
        </View>

        <BottomSheet visible={attachOpen} onClose={() => setAttachOpen(false)} title={t('attach.title')} snap="auto">
          <Text variant="body" color="muted" style={styles.attachHint}>
            {t('attach.subtitle')}
          </Text>
          <View style={styles.grid}>
            {SAMPLE_IMAGES.map((uri, i) => (
              <PressableScale
                key={uri}
                onPress={() => pick(uri)}
                accessibilityRole="button"
                accessibilityLabel={t('attach.sample', { n: i + 1 })}
                style={[
                  styles.tile,
                  { borderColor: uri === imageUri ? colors.accent : colors.border, backgroundColor: colors.surfaceMuted },
                ]}
              >
                <Image
                  source={{ uri }}
                  placeholder={{ blurhash: BLURHASH }}
                  transition={300}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  style={StyleSheet.absoluteFill}
                />
                {uri === imageUri ? (
                  <View style={[styles.tileCheck, { backgroundColor: colors.accent }]}>
                    <Icon name="check" size={14} color={palette.navy} />
                  </View>
                ) : null}
              </PressableScale>
            ))}
          </View>
        </BottomSheet>
      </View>
    );
  }),
);

const SEND = 44;
const BAR_PAD = 4;

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  preview: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: space.sm,
    padding: 4,
    paddingEnd: 4,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  previewImg: { width: 32, height: 32, borderRadius: 16 },
  previewClose: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    padding: BAR_PAD,
    borderRadius: (SEND + BAR_PAD * 2) / 2,
    borderWidth: 1,
  },
  iconBtn: { width: SEND, height: SEND, borderRadius: SEND / 2, alignItems: 'center', justifyContent: 'center' },
  input: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    lineHeight: LINE_HEIGHT,
    minHeight: SEND,
    maxHeight: LINE_HEIGHT * MAX_LINES + V_PAD * 2,
    paddingTop: V_PAD + 1,
    paddingBottom: V_PAD + 1,
    paddingHorizontal: space.xs,
  },
  send: { width: SEND, height: SEND, borderRadius: SEND / 2 },
  sendFill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    start: 0,
    end: 0,
    borderRadius: SEND / 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  round: { borderRadius: SEND / 2 },
  hidden: { opacity: 0 },
  attachHint: { marginBottom: space.lg },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, paddingBottom: space.lg },
  tile: {
    width: '47%',
    aspectRatio: 4 / 3,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 2,
  },
  tileCheck: {
    position: 'absolute',
    top: space.sm,
    end: space.sm,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
