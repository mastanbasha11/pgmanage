/**
 * Resident Food — the week's menu as set by the kitchen. The owner uploads a
 * menu image or PDF (admin menu-upload feature); we render the image inline or
 * offer to open the PDF. Menu is view-only for now.
 */
import { Image, Linking, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, space } from '../../../lib/theme';
import { useTenantCurrentMenu } from '../../../lib/tenant/hooks';
import { TScreen, TAppBar, TCard, TButton, Cap } from '../../../components/tenant-ui';

const ORIGIN = 'https://pgmanage.in';

/** Menu url may be relative to the API origin — resolve for native. */
function resolve(url?: string): string {
  if (!url) return '';
  return url.startsWith('http') ? url : `${ORIGIN}${url}`;
}

export default function TenantFood() {
  const menu = useTenantCurrentMenu();
  const { width } = useWindowDimensions();
  const m = menu.data;
  const isImage = (m?.content_type ?? '').startsWith('image');
  const url = resolve(m?.url);

  return (
    <TScreen>
      <TAppBar title="Food" sub="weekly menu · set by the kitchen" />

      {menu.isLoading ? (
        <TCard style={{ marginTop: space.xs }}>
          <Text style={styles.note}>Loading this week's menu…</Text>
        </TCard>
      ) : !m ? (
        <TCard variant="tint" style={{ marginTop: space.xs, alignItems: 'center', paddingVertical: 26 }}>
          <Ionicons name="restaurant-outline" size={28} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>No menu posted yet</Text>
          <Text style={styles.note}>The kitchen will upload this week's menu soon.</Text>
        </TCard>
      ) : (
        <>
          {!!m.title && <Cap>{m.title.toUpperCase()}</Cap>}
          {isImage ? (
            <TCard style={{ marginTop: space.xs, padding: 8 }}>
              <Image
                source={{ uri: url }}
                style={{ width: '100%', height: (width - 2 * space.lg - 16) * 1.3, borderRadius: 10 }}
                resizeMode="contain"
              />
            </TCard>
          ) : (
            <TCard style={{ marginTop: space.xs, alignItems: 'center', paddingVertical: 24 }}>
              <Ionicons name="document-text-outline" size={30} color={colors.forest} />
              <Text style={styles.pdfTitle}>This week's menu (PDF)</Text>
              <TButton
                label="Open menu"
                variant="dark"
                icon="open-outline"
                style={{ marginTop: space.md, alignSelf: 'stretch' }}
                onPress={() => url && Linking.openURL(url)}
              />
            </TCard>
          )}
        </>
      )}

      <Text style={styles.footer}>
        Menu is view-only for now.{'\n'}Meal choice & skip are on the roadmap.
      </Text>
    </TScreen>
  );
}

const styles = StyleSheet.create({
  note: { fontSize: 12, color: colors.textMuted, marginTop: 6, textAlign: 'center', lineHeight: 18 },
  emptyTitle: { fontSize: 13.5, fontWeight: '800', color: colors.text, marginTop: 10 },
  pdfTitle: { fontSize: 13, fontWeight: '800', color: colors.text, marginTop: 10 },
  footer: { fontSize: 11, color: colors.textDim, textAlign: 'center', marginTop: space.lg, lineHeight: 17 },
});
