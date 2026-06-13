/**
 * Lightweight bottom sheet.
 *
 * v1 = animated slide-up + tap-backdrop-to-dismiss. No drag gesture yet —
 * gesture-handler integration adds complexity and we don't need it for
 * Phase 1 (confirmation sheets, opt-in pickers).
 *
 * Pattern is "controlled":
 *
 *   const [open, setOpen] = useState(false);
 *   <BottomSheet open={open} onClose={() => setOpen(false)} title="…">
 *     <RentBreakdown />
 *   </BottomSheet>
 */
import { ReactNode, useEffect } from 'react';
import { Modal, Pressable as RNPressable, Text, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '../../lib/theme';

import { IconButton } from './IconButton';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /** Max height as a fraction of the screen. Default 0.85. */
  maxHeight?: number;
}

export function BottomSheet({ open, onClose, title, children, maxHeight = 0.85 }: BottomSheetProps) {
  const { colors, fontSize, fontWeight, radius, shadows, space } = useTheme();

  // 0 = closed (sheet off-screen); 1 = fully open.
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(open ? 1 : 0, {
      duration: 220,
      easing: Easing.out(Easing.cubic),
    });
  }, [open, progress]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.value) * 600 }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
  }));

  // Hide the Modal once the close animation finishes; otherwise it
  // intercepts touches on the screen behind it.
  const handleRequestClose = () => onClose();

  return (
    <Modal
      visible={open}
      transparent
      animationType="none"
      onRequestClose={handleRequestClose}
      statusBarTranslucent
    >
      <Animated.View
        pointerEvents={open ? 'auto' : 'none'}
        style={[{ flex: 1, backgroundColor: colors.overlay }, backdropStyle]}
      >
        <RNPressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          style={{ flex: 1 }}
          onPress={onClose}
        />
        <Animated.View
          style={[
            {
              backgroundColor: colors.surface,
              borderTopLeftRadius: radius.xl,
              borderTopRightRadius: radius.xl,
              maxHeight: `${Math.round(maxHeight * 100)}%`,
              paddingHorizontal: space.xl,
              paddingTop: space.md,
              paddingBottom: space.xl,
            },
            shadows.bottomSheet,
            sheetStyle,
          ]}
        >
          {/* Drag handle visual only (no gesture yet) */}
          <View
            style={{
              alignSelf: 'center',
              width: 36,
              height: 4,
              borderRadius: 2,
              backgroundColor: colors.border,
              marginBottom: space.md,
            }}
          />
          {title ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: space.md,
              }}
            >
              <Text
                style={{
                  color: colors.text,
                  fontSize: fontSize.h3,
                  fontWeight: fontWeight.bold,
                }}
              >
                {title}
              </Text>
              <IconButton name="close" onPress={onClose} accessibilityLabel="Close" />
            </View>
          ) : null}
          {children}
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}
