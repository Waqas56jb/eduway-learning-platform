import { StyleSheet } from 'react-native';
import { PressableScale, Text } from '@/components/ui';

interface AuthSwitchLinkProps {
  prompt: string;
  action: string;
  onPress: () => void;
}

/** "New to EDUWAY? Create account" — one full-width 44pt tap target, centered text. */
export function AuthSwitchLink({ prompt, action, onPress }: AuthSwitchLinkProps) {
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.98}
      accessibilityRole="link"
      accessibilityLabel={`${prompt} ${action}`}
      style={styles.row}
    >
      <Text variant="body" color="muted" align="center">
        {prompt}{' '}
        <Text variant="bodyBold" color="accent">
          {action}
        </Text>
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
