/**
 * Themed Pressable with a subtle press-scale animation.
 *
 * Design brief calls for "press-scale on buttons/cards" as the primary
 * tactile feedback. RN's built-in `pressed` style only toggles opacity,
 * which feels flat — we want a spring shrink to ~0.97 then back. Driving
 * this with reanimated's worklet runtime keeps the animation on the UI
 * thread so it never stutters during list scrolls.
 *
 * Usage:
 *   <Pressable onPress={...} pressScale={0.97}>
 *     <CardContent />
 *   </Pressable>
 *
 * Set `pressScale={1}` to disable the effect (e.g. inside a row that
 * already has its own ripple).
 */
import { ReactNode } from 'react';
import {
  Pressable as RNPressable,
  type PressableProps as RNPressableProps,
  type ViewStyle,
  type StyleProp,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

type Props = Omit<RNPressableProps, 'style' | 'children'> & {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Scale at the bottom of the press. Default 0.97. Set 1 to disable. */
  pressScale?: number;
  /** Reduce hit slop on small targets — pressable still passes accessibility checks. */
  hitSlop?: RNPressableProps['hitSlop'];
};

export function Pressable({
  children,
  style,
  pressScale = 0.97,
  onPressIn,
  onPressOut,
  ...rest
}: Props) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <RNPressable
      onPressIn={(e) => {
        if (pressScale !== 1) {
          scale.value = withSpring(pressScale, { damping: 18, stiffness: 320 });
        }
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        if (pressScale !== 1) {
          scale.value = withSpring(1, { damping: 16, stiffness: 240 });
        }
        onPressOut?.(e);
      }}
      {...rest}
    >
      <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>
    </RNPressable>
  );
}
