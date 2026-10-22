import { LinearGradient } from 'expo-linear-gradient';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

const N = '7,20,38'; // navy900

/**
 * Legibility scrims over a full-bleed photo: a deep navy wash rising from the bottom
 * (≈95% → transparent around mid-height) plus a soft top band behind the status bar.
 * Purely decorative — never intercepts touches.
 */
export const CinematicScrim = memo(function CinematicScrim({
  topHeight,
  /** Where (0–1 from the top) the bottom wash becomes fully transparent. */
  fadeStart = 0.42,
  tint = 0.12,
}: {
  topHeight: number;
  fadeStart?: number;
  /** Uniform navy tint over the whole photo for a consistent brand mood. */
  tint?: number;
}) {
  const s = Math.min(0.7, Math.max(0.2, fadeStart));
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(${N},${tint})` }]} />
      <LinearGradient
        colors={[`rgba(${N},0)`, `rgba(${N},0.45)`, `rgba(${N},0.82)`, `rgba(${N},0.95)`]}
        locations={[s, s + (1 - s) * 0.35, s + (1 - s) * 0.68, 1]}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={[`rgba(${N},0.62)`, `rgba(${N},0.25)`, `rgba(${N},0)`]}
        locations={[0, 0.55, 1]}
        style={[styles.top, { height: topHeight }]}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  top: { position: 'absolute', top: 0, start: 0, end: 0 },
});
