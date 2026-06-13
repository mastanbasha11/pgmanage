/**
 * Skeleton — shimmer placeholder used while data is loading.
 *
 * Design brief: "skeletons (not spinners) ... on every data screen."
 * A subtle horizontal shimmer beats a static grey box because it reads as
 * "the app is actively working" to a non-technical user.
 *
 * Built on reanimated so the animation runs on the UI thread and survives
 * list scrolls without dropping frames.
 */
import { useEffect } from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  interpolate,
} from 'react-native-reanimated';

import { useTheme } from '../../lib/theme';

interface SkeletonProps {
  width?: number | string;
  height?: number;
  /** Pill / pebble / rectangle. Default 'sm'. */
  radius?: 'pill' | 'lg' | 'md' | 'sm';
  style?: StyleProp<ViewStyle>;
}

export function Skeleton({ width = '100%', height = 14, radius = 'sm', style }: SkeletonProps) {
  const { colors, radius: themeRadius } = useTheme();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
      -1,
      false,
    );
  }, [progress]);

  const animated = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.5, 1], [0.55, 1, 0.55]),
  }));

  return (
    <Animated.View
      style={[
        {
          width: width as number,
          height,
          backgroundColor: colors.surfaceMuted,
          borderRadius: themeRadius[radius],
        },
        animated,
        style,
      ]}
    />
  );
}

/** Composite helper: three stacked skeleton lines for a card placeholder. */
export function SkeletonLines({ count = 3 }: { count?: number }) {
  const { space } = useTheme();
  return (
    <View style={{ gap: space.sm }}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton
          key={i}
          height={14}
          width={i === count - 1 ? '60%' : '100%'}
        />
      ))}
    </View>
  );
}
