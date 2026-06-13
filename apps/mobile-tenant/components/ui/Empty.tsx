/**
 * Empty state — friendly, iconographic, with a clear next action.
 *
 * Design brief: "no blank screens, ever." Every data screen's empty state
 * funnels into a single call-to-action so the user is never stuck on a
 * zero result.
 */
import { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../../lib/theme';

import { Button } from './Button';

interface EmptyProps {
  iconName?: keyof typeof Ionicons.glyphMap;
  /** Custom illustration if `iconName` isn't enough. */
  illustration?: ReactNode;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function Empty({
  iconName = 'cube-outline',
  illustration,
  title,
  message,
  actionLabel,
  onAction,
}: EmptyProps) {
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
      {illustration ? (
        illustration
      ) : (
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: 36,
            backgroundColor: colors.surfaceMuted,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: space.lg,
          }}
        >
          <Ionicons name={iconName} size={32} color={colors.textDim} />
        </View>
      )}
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
      {actionLabel ? (
        <View style={{ marginTop: space.xl }}>
          <Button label={actionLabel} onPress={onAction} />
        </View>
      ) : null}
    </View>
  );
}
