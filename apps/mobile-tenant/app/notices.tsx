/**
 * Notices feed — owner-published announcements.
 */
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';

import { Card, Empty, Pill, Screen, SkeletonLines } from '../components/ui';
import { useNotices } from '../lib/data/hooks';
import { useTheme } from '../lib/theme';

export default function NoticesScreen() {
  const { colors, fontSize, fontWeight, lineHeight, space } = useTheme();
  const noticesQ = useNotices();

  return (
    <Screen scroll>
      <Stack.Screen
        options={{
          title: 'Notices',
          headerStyle: { backgroundColor: colors.bg },
          headerTitleStyle: { color: colors.text },
          headerTintColor: colors.text,
        }}
      />
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        {noticesQ.isLoading ? (
          <SkeletonLines count={4} />
        ) : !noticesQ.data?.length ? (
          <Empty iconName="megaphone" title="No notices" />
        ) : (
          <View style={{ gap: space.md, marginTop: space.md }}>
            {noticesQ.data.map((n) => (
              <Card key={n.id}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                    gap: space.md,
                  }}
                >
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      backgroundColor: colors.warningBg,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Ionicons name="megaphone" size={18} color={colors.warningFg} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                      <Text
                        style={{
                          color: colors.text,
                          fontSize: fontSize.body,
                          fontWeight: fontWeight.bold,
                          flex: 1,
                        }}
                      >
                        {n.title}
                      </Text>
                      {n.pinned ? <Pill label="Pinned" tone="warning" size="sm" /> : null}
                    </View>
                    <Text
                      style={{
                        color: colors.textMuted,
                        fontSize: fontSize.small,
                        lineHeight: lineHeight.small,
                        marginTop: space.sm,
                      }}
                    >
                      {n.body}
                    </Text>
                    <Text
                      style={{ color: colors.textDim, fontSize: fontSize.caption, marginTop: space.sm }}
                    >
                      {format(parseISO(n.publishedAt), 'd MMM yyyy')}
                    </Text>
                  </View>
                </View>
              </Card>
            ))}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}
