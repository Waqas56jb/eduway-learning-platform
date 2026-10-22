import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { directionStyle, isRTL as getIsRTL } from '@/utils/rtl';
import { ActivityIndicator, Modal, Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { useEvent, useEventListener } from 'expo';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as ScreenOrientation from 'expo-screen-orientation';
import { StatusBar } from 'expo-status-bar';
import { useVideoPlayer, VideoView } from 'expo-video';
import { GestureDetector, Gesture, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '@/components/icons';
import { cueAt, parseVtt, type Cue, type Quality } from '@/components/lesson/player/captions';
import { SeekBar } from '@/components/lesson/player/SeekBar';
import { SeekRipple } from '@/components/lesson/player/SeekRipple';
import { formatSpeed, SettingsMenu } from '@/components/lesson/player/SettingsMenu';
import { PressableScale, Text, toast } from '@/components/ui';
import { BLURHASH } from '@/constants/images';
import { useI18n } from '@/hooks/useI18n';
import { HIT_SLOP, palette, radius, space } from '@/theme';
import { formatDuration } from '@/utils/format';
import { haptic } from '@/utils/haptics';

export interface VideoPlayerProps {
  uri: string;
  poster?: string;
  initialPositionSec?: number;
  /** Called about once per second with the current position and total duration (seconds). */
  onProgress?: (sec: number, duration: number) => void;
  onEnd?: () => void;
  title?: string;
  /** Optional back action shown in the top-start corner of the controls (inline mode). */
  onBack?: () => void;
  /** Signed WebVTT tracks (StreamUrlDto.captions). */
  captionTracks?: { lang: string; url: string }[];
  /** Fixed-quality mp4 renditions (StreamUrlDto.renditions); 'auto' plays `uri`. */
  renditions?: { quality: string; url: string }[];
  /** Fired when playback starts/pauses (watch-progress sync). */
  onPlayingChange?: (playing: boolean, sec: number, duration: number) => void;
  /** Fired after a user seek (timeline or ±10 s). */
  onSeek?: (sec: number, duration: number) => void;
}

const SEEK_STEP = 10;
const AUTO_HIDE_MS = 3200;
/** Short window keeps single taps feeling instant while still catching double taps. */
const DOUBLE_TAP_DELAY_MS = 220;

type Ripple = { side: 'start' | 'end'; key: number };

/**
 * EDUWAY video player — expo-video surface with a fully custom, bilingual control layer:
 * tap to toggle, auto-hide, double-tap ±10s (RTL aware), draggable timeline with time bubble,
 * speed/quality popover, server caption tracks (VTT), landscape fullscreen and PiP-ready surface.
 */
export const VideoPlayer = memo(function VideoPlayer({
  uri,
  poster,
  initialPositionSec = 0,
  onProgress,
  onEnd,
  title,
  onBack,
  captionTracks,
  renditions,
  onPlayingChange,
  onSeek,
}: VideoPlayerProps) {
  const { t, lang } = useI18n('lesson');
  const insets = useSafeAreaInsets();
  const isRTL = getIsRTL();

  // The player is created once with the first (signed) URL; later refreshed URLs are used on retry / quality
  // switches so a background URL refresh never restarts playback.
  const [initialUri] = useState(uri);
  const latestUriRef = useRef(uri);
  latestUriRef.current = uri;
  const pendingSeekRef = useRef<number | null>(null);

  const player = useVideoPlayer(initialUri, (p) => {
    p.timeUpdateEventInterval = 1;
    p.loop = false;
    p.play();
  });

  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const { status } = useEvent(player, 'statusChange', { status: player.status });

  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [ended, setEnded] = useState(false);
  const [firstFrame, setFirstFrame] = useState(false);
  const [controls, setControls] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);
  const [captions, setCaptions] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [quality, setQuality] = useState<Quality>('auto');
  const [qualitySwitching, setQualitySwitching] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [ripple, setRipple] = useState<Ripple | null>(null);
  const [tick, setTick] = useState(0);

  const widthRef = useRef(0);
  const resumedRef = useRef(false);
  const scrubbingRef = useRef(false);
  const onProgressRef = useRef(onProgress);
  const onEndRef = useRef(onEnd);
  const onPlayingChangeRef = useRef(onPlayingChange);
  const onSeekRef = useRef(onSeek);
  onProgressRef.current = onProgress;
  onEndRef.current = onEnd;
  onPlayingChangeRef.current = onPlayingChange;
  onSeekRef.current = onSeek;

  useEventListener(player, 'playingChange', ({ isPlaying: playing }) => {
    const d = player.duration;
    onPlayingChangeRef.current?.(playing, player.currentTime, d > 0 ? d : 0);
  });

  // Real captions: fetch + parse the track for the UI language when captions are switched on.
  const [cues, setCues] = useState<Cue[]>([]);
  useEffect(() => {
    if (!captions || !captionTracks?.length) return;
    const track = captionTracks.find((c) => c.lang === lang) ?? captionTracks[0]!;
    let cancelled = false;
    fetch(track.url)
      .then((r) => r.text())
      .then((txt) => {
        if (!cancelled) setCues(parseVtt(txt));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [captions, lang, captionTracks]);

  // ── Player events ────────────────────────────────────────────────────────────
  useEventListener(player, 'timeUpdate', ({ currentTime, bufferedPosition }) => {
    const d = player.duration;
    if (d > 0) setDuration((prev) => (prev === d ? prev : d));
    if (!scrubbingRef.current) setTime(currentTime);
    setBuffered(bufferedPosition);
    onProgressRef.current?.(currentTime, d > 0 ? d : 0);
  });

  useEventListener(player, 'sourceLoad', ({ duration: d }) => {
    if (d > 0) setDuration(d);
  });

  useEventListener(player, 'playToEnd', () => {
    setEnded(true);
    setControls(true);
    const d = player.duration;
    if (d > 0) setTime(d);
    onEndRef.current?.();
  });

  // Resume from the saved position once the source is ready.
  // Restore the position after a quality switch / retry replaced the source.
  useEffect(() => {
    if (status !== 'readyToPlay' || pendingSeekRef.current === null) return;
    player.currentTime = pendingSeekRef.current;
    pendingSeekRef.current = null;
    player.play();
  }, [status, player]);

  useEffect(() => {
    if (status !== 'readyToPlay' || resumedRef.current) return;
    resumedRef.current = true;
    const d = player.duration;
    if (initialPositionSec > 5 && (d <= 0 || initialPositionSec < d - 3)) {
      player.currentTime = initialPositionSec;
      setTime(initialPositionSec);
      toast.info(t('player.resumeFrom', { time: formatDuration(initialPositionSec) }));
    }
  }, [status, initialPositionSec, player, t]);

  // ── Controls visibility ──────────────────────────────────────────────────────
  const controlsOpacity = useSharedValue(1);
  useEffect(() => {
    controlsOpacity.value = withTiming(controls ? 1 : 0, { duration: 220 });
  }, [controls, controlsOpacity]);
  const controlsStyle = useAnimatedStyle(() => ({ opacity: controlsOpacity.value }));

  useEffect(() => {
    if (!controls || !isPlaying || menuOpen || scrubbing) return;
    const id = setTimeout(() => setControls(false), AUTO_HIDE_MS);
    return () => clearTimeout(id);
  }, [controls, isPlaying, menuOpen, scrubbing, tick]);

  const poke = useCallback(() => setTick((x) => x + 1), []);

  // ── Actions ──────────────────────────────────────────────────────────────────
  const togglePlay = useCallback(() => {
    poke();
    if (ended) {
      player.replay();
      setEnded(false);
      setTime(0);
      return;
    }
    if (player.playing) player.pause();
    else player.play();
  }, [ended, player, poke]);

  const seekRelative = useCallback(
    (delta: number) => {
      poke();
      const d = player.duration;
      const next = Math.max(0, Math.min(d > 0 ? d : Number.MAX_SAFE_INTEGER, player.currentTime + delta));
      player.seekBy(delta);
      setTime(next);
      if (delta < 0 && ended) setEnded(false);
      onSeekRef.current?.(next, d > 0 ? d : 0);
    },
    [ended, player, poke],
  );

  const rewind = useCallback(() => seekRelative(-SEEK_STEP), [seekRelative]);
  const forward = useCallback(() => seekRelative(SEEK_STEP), [seekRelative]);
  const toggleMenu = useCallback(() => {
    setMenuOpen((m) => !m);
    poke();
  }, [poke]);

  const onScrubStart = useCallback(() => {
    scrubbingRef.current = true;
    setScrubbing(true);
  }, []);

  const onScrubEnd = useCallback(
    (sec: number) => {
      scrubbingRef.current = false;
      setScrubbing(false);
      player.currentTime = sec;
      setTime(sec);
      if (ended && sec < player.duration - 1) setEnded(false);
      const d = player.duration;
      onSeekRef.current?.(sec, d > 0 ? d : 0);
      poke();
    },
    [ended, player, poke],
  );

  const changeSpeed = useCallback(
    (s: number) => {
      player.playbackRate = s;
      setSpeed(s);
      setMenuOpen(false);
      poke();
    },
    [player, poke],
  );

  const changeQuality = useCallback(
    (q: Quality) => {
      setQuality(q);
      setMenuOpen(false);
      const target = q === 'auto' ? latestUriRef.current : renditions?.find((r) => r.quality === q)?.url;
      if (target) {
        // Real switch to the selected rendition, keeping the position.
        pendingSeekRef.current = player.currentTime;
        player.replace(target);
      } else {
        // No dedicated rendition (adaptive HLS) — the stream adapts by itself; brief re-buffer feedback.
        setQualitySwitching(true);
        setTimeout(() => setQualitySwitching(false), 650);
      }
      poke();
    },
    [poke, player, renditions],
  );

  const toggleCaptions = useCallback(() => {
    haptic.selection();
    setCaptions((c) => !c);
    poke();
  }, [poke]);

  const enterFullscreen = useCallback(() => {
    setMenuOpen(false);
    setFullscreen(true);
    void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
    poke();
  }, [poke]);

  const exitFullscreen = useCallback(() => {
    setMenuOpen(false);
    setFullscreen(false);
    void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    poke();
  }, [poke]);

  useEffect(
    () => () => {
      void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    },
    [],
  );

  const retry = useCallback(() => {
    const at = player.currentTime;
    if (at > 1) pendingSeekRef.current = at;
    else resumedRef.current = false;
    player.replace(latestUriRef.current);
    player.play();
  }, [player]);

  // ── Gestures: single tap toggles controls, double tap seeks ±10s per side ────
  const toggleControls = useCallback(() => {
    if (menuOpen) {
      setMenuOpen(false);
      return;
    }
    setControls((c) => !c);
  }, [menuOpen]);

  const onDoubleTap = useCallback(
    (x: number) => {
      const w = widthRef.current;
      if (w <= 0) return;
      const physicalLeft = x < w / 2;
      const side: Ripple['side'] = physicalLeft !== isRTL ? 'start' : 'end';
      haptic.light();
      seekRelative(side === 'start' ? -SEEK_STEP : SEEK_STEP);
      setRipple({ side, key: Date.now() });
    },
    [isRTL, seekRelative],
  );

  useEffect(() => {
    if (!ripple) return;
    const id = setTimeout(() => setRipple(null), 750);
    return () => clearTimeout(id);
  }, [ripple]);

  // Stable gesture objects (re-creating them every timeUpdate re-render makes taps flaky);
  // the latest handlers are read through refs.
  const toggleRef = useRef(toggleControls);
  const doubleTapRef = useRef(onDoubleTap);
  toggleRef.current = toggleControls;
  doubleTapRef.current = onDoubleTap;

  const taps = useMemo(() => {
    const doubleTap = Gesture.Tap()
      .numberOfTaps(2)
      .maxDelay(DOUBLE_TAP_DELAY_MS)
      .maxDistance(30)
      .runOnJS(true)
      .onEnd((e, success) => {
        if (success) doubleTapRef.current(e.x);
      });
    const singleTap = Gesture.Tap()
      .maxDistance(20)
      .runOnJS(true)
      .onEnd((_e, success) => {
        if (success) toggleRef.current();
      });
    return Gesture.Exclusive(doubleTap, singleTap);
  }, []);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    widthRef.current = e.nativeEvent.layout.width;
  }, []);

  // ── Render ───────────────────────────────────────────────────────────────────
  const buffering = status === 'loading' || qualitySwitching;
  const hasError = status === 'error';
  const sidePad = fullscreen ? Math.max(insets.left, insets.right, space.lg) : space.md;
  const caption = captions ? cueAt(cues, time) : null;
  const centerSize = fullscreen ? 76 : 56;
  /** Height reserved by the top / bottom bars so the transport never overlaps them. */
  const barSpace = fullscreen ? 72 : 44;
  const tenSec = t('player.seconds', { count: SEEK_STEP });

  const surface = (
    <View style={styles.surface} onLayout={onLayout}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        nativeControls={false}
        contentFit="contain"
        allowsPictureInPicture
        onFirstFrameRender={() => setFirstFrame(true)}
      />
      {!firstFrame && poster ? (
        <Animated.View exiting={FadeOut.duration(300)} style={StyleSheet.absoluteFill} pointerEvents="none">
          <Image
            source={{ uri: poster }}
            placeholder={{ blurhash: BLURHASH }}
            transition={300}
            contentFit="cover"
            cachePolicy="memory-disk"
            style={StyleSheet.absoluteFill}
          />
          <View style={[StyleSheet.absoluteFill, styles.posterDim]} />
        </Animated.View>
      ) : null}

      {/* Tap layer sits UNDER the controls overlay so control buttons always receive their own touches. */}
      <GestureDetector gesture={taps}>
        <View style={StyleSheet.absoluteFill} collapsable={false} />
      </GestureDetector>

      {ripple ? <SeekRipple key={ripple.key} side={ripple.side} label={`${ripple.side === 'start' ? '−' : '+'}${tenSec}`} /> : null}

      {caption ? (
        <View pointerEvents="none" style={[styles.captionWrap, { bottom: controls ? (fullscreen ? 96 : 74) : space.lg }]}>
          <Animated.View key={caption} entering={FadeIn.duration(200)} style={styles.captionBox}>
            <Text variant={fullscreen ? 'bodyMedium' : 'label'} color="#FFFFFF" align="center">
              {caption}
            </Text>
          </Animated.View>
        </View>
      ) : null}

      {buffering && !hasError ? (
        <View pointerEvents="none" style={styles.center} accessibilityLabel={t('player.buffering')}>
          <View style={styles.spinnerRing}>
            <ActivityIndicator size="large" color={palette.gold} />
          </View>
        </View>
      ) : null}

      {/* Controls overlay */}
      <Animated.View
        style={[StyleSheet.absoluteFill, controlsStyle]}
        pointerEvents={controls && !hasError ? 'box-none' : 'none'}
      >
        <LinearGradient pointerEvents="none" colors={['rgba(0,0,0,0.6)', 'rgba(0,0,0,0)']} style={styles.topShade} />
        <LinearGradient pointerEvents="none" colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.75)']} style={styles.bottomShade} />

        {/* Top bar */}
        <View
          pointerEvents="box-none"
          style={[styles.topBar, { paddingStart: sidePad, paddingEnd: sidePad, paddingTop: fullscreen ? Math.max(insets.top, space.md) : space.sm }]}
        >
          {fullscreen || onBack ? (
            <CtrlButton
              icon={fullscreen ? 'close' : 'back'}
              label={fullscreen ? t('player.exitFullscreen') : t('player.back')}
              onPress={fullscreen ? exitFullscreen : onBack}
            />
          ) : null}
          <View style={styles.title} pointerEvents="none">
            {title ? (
              <Text variant={fullscreen ? 'h3' : 'label'} color="#FFFFFF" numberOfLines={1}>
                {title}
              </Text>
            ) : null}
          </View>
          <CtrlButton
            icon="captions"
            label={captions ? t('player.captionsOn') : t('player.captionsOff')}
            onPress={toggleCaptions}
            active={captions}
          />
        </View>

        {/* Center transport */}
        <View pointerEvents="box-none" style={[styles.transportArea, { top: barSpace, bottom: barSpace + 12 }]}>
          <View pointerEvents="box-none" style={[styles.transport, { gap: fullscreen ? space.huge : space.xxl }]}>
            <CtrlButton icon="rewind-10" label={t('player.rewind')} onPress={rewind} size={fullscreen ? 52 : 44} />
            {buffering && !hasError ? (
              <View style={{ width: centerSize, height: centerSize }} />
            ) : (
              <PressableScale
                onPress={togglePlay}
                scaleTo={0.9}
                accessibilityRole="button"
                accessibilityLabel={ended ? t('player.replay') : isPlaying ? t('player.pause') : t('player.play')}
                style={[styles.bigPlay, { width: centerSize, height: centerSize, borderRadius: centerSize / 2 }]}
              >
                <Icon
                  name={ended ? 'refresh' : isPlaying ? 'pause' : 'play'}
                  size={Math.round(centerSize * 0.42)}
                  color="#FFFFFF"
                  filled={!ended}
                />
              </PressableScale>
            )}
            <CtrlButton icon="forward-10" label={t('player.forward')} onPress={forward} size={fullscreen ? 52 : 44} />
          </View>
        </View>

        {/* Bottom bar */}
        <View
          pointerEvents="box-none"
          style={[styles.bottomBar, { paddingStart: sidePad, paddingEnd: sidePad, paddingBottom: fullscreen ? Math.max(insets.bottom, space.md) : space.xs }]}
        >
          <View style={styles.bottomRow} pointerEvents="box-none">
            <View style={styles.timeWrap} pointerEvents="none">
              <Text variant="caption" color="#FFFFFF" tabular style={styles.time}>
                {formatDuration(time)}
                <Text variant="caption" color="rgba(255,255,255,0.65)" tabular style={styles.time}>
                  {`  /  ${formatDuration(duration)}`}
                </Text>
              </Text>
            </View>
            <PressableScale
              onPress={toggleMenu}
              accessibilityRole="button"
              accessibilityLabel={`${t('player.speed')} ${formatSpeed(speed)}`}
              hitSlop={HIT_SLOP}
              style={styles.speedPill}
            >
              <Text variant="label" color={speed === 1 ? '#FFFFFF' : palette.goldLight} tabular style={styles.time}>
                {formatSpeed(speed)}
              </Text>
            </PressableScale>
            <CtrlButton
              icon="gear-quality"
              label={t('player.settings')}
              onPress={toggleMenu}
              active={menuOpen}
              badge={quality !== 'auto' ? quality.replace('p', '') : undefined}
            />
            <CtrlButton
              icon="fullscreen"
              label={fullscreen ? t('player.exitFullscreen') : t('player.fullscreen')}
              onPress={fullscreen ? exitFullscreen : enterFullscreen}
              active={fullscreen}
            />
          </View>
          <SeekBar
            position={time}
            duration={duration}
            buffered={buffered}
            onScrubStart={onScrubStart}
            onScrubEnd={onScrubEnd}
            accessibilityLabel={t('player.seek')}
          />
        </View>
      </Animated.View>

      {menuOpen ? (
        <SettingsMenu
          speed={speed}
          quality={quality}
          onSpeed={changeSpeed}
          onQuality={changeQuality}
          onClose={() => setMenuOpen(false)}
          compact={!fullscreen}
        />
      ) : null}

      {hasError ? (
        <View style={[StyleSheet.absoluteFill, styles.errorBox]}>
          <Icon name="wifi-off" size={28} color={palette.goldLight} />
          <Text variant="label" color="#FFFFFF" align="center" style={styles.errorText}>
            {t('player.error')}
          </Text>
          <Pressable onPress={retry} accessibilityRole="button" style={styles.retry} hitSlop={HIT_SLOP}>
            <Icon name="refresh" size={16} color={palette.navy} />
            <Text variant="label" color={palette.navy}>
              {t('player.retry')}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );

  if (fullscreen) {
    return (
      <View style={styles.inline}>
        <Modal
          visible
          animationType="fade"
          presentationStyle="fullScreen"
          supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}
          onRequestClose={exitFullscreen}
          statusBarTranslucent
          navigationBarTranslucent
        >
          <StatusBar hidden />
          <GestureHandlerRootView style={[styles.fullscreenRoot, directionStyle(isRTL)]}>{surface}</GestureHandlerRootView>
        </Modal>
      </View>
    );
  }

  return <View style={styles.inline}>{surface}</View>;
});

function CtrlButton({
  icon,
  label,
  onPress,
  size = 40,
  active,
  badge,
}: {
  icon: IconName;
  label: string;
  onPress?: () => void;
  size?: number;
  active?: boolean;
  badge?: string;
}) {
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.88}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={active !== undefined ? { selected: active } : undefined}
      hitSlop={HIT_SLOP}
      style={[styles.ctrl, { width: size, height: size, borderRadius: size / 2 }, active && styles.ctrlActive]}
    >
      <Icon name={icon} size={Math.round(size * 0.5)} color={active ? palette.goldLight : '#FFFFFF'} />
      {badge ? (
        <View style={styles.ctrlBadge}>
          <Text variant="caption" color={palette.navy} style={styles.ctrlBadgeText} tabular>
            {badge}
          </Text>
        </View>
      ) : null}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  inline: { width: '100%', aspectRatio: 16 / 9, backgroundColor: palette.black },
  fullscreenRoot: { flex: 1, backgroundColor: palette.black },
  surface: { flex: 1, backgroundColor: palette.black, overflow: 'hidden' },
  posterDim: { backgroundColor: 'rgba(0,0,0,0.25)' },
  topShade: { position: 'absolute', top: 0, start: 0, end: 0, height: 72 },
  bottomShade: { position: 'absolute', bottom: 0, start: 0, end: 0, height: 96 },
  topBar: { position: 'absolute', top: 0, start: 0, end: 0, flexDirection: 'row', alignItems: 'center', gap: space.sm },
  title: { flex: 1 },
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  transportArea: { position: 'absolute', start: 0, end: 0, alignItems: 'center', justifyContent: 'center' },
  transport: { flexDirection: 'row', alignItems: 'center' },
  timeWrap: { flex: 1, justifyContent: 'center' },
  bigPlay: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  spinnerRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(7,20,38,0.45)',
  },
  bottomBar: { position: 'absolute', start: 0, end: 0, bottom: 0 },
  bottomRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  time: { writingDirection: 'ltr' },
  flex: { flex: 1 },
  speedPill: {
    minWidth: 44,
    height: 28,
    paddingHorizontal: space.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    marginEnd: space.xxs,
  },
  ctrl: { alignItems: 'center', justifyContent: 'center' },
  ctrlActive: { backgroundColor: 'rgba(201,162,74,0.22)' },
  ctrlBadge: {
    position: 'absolute',
    top: 2,
    end: 0,
    paddingHorizontal: 3,
    borderRadius: 4,
    backgroundColor: palette.gold,
  },
  ctrlBadgeText: { fontSize: 8, lineHeight: 10 },
  captionWrap: { position: 'absolute', start: space.xl, end: space.xl, alignItems: 'center' },
  captionBox: {
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.xs,
    backgroundColor: 'rgba(0,0,0,0.68)',
    maxWidth: 560,
  },
  errorBox: { backgroundColor: 'rgba(7,20,38,0.92)', alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.sm },
  errorText: { maxWidth: 300 },
  retry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    height: 36,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    backgroundColor: palette.gold,
  },
});
