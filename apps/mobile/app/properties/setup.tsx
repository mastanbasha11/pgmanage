/**
 * Property setup wizard — 4 steps:
 *   1. Floors        add / rename / delete
 *   2. Room types    capacity + base rent
 *   3. Rooms         floor · number · type · capacity · AC toggle
 *   4. Review        counts + close
 *
 * Each step writes immediately to the backend (no draft state) so the wizard
 * can be exited at any time without losing changes.
 * Mirrors PropertySetupDialog on web.
 */
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import {
  Screen,
  Header,
  Card,
  Loading,
  Empty,
  Button,
  Row,
  StatusPill,
  Field,
  MoneyField,
  Select,
  Segmented,
  Sheet,
  ConfirmDialog,
  IconButton,
  Divider,
  Chip,
  rupees,
} from '../../components/ui';
import {
  useAddFloor,
  useAddRoom,
  useCreateRoomType,
  useDeleteFloor,
  useDeleteRoom,
  useDeleteRoomType,
  useFloors,
  useProperty,
  useRoomTypes,
  useRooms,
  useUpdateFloor,
  useUpdateRoom,
  useUpdateRoomType,
} from '../../lib/hooks/properties';
import { getApiError } from '../../lib/api';
import { colors, radius, space, type as fontSize } from '../../lib/theme';

type StepKey = '1' | '2' | '3' | '4';

export default function PropertySetupPage() {
  const router = useRouter();
  const { propertyId } = useLocalSearchParams<{ propertyId: string }>();
  const property = useProperty(propertyId);
  const [step, setStep] = useState<StepKey>('1');

  if (!propertyId) {
    return (
      <Screen>
        <Header title="Setup" onBack={() => router.back()} />
        <Empty title="No property selected" />
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <View style={{ padding: space.lg }}>
        <Header
          title="Setup"
          subtitle={property.data?.name}
          onBack={() => router.back()}
        />
        <Segmented<StepKey>
          value={step}
          onChange={setStep}
          options={[
            { value: '1', label: '1 · Floors' },
            { value: '2', label: '2 · Types' },
            { value: '3', label: '3 · Rooms' },
            { value: '4', label: 'Review' },
          ]}
        />
      </View>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl }}
      >
        {step === '1' && <FloorsStep propertyId={propertyId} />}
        {step === '2' && <RoomTypesStep propertyId={propertyId} />}
        {step === '3' && <RoomsStep propertyId={propertyId} />}
        {step === '4' && <ReviewStep propertyId={propertyId} />}
      </ScrollView>
    </Screen>
  );
}

// ── Step 1 · Floors ─────────────────────────────────────────────────────────

function FloorsStep({ propertyId }: { propertyId: string }) {
  const floors = useFloors(propertyId);
  const addFloor = useAddFloor(propertyId);
  const updateFloor = useUpdateFloor(propertyId);
  const deleteFloor = useDeleteFloor(propertyId);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<{ id: string; floor_number: number; name: string } | null>(null);
  const [num, setNum] = useState('');
  const [name, setName] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const openNew = () => {
    setEditing(null);
    const nextNum = (floors.data?.items?.length ?? 0) + 1;
    setNum(String(nextNum));
    setName(`${nextNum}${suffix(nextNum)} Floor`);
    setOpen(true);
  };
  const openEdit = (f: { id: string; floor_number: number; name: string }) => {
    setEditing(f);
    setNum(String(f.floor_number));
    setName(f.name);
    setOpen(true);
  };

  const save = async () => {
    try {
      if (editing) {
        await updateFloor.mutateAsync({ id: editing.id, floor_number: Number(num), name });
      } else {
        await addFloor.mutateAsync({ floor_number: Number(num), name });
      }
      setOpen(false);
    } catch (e) {
      Alert.alert('Save failed', getApiError(e));
    }
  };

  return (
    <>
      <Text style={styles.stepHead}>Floors</Text>
      <Text style={styles.stepHint}>Add every floor in the building.</Text>
      {floors.isLoading ? (
        <Loading />
      ) : floors.data?.items?.length === 0 ? (
        <Empty title="No floors yet" hint="Add one to continue" iconName="layers-outline" />
      ) : (
        (floors.data?.items ?? [])
          .sort((a, b) => a.floor_number - b.floor_number)
          .map((f) => (
            <Card key={f.id} style={{ marginBottom: space.sm }}>
              <Row justify="space-between">
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName}>{f.name}</Text>
                  <Text style={styles.itemHint}>Floor #{f.floor_number}</Text>
                </View>
                <IconButton
                  name="pencil"
                  accessibilityLabel="Edit"
                  onPress={() => openEdit({ id: f.id, floor_number: f.floor_number, name: f.name })}
                />
                <IconButton
                  name="trash-outline"
                  color={colors.danger}
                  accessibilityLabel="Delete"
                  onPress={() => setDeleteId(f.id)}
                />
              </Row>
            </Card>
          ))
      )}
      <Button label="Add floor" iconName="add" onPress={openNew} block style={{ marginTop: space.md }} />

      <Sheet open={open} onClose={() => setOpen(false)} title={editing ? 'Edit floor' : 'Add floor'}>
        <Field
          label="Floor number"
          required
          value={num}
          onChangeText={setNum}
          keyboardType="number-pad"
          placeholder="e.g. 1"
        />
        <Field label="Name" required value={name} onChangeText={setName} placeholder="e.g. 1st Floor" />
        <Button label={editing ? 'Update' : 'Add'} onPress={save} loading={addFloor.isPending || updateFloor.isPending} block />
      </Sheet>

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={async () => {
          if (deleteId) {
            try {
              await deleteFloor.mutateAsync(deleteId);
              setDeleteId(null);
            } catch (e) {
              Alert.alert('Delete failed', getApiError(e));
            }
          }
        }}
        title="Delete floor?"
        message="This will fail if the floor still has rooms. Delete rooms first."
        confirmLabel="Delete"
        confirmVariant="danger"
        loading={deleteFloor.isPending}
      />
    </>
  );
}

// ── Step 2 · Room types ─────────────────────────────────────────────────────

const RT_PRESETS = [
  { name: '1-Share', capacity: 1 },
  { name: '2-Share', capacity: 2 },
  { name: '3-Share', capacity: 3 },
  { name: '4-Share', capacity: 4 },
  { name: 'Suite', capacity: 1 },
];

function RoomTypesStep({ propertyId }: { propertyId: string }) {
  const roomTypes = useRoomTypes(propertyId);
  const createRT = useCreateRoomType(propertyId);
  const updateRT = useUpdateRoomType(propertyId);
  const deleteRT = useDeleteRoomType(propertyId);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<{ id: string; name: string; capacity: number; base_rent_paise: number } | null>(null);
  const [name, setName] = useState('');
  const [capacity, setCapacity] = useState('2');
  const [rentPaise, setRentPaise] = useState(0);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const openNew = (preset?: (typeof RT_PRESETS)[number]) => {
    setEditing(null);
    setName(preset?.name ?? '');
    setCapacity(String(preset?.capacity ?? 2));
    setRentPaise(0);
    setOpen(true);
  };
  const openEdit = (rt: NonNullable<typeof editing>) => {
    setEditing(rt);
    setName(rt.name);
    setCapacity(String(rt.capacity));
    setRentPaise(rt.base_rent_paise);
    setOpen(true);
  };

  const save = async () => {
    try {
      if (editing) {
        await updateRT.mutateAsync({
          id: editing.id,
          name,
          capacity: Number(capacity),
          base_rent_paise: rentPaise,
        });
      } else {
        await createRT.mutateAsync({ name, capacity: Number(capacity), base_rent_paise: rentPaise });
      }
      setOpen(false);
    } catch (e) {
      Alert.alert('Save failed', getApiError(e));
    }
  };

  return (
    <>
      <Text style={styles.stepHead}>Room types</Text>
      <Text style={styles.stepHint}>Set a base rent per capacity. AC is per-room, not per-type.</Text>

      {roomTypes.isLoading ? (
        <Loading />
      ) : roomTypes.data?.items?.length === 0 ? (
        <Empty title="No types yet" iconName="grid-outline" />
      ) : (
        roomTypes.data?.items.map((rt) => (
          <Card key={rt.id} style={{ marginBottom: space.sm }}>
            <Row justify="space-between">
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName}>{rt.name}</Text>
                <Text style={styles.itemHint}>
                  {rt.capacity} bed{rt.capacity > 1 ? 's' : ''} · {rupees(rt.base_rent_paise)} base
                </Text>
              </View>
              <IconButton
                name="pencil"
                accessibilityLabel="Edit"
                onPress={() =>
                  openEdit({
                    id: rt.id,
                    name: rt.name,
                    capacity: rt.capacity,
                    base_rent_paise: rt.base_rent_paise,
                  })
                }
              />
              <IconButton
                name="trash-outline"
                color={colors.danger}
                accessibilityLabel="Delete"
                onPress={() => setDeleteId(rt.id)}
              />
            </Row>
          </Card>
        ))
      )}
      <Divider />
      <Text style={styles.stepHint}>Presets</Text>
      <Row wrap gap={space.xs}>
        {RT_PRESETS.filter((p) => !roomTypes.data?.items?.some((rt) => rt.name === p.name)).map((p) => (
          <Chip key={p.name} label={`+ ${p.name}`} onPress={() => openNew(p)} />
        ))}
      </Row>
      <Button
        label="Add custom type"
        iconName="add"
        variant="secondary"
        onPress={() => openNew()}
        block
        style={{ marginTop: space.md }}
      />

      <Sheet open={open} onClose={() => setOpen(false)} title={editing ? 'Edit type' : 'Add type'}>
        <Field label="Name" required value={name} onChangeText={setName} placeholder="e.g. 2-Share" />
        <Field
          label="Capacity (beds)"
          required
          value={capacity}
          onChangeText={setCapacity}
          keyboardType="number-pad"
        />
        <MoneyField
          label="Base rent (per bed)"
          required
          valuePaise={rentPaise}
          onChangeAmount={setRentPaise}
          placeholder="10000"
        />
        <Button label={editing ? 'Update' : 'Add'} onPress={save} loading={createRT.isPending || updateRT.isPending} block />
      </Sheet>

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={async () => {
          if (deleteId) {
            try {
              await deleteRT.mutateAsync(deleteId);
              setDeleteId(null);
            } catch (e) {
              Alert.alert('Delete failed', getApiError(e));
            }
          }
        }}
        title="Delete room type?"
        confirmLabel="Delete"
        confirmVariant="danger"
        loading={deleteRT.isPending}
      />
    </>
  );
}

// ── Step 3 · Rooms ──────────────────────────────────────────────────────────

function RoomsStep({ propertyId }: { propertyId: string }) {
  const rooms = useRooms(propertyId);
  const floors = useFloors(propertyId);
  const roomTypes = useRoomTypes(propertyId);
  const addRoom = useAddRoom(propertyId);
  const updateRoom = useUpdateRoom(propertyId);
  const deleteRoom = useDeleteRoom(propertyId);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<null | {
    id: string;
    room_number: string;
    room_name?: string;
    capacity: number;
    base_rent_paise: number;
    has_ac: boolean;
    room_type_id?: string;
    floor_id: string;
  }>(null);
  const [floorId, setFloorId] = useState<string | null>(null);
  const [rtId, setRtId] = useState<string | null>(null);
  const [num, setNum] = useState('');
  const [name, setName] = useState('');
  const [capacity, setCapacity] = useState('2');
  const [rentPaise, setRentPaise] = useState(0);
  const [hasAc, setHasAc] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [floorFilter, setFloorFilter] = useState<string | null>(null);

  const openNew = () => {
    setEditing(null);
    const f = floors.data?.items?.[0]?.id ?? null;
    setFloorId(floorFilter ?? f);
    setRtId(roomTypes.data?.items?.[0]?.id ?? null);
    setNum('');
    setName('');
    setCapacity(String(roomTypes.data?.items?.[0]?.capacity ?? 2));
    setRentPaise(roomTypes.data?.items?.[0]?.base_rent_paise ?? 0);
    setHasAc(false);
    setOpen(true);
  };
  const openEdit = (r: NonNullable<typeof editing>) => {
    setEditing(r);
    setFloorId(r.floor_id);
    setRtId(r.room_type_id ?? null);
    setNum(r.room_number);
    setName(r.room_name ?? '');
    setCapacity(String(r.capacity));
    setRentPaise(r.base_rent_paise);
    setHasAc(r.has_ac);
    setOpen(true);
  };

  const save = async () => {
    if (!floorId) {
      Alert.alert('Missing floor', 'Pick a floor first.');
      return;
    }
    try {
      if (editing) {
        await updateRoom.mutateAsync({
          id: editing.id,
          room_number: num,
          room_name: name || undefined,
          capacity: Number(capacity),
          base_rent_paise: rentPaise,
          has_ac: hasAc,
          room_type_id: rtId ?? undefined,
        });
      } else {
        await addRoom.mutateAsync({
          floor_id: floorId,
          room_type_id: rtId ?? undefined,
          room_number: num,
          room_name: name || undefined,
          capacity: Number(capacity),
          base_rent_paise: rentPaise,
          has_ac: hasAc,
        });
      }
      setOpen(false);
    } catch (e) {
      Alert.alert('Save failed', getApiError(e));
    }
  };

  const shown = (rooms.data?.items ?? [])
    .filter((r) => (floorFilter ? r.floor_id === floorFilter : true))
    .sort((a, b) => a.room_number.localeCompare(b.room_number, undefined, { numeric: true }));

  const canAdd = (floors.data?.items?.length ?? 0) > 0;

  return (
    <>
      <Text style={styles.stepHead}>Rooms</Text>
      <Text style={styles.stepHint}>
        Adding a room auto-creates its beds. AC is a per-room toggle.
      </Text>

      {!canAdd && (
        <Card style={{ marginBottom: space.md, backgroundColor: colors.warnBg }}>
          <Text style={{ color: colors.warn, fontWeight: '600' }}>
            Add at least one floor in step 1 first.
          </Text>
        </Card>
      )}

      {/* Floor filter chips */}
      {(floors.data?.items?.length ?? 0) > 1 && (
        <Row wrap gap={space.xs} style={{ marginBottom: space.md }}>
          <Chip label="All floors" active={!floorFilter} onPress={() => setFloorFilter(null)} />
          {floors.data?.items
            ?.sort((a, b) => a.floor_number - b.floor_number)
            .map((f) => (
              <Chip
                key={f.id}
                label={f.name}
                active={floorFilter === f.id}
                onPress={() => setFloorFilter(f.id)}
              />
            ))}
        </Row>
      )}

      {rooms.isLoading ? (
        <Loading />
      ) : shown.length === 0 ? (
        <Empty title="No rooms yet" iconName="bed-outline" />
      ) : (
        shown.map((r) => (
          <Card key={r.id} style={{ marginBottom: space.sm }}>
            <Row justify="space-between">
              <View style={{ flex: 1 }}>
                <Row gap={space.sm}>
                  <Text style={styles.itemName}>Room {r.room_number}</Text>
                  {r.has_ac && <StatusPill label="AC" tone="info" />}
                </Row>
                <Text style={styles.itemHint}>
                  {r.room_type ?? '—'} · {r.capacity} bed{r.capacity > 1 ? 's' : ''} · {rupees(r.base_rent_paise)}
                </Text>
              </View>
              <IconButton
                name="pencil"
                accessibilityLabel="Edit"
                onPress={() =>
                  openEdit({
                    id: r.id,
                    room_number: r.room_number,
                    room_name: r.room_name,
                    capacity: r.capacity,
                    base_rent_paise: r.base_rent_paise,
                    has_ac: r.has_ac,
                    room_type_id: r.room_type_id,
                    floor_id: r.floor_id,
                  })
                }
              />
              <IconButton
                name="trash-outline"
                color={colors.danger}
                accessibilityLabel="Delete"
                onPress={() => setDeleteId(r.id)}
              />
            </Row>
          </Card>
        ))
      )}

      {canAdd && (
        <Button
          label="Add room"
          iconName="add"
          onPress={openNew}
          block
          style={{ marginTop: space.md }}
        />
      )}

      <Sheet open={open} onClose={() => setOpen(false)} title={editing ? 'Edit room' : 'Add room'}>
        <Select<string>
          label="Floor"
          required
          value={floorId ?? undefined}
          onChange={setFloorId}
          options={(floors.data?.items ?? [])
            .sort((a, b) => a.floor_number - b.floor_number)
            .map((f) => ({ value: f.id, label: f.name }))}
        />
        <Select<string>
          label="Room type"
          value={rtId ?? undefined}
          onChange={(id) => {
            setRtId(id);
            const rt = roomTypes.data?.items?.find((x) => x.id === id);
            if (rt) {
              setCapacity(String(rt.capacity));
              setRentPaise(rt.base_rent_paise);
            }
          }}
          options={(roomTypes.data?.items ?? []).map((rt) => ({
            value: rt.id,
            label: rt.name,
            hint: `${rt.capacity} beds · ${rupees(rt.base_rent_paise)}`,
          }))}
        />
        <Field label="Room number" required value={num} onChangeText={setNum} placeholder="e.g. 303" />
        <Field label="Nickname (optional)" value={name} onChangeText={setName} placeholder="e.g. Corner room" />
        <Row gap={space.sm}>
          <Field
            label="Capacity"
            required
            value={capacity}
            onChangeText={setCapacity}
            keyboardType="number-pad"
            style={{ flex: 1 }}
          />
          <View style={{ flex: 1 }}>
            <MoneyField
              label="Base rent"
              required
              valuePaise={rentPaise}
              onChangeAmount={setRentPaise}
            />
          </View>
        </Row>
        <Card
          onPress={() => setHasAc(!hasAc)}
          style={{
            marginBottom: space.md,
            borderColor: hasAc ? colors.info : colors.border,
            backgroundColor: hasAc ? colors.infoBg : colors.surface,
          }}
        >
          <Row justify="space-between">
            <Row gap={space.sm}>
              <Ionicons name="snow-outline" size={20} color={hasAc ? colors.info : colors.textMuted} />
              <View>
                <Text style={{ fontWeight: '700', color: colors.text }}>AC room</Text>
                <Text style={{ fontSize: fontSize.small, color: colors.textMuted }}>
                  Tap to toggle
                </Text>
              </View>
            </Row>
            <Ionicons
              name={hasAc ? 'checkmark-circle' : 'ellipse-outline'}
              size={26}
              color={hasAc ? colors.info : colors.textDim}
            />
          </Row>
        </Card>
        <Button
          label={editing ? 'Update room' : 'Add room'}
          onPress={save}
          loading={addRoom.isPending || updateRoom.isPending}
          block
        />
      </Sheet>

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={async () => {
          if (deleteId) {
            try {
              await deleteRoom.mutateAsync(deleteId);
              setDeleteId(null);
            } catch (e) {
              Alert.alert('Delete failed', getApiError(e));
            }
          }
        }}
        title="Delete room?"
        message="Beds under this room will also be removed. Fails if any bed is occupied."
        confirmLabel="Delete"
        confirmVariant="danger"
        loading={deleteRoom.isPending}
      />
    </>
  );
}

// ── Step 4 · Review ─────────────────────────────────────────────────────────

function ReviewStep({ propertyId }: { propertyId: string }) {
  const floors = useFloors(propertyId);
  const roomTypes = useRoomTypes(propertyId);
  const rooms = useRooms(propertyId);

  const totalBeds = (rooms.data?.items ?? []).reduce((a, r) => a + (r.capacity ?? 0), 0);
  const acRooms = (rooms.data?.items ?? []).filter((r) => r.has_ac).length;

  return (
    <>
      <Text style={styles.stepHead}>Review</Text>
      <Text style={styles.stepHint}>Confirm the layout is right, then close.</Text>

      <Card style={{ marginBottom: space.md }}>
        <Row justify="space-between">
          <Text style={styles.summaryLabel}>Floors</Text>
          <Text style={styles.summaryValue}>{floors.data?.items?.length ?? 0}</Text>
        </Row>
        <Divider />
        <Row justify="space-between">
          <Text style={styles.summaryLabel}>Room types</Text>
          <Text style={styles.summaryValue}>{roomTypes.data?.items?.length ?? 0}</Text>
        </Row>
        <Divider />
        <Row justify="space-between">
          <Text style={styles.summaryLabel}>Rooms</Text>
          <Text style={styles.summaryValue}>{rooms.data?.items?.length ?? 0}</Text>
        </Row>
        <Divider />
        <Row justify="space-between">
          <Text style={styles.summaryLabel}>AC rooms</Text>
          <Text style={styles.summaryValue}>{acRooms}</Text>
        </Row>
        <Divider />
        <Row justify="space-between">
          <Text style={styles.summaryLabel}>Total beds</Text>
          <Text style={styles.summaryValue}>{totalBeds}</Text>
        </Row>
      </Card>

      <Card>
        <Text style={{ fontWeight: '700', color: colors.text, marginBottom: space.sm }}>
          Owners &amp; payback plan
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: fontSize.small }}>
          Configure owner splits and the ROI payback plan from the web app or in the ROI screen.
        </Text>
      </Card>
    </>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function suffix(n: number) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

const styles = StyleSheet.create({
  stepHead: {
    fontSize: fontSize.h3,
    fontWeight: '700',
    color: colors.text,
    marginTop: space.md,
  },
  stepHint: {
    fontSize: fontSize.small,
    color: colors.textMuted,
    marginBottom: space.md,
  },
  itemName: { fontSize: fontSize.bodyLg, fontWeight: '700', color: colors.text },
  itemHint: { fontSize: fontSize.small, color: colors.textMuted, marginTop: 2 },
  summaryLabel: { fontSize: fontSize.body, color: colors.textMuted, fontWeight: '600' },
  summaryValue: { fontSize: fontSize.bodyLg, fontWeight: '700', color: colors.text },
});
