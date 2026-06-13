/**
 * SectionHeader — small heading + optional trailing action.
 *
 *   <SectionHeader title="Recent payments" actionLabel="See all" onAction={...} />
 */
import { Text, View } from 'react-native';

import { useTheme } from '../../lib/theme';

import { Pressable } from './Pressable';

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function SectionHeader({ title, subtitle, actionLabel, onAction }: SectionHeaderProps) {
  const { colors, fontSize, fontWeight, lineHeight, space } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        marginBottom: space.md,
        marginTop: space.lg,
      }}
    >
      <View style={{ flex: 1, paddingRight: space.md }}>
        <Text
          style={{
            color: colors.text,
            fontSize: fontSize.h3,
            lineHeight: lineHeight.h3,
            fontWeight: fontWeight.bold,
          }}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            style={{
              color: colors.textMuted,
              fontSize: fontSize.small,
              marginTop: 2,
            }}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {actionLabel ? (
        <Pressable onPress={onAction} pressScale={0.96} hitSlop={8}>
          <Text
            style={{
              color: colors.accent,
              fontSize: fontSize.small,
              fontWeight: fontWeight.semibold,
            }}
          >
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
