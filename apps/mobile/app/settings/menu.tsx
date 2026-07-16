/**
 * Menu — weekly meal cards. Owner uploads PDF or per-meal images; residents
 * see them in the tenant portal. This screen: list uploads · pick + upload
 * · delete.
 */
import { useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';

import {
  Screen,
  Header,
  Card,
  Loading,
  Empty,
  Button,
  Row,
  StatusPill,
  Fab,
  DateField,
  Sheet,
  ConfirmDialog,
  IconButton,
  formatDateHuman,
} from '../../components/ui';
import { useAppStore } from '../../lib/store';
import { useMenus, useUploadMenu, useDeleteMenu, type MenuItem } from '../../lib/hooks/misc';
import { getApiError } from '../../lib/api';
import { colors, space, type as fontSize } from '../../lib/theme';

export default function MenuPage() {
  const router = useRouter();
  const { selectedPropertyId } = useAppStore();
  const menus = useMenus(selectedPropertyId ?? undefined);
  const del = useDeleteMenu();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [deleting, setDeleting] = useState<MenuItem | null>(null);

  const items = menus.data?.items ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ padding: space.lg, paddingBottom: 0 }}>
        <Header title="Weekly menu" subtitle={`${items.length} uploaded`} onBack={() => router.back()} />
      </View>
      {menus.isLoading ? (
        <Loading />
      ) : items.length === 0 ? (
        <Empty title="No menus yet" hint="Tap + to upload this week's menu" iconName="restaurant-outline" />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl }}
          refreshControl={<RefreshControl refreshing={menus.isRefetching} onRefresh={menus.refetch} tintColor={colors.accent} />}
        >
          {items.map((m) => (
            <Card key={m.id} style={{ marginBottom: space.sm }}>
              <Row justify="space-between">
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>Week of {formatDateHuman(m.week_start)}</Text>
                  <Text style={styles.meta}>Uploaded {formatDateHuman(m.uploaded_at)}</Text>
                  {m.notes && <Text style={styles.meta}>{m.notes}</Text>}
                </View>
                <StatusPill label={(m.mime ?? '').includes('pdf') ? 'PDF' : 'Image'} tone="info" />
                <IconButton
                  name="trash-outline"
                  color={colors.danger}
                  accessibilityLabel="Delete"
                  onPress={() => setDeleting(m)}
                />
              </Row>
            </Card>
          ))}
        </ScrollView>
      )}
      {selectedPropertyId && (
        <Fab
          name="cloud-upload-outline"
          accessibilityLabel="Upload menu"
          onPress={() => setUploadOpen(true)}
        />
      )}
      {uploadOpen && selectedPropertyId && (
        <UploadSheet propertyId={selectedPropertyId} onClose={() => setUploadOpen(false)} />
      )}
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (deleting) {
            try {
              await del.mutateAsync(deleting.id);
              setDeleting(null);
            } catch (e) {
              Alert.alert('Delete failed', getApiError(e));
            }
          }
        }}
        title="Delete this menu?"
        confirmVariant="danger"
        confirmLabel="Delete"
        loading={del.isPending}
      />
    </View>
  );
}

function UploadSheet({ propertyId, onClose }: { propertyId: string; onClose: () => void }) {
  const upload = useUploadMenu();
  const [weekStart, setWeekStart] = useState<string | null>(mondayOfCurrentWeek());
  const [picked, setPicked] = useState<{ uri: string; name: string; mime: string } | null>(null);

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission denied');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      quality: 0.85,
    });
    if (res.canceled) return;
    const a = res.assets[0];
    setPicked({
      uri: a.uri,
      name: a.fileName ?? `menu-${weekStart}.jpg`,
      mime: a.mimeType ?? 'image/jpeg',
    });
  };

  const submit = async () => {
    if (!picked || !weekStart) return;
    try {
      await upload.mutateAsync({ propertyId, weekStart, uri: picked.uri, filename: picked.name, mime: picked.mime });
      onClose();
    } catch (e) {
      Alert.alert('Upload failed', getApiError(e));
    }
  };

  return (
    <Sheet open onClose={onClose} title="Upload menu">
      <DateField label="Week starting (Monday)" value={weekStart} onChange={setWeekStart} required />
      <Card
        onPress={pickImage}
        style={{
          marginBottom: space.md,
          alignItems: 'center',
          paddingVertical: space.xl,
          borderStyle: 'dashed' as const,
          borderColor: picked ? colors.accent : colors.borderStrong,
        }}
      >
        <Ionicons name={picked ? 'checkmark-circle' : 'cloud-upload-outline'} size={40} color={picked ? colors.accent : colors.textMuted} />
        <Text style={{ marginTop: space.sm, color: colors.text, fontWeight: '600' }}>
          {picked ? picked.name : 'Tap to choose PDF or image'}
        </Text>
      </Card>
      <Button
        label="Upload"
        onPress={submit}
        loading={upload.isPending}
        disabled={!picked || !weekStart}
        block
      />
    </Sheet>
  );
}

function mondayOfCurrentWeek(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

const styles = StyleSheet.create({
  title: { fontSize: fontSize.body, fontWeight: '700', color: colors.text },
  meta: { fontSize: fontSize.caption, color: colors.textMuted, marginTop: 2 },
});
