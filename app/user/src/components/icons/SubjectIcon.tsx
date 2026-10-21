import { memo } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Svg, { G } from 'react-native-svg';
import { subjectColors } from '@/theme';
import type { SubjectId } from '@/types';
import { subjectGlyphs } from './paths';

export interface SubjectIconProps {
  subjectId: SubjectId;
  size?: number;
  /** defaults to the subject's brand color */
  color?: string;
  strokeWidth?: number;
  style?: StyleProp<ViewStyle>;
}

function SubjectIconBase({ subjectId, size = 24, color, strokeWidth = 1.75, style }: SubjectIconProps) {
  const c = color ?? subjectColors[subjectId];
  const render = subjectGlyphs[subjectId];
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      style={style}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <G stroke={c} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" fill="none">
        {render(c)}
      </G>
    </Svg>
  );
}

export const SubjectIcon = memo(SubjectIconBase);
SubjectIcon.displayName = 'SubjectIcon';
