/**
 * Avatar — image with initials fallback.
 *
 * Deterministic colouring: the same name always lands on the same tinted
 * background so a person feels visually identified across screens (Home
 * greeting, ticket list, visitor log).
 */
import { Image, Text, View, type ImageSourcePropType } from 'react-native';

import { useTheme } from '../../lib/theme';

interface AvatarProps {
  name: string;
  source?: ImageSourcePropType | string | null;
  size?: number;
}

const INITIALS_BG_PALETTE = [
  ['#FCE7F3', '#BE185D'], // pink
  ['#DBEAFE', '#1D4ED8'], // blue
  ['#DCFCE7', '#15803D'], // green
  ['#FEF3C7', '#B45309'], // amber
  ['#F3E8FF', '#6D28D9'], // violet
  ['#CCFBF1', '#0F766E'], // teal
];

function hash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '·';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export function Avatar({ name, source, size = 40 }: AvatarProps) {
  const { fontWeight } = useTheme();
  const [bg, fg] = INITIALS_BG_PALETTE[hash(name) % INITIALS_BG_PALETTE.length]!;

  const wrap = {
    width: size,
    height: size,
    borderRadius: size / 2,
    backgroundColor: bg,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    overflow: 'hidden' as const,
  };

  if (source) {
    const imageSource: ImageSourcePropType =
      typeof source === 'string' ? { uri: source } : source;
    return (
      <View style={wrap}>
        <Image source={imageSource} style={{ width: size, height: size }} />
      </View>
    );
  }

  return (
    <View style={wrap}>
      <Text style={{ color: fg, fontWeight: fontWeight.bold, fontSize: size * 0.4 }}>
        {initialsFor(name)}
      </Text>
    </View>
  );
}
