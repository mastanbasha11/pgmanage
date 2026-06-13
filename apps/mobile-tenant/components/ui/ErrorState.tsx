/**
 * ErrorState — what to render when a data hook returns an error.
 *
 * Always retryable. Surface the error message under the heading so the
 * user (and a support engineer over a screen-share) can see what went wrong.
 */
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../../lib/theme';

import { Button } from './Button';

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
}

export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
  retryLabel = 'Try again',
}: ErrorStateProps) {
  const { colors, fontSize, fontWeight, lineHeight, space } = useTheme();
  return (
    <View
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: space['4xl'],
        paddingHorizontal: space.lg,
      }}
    >
      <View
        style={{
          width: 72,
          height: 72,
          borderRadius: 36,
          backgroundColor: colors.dangerBg,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: space.lg,
        }}
      >
        <Ionicons name="alert-circle-outline" size={32} color={colors.dangerFg} />
      </View>
      <Text
        style={{
          color: colors.text,
          fontSize: fontSize.h3,
          lineHeight: lineHeight.h3,
          fontWeight: fontWeight.bold,
          textAlign: 'center',
        }}
      >
        {title}
      </Text>
      {message ? (
        <Text
          style={{
            color: colors.textMuted,
            fontSize: fontSize.body,
            lineHeight: lineHeight.body,
            textAlign: 'center',
            marginTop: space.sm,
            maxWidth: 320,
          }}
        >
          {message}
        </Text>
      ) : null}
      {onRetry ? (
        <View style={{ marginTop: space.xl }}>
          <Button label={retryLabel} onPress={onRetry} variant="secondary" iconName="refresh" />
        </View>
      ) : null}
    </View>
  );
}
