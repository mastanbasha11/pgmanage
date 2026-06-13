/**
 * Labeled text input with help + error states.
 *
 *   <Field label="Phone" value={phone} onChangeText={setPhone}
 *          keyboardType="phone-pad" help="We'll send a 6-digit code." />
 *
 *   <Field label="Email" value={email} error="Enter a valid email" />
 */
import { ReactNode } from 'react';
import { StyleProp, Text, TextInput, type TextInputProps, View, ViewStyle } from 'react-native';

import { useTheme } from '../../lib/theme';

interface FieldProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  help?: string;
  error?: string;
  required?: boolean;
  /** Slot to render before the input — e.g. a `+91` prefix or icon. */
  leading?: ReactNode;
  /** Slot to render after the input. */
  trailing?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function Field({
  label,
  help,
  error,
  required,
  leading,
  trailing,
  style,
  ...rest
}: FieldProps) {
  const { colors, fontSize, fontWeight, radius, space, TOUCH_TARGET } = useTheme();
  const borderColor = error ? colors.dangerFg : colors.border;
  return (
    <View style={[{ marginBottom: space.md }, style]}>
      {label ? (
        <Text
          style={{
            color: colors.textMuted,
            fontSize: fontSize.small,
            fontWeight: fontWeight.medium,
            marginBottom: space.xs,
          }}
        >
          {label}
          {required ? <Text style={{ color: colors.dangerFg }}> *</Text> : null}
        </Text>
      ) : null}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor,
          borderRadius: radius.md,
          minHeight: TOUCH_TARGET,
          paddingHorizontal: space.md,
        }}
      >
        {leading ? <View style={{ marginRight: space.sm }}>{leading}</View> : null}
        <TextInput
          placeholderTextColor={colors.textDim}
          style={{
            flex: 1,
            color: colors.text,
            fontSize: fontSize.body,
            paddingVertical: space.sm,
          }}
          {...rest}
        />
        {trailing ? <View style={{ marginLeft: space.sm }}>{trailing}</View> : null}
      </View>
      {error ? (
        <Text style={{ color: colors.dangerFg, fontSize: fontSize.small, marginTop: space.xs }}>
          {error}
        </Text>
      ) : help ? (
        <Text style={{ color: colors.textDim, fontSize: fontSize.small, marginTop: space.xs }}>
          {help}
        </Text>
      ) : null}
    </View>
  );
}
