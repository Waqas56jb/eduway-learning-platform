import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

export interface KeyboardAvoidingProps {
  children: ReactNode;
  /** Extra vertical offset (e.g. height of a fixed header above the content). */
  offset?: number;
  style?: StyleProp<ViewStyle>;
}

/** Cross-platform keyboard avoidance: padding on iOS, native resize on Android. */
export function KeyboardAvoiding({ children, offset = 0, style }: KeyboardAvoidingProps) {
  return (
    <KeyboardAvoidingView
      style={[styles.flex, style]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={offset}
    >
      {children}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({ flex: { flex: 1 } });
