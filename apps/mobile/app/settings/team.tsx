/**
 * Team — list staff · invite · deactivate. OWNER/PARTNER only.
 */
import { useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

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
  Sheet,
  Field,
  Select,
  Avatar,
  ConfirmDialog,
  Section,
  IconButton,
} from '../../components/ui';
import {
  useTeam,
  useInviteStaff,
  useDeactivateStaff,
  type StaffUser,
} from '../../lib/hooks/misc';
import { useAppStore } from '../../lib/store';
import { getApiError } from '../../lib/api';
import { colors, space, type as fontSize } from '../../lib/theme';

const ROLE_LABEL: Record<StaffUser['role'], string> = {
  OWNER: 'Owner',
  PARTNER: 'Partner',
  PROPERTY_MANAGER: 'Property manager',
  SUPERVISOR: 'Supervisor',
  MARKETING: 'Marketing',
};

const ROLE_TONE: Record<StaffUser['role'], 'accent' | 'info' | 'warn' | 'neutral' | 'success'> = {
  OWNER: 'accent',
  PARTNER: 'accent',
  PROPERTY_MANAGER: 'info',
  SUPERVISOR: 'warn',
  MARKETING: 'success',
};

export default function TeamPage() {
  const router = useRouter();
  const { canManageStaff } = useAppStore();
  const team = useTeam();
  const deactivate = useDeactivateStaff();
  const [addOpen, setAddOpen] = useState(false);
  const [deactivating, setDeactivating] = useState<StaffUser | null>(null);

  if (!canManageStaff()) {
    return (
      <Screen>
        <Header title="Team" onBack={() => router.back()} />
        <Empty title="Not allowed" hint="Only OWNER/PARTNER can view the team." />
      </Screen>
    );
  }

  const active = team.data?.items.filter((s) => s.is_active) ?? [];
  const inactive = team.data?.items.filter((s) => !s.is_active) ?? [];

  return (
    <Screen padded={false}>
      <View style={{ padding: space.lg, paddingBottom: 0 }}>
        <Header title="Team" subtitle={`${active.length} active · ${inactive.length} inactive`} onBack={() => router.back()} />
      </View>
      {team.isLoading ? (
        <Loading />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl }}
          refreshControl={<RefreshControl refreshing={team.isRefetching} onRefresh={team.refetch} tintColor={colors.accent} />}
        >
          <Section title="Active">
            {active.map((s) => (
              <StaffRow key={s.id} s={s} onDeactivate={() => setDeactivating(s)} />
            ))}
            {active.length === 0 && <Empty title="No active staff" iconName="people-outline" />}
          </Section>
          {inactive.length > 0 && (
            <Section title="Inactive">
              {inactive.map((s) => (
                <StaffRow key={s.id} s={s} />
              ))}
            </Section>
          )}
        </ScrollView>
      )}
      <Fab name="add" accessibilityLabel="Invite staff" onPress={() => setAddOpen(true)} />
      {addOpen && <InviteSheet onClose={() => setAddOpen(false)} />}
      <ConfirmDialog
        open={!!deactivating}
        onClose={() => setDeactivating(null)}
        onConfirm={async () => {
          if (deactivating) {
            try {
              await deactivate.mutateAsync(deactivating.id);
              setDeactivating(null);
            } catch (e) {
              Alert.alert('Deactivate failed', getApiError(e));
            }
          }
        }}
        title={`Deactivate ${deactivating?.name}?`}
        message="They can no longer sign in. This is reversible via SQL only right now."
        confirmLabel="Deactivate"
        confirmVariant="danger"
        loading={deactivate.isPending}
      />
    </Screen>
  );
}

function StaffRow({ s, onDeactivate }: { s: StaffUser; onDeactivate?: () => void }) {
  return (
    <Card style={{ marginBottom: space.sm, opacity: s.is_active ? 1 : 0.6 }}>
      <Row gap={space.sm}>
        <Avatar name={s.name} size={44} />
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{s.name}</Text>
          <Text style={styles.meta}>{s.email}</Text>
          <Row gap={4} style={{ marginTop: space.xs }}>
            <StatusPill label={ROLE_LABEL[s.role]} tone={ROLE_TONE[s.role]} />
            {!s.is_active && <StatusPill label="Inactive" tone="danger" />}
          </Row>
        </View>
        {onDeactivate && s.role !== 'OWNER' && (
          <IconButton
            name="ban-outline"
            color={colors.danger}
            accessibilityLabel="Deactivate"
            onPress={onDeactivate}
          />
        )}
      </Row>
    </Card>
  );
}

function InviteSheet({ onClose }: { onClose: () => void }) {
  const invite = useInviteStaff();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<StaffUser['role']>('PROPERTY_MANAGER');

  const submit = async () => {
    if (!name.trim() || !email.trim() || !password) {
      Alert.alert('Missing', 'Name, email and password are required.');
      return;
    }
    try {
      await invite.mutateAsync({
        name: name.trim(),
        email: email.trim(),
        password,
        role,
      });
      onClose();
    } catch (e) {
      Alert.alert('Invite failed', getApiError(e));
    }
  };

  return (
    <Sheet open onClose={onClose} title="Invite staff">
      <Field label="Full name" required value={name} onChangeText={setName} autoCapitalize="words" />
      <Field label="Email" required value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
      <Field label="Temporary password" required value={password} onChangeText={setPassword} secureTextEntry />
      <Select<StaffUser['role']>
        label="Role"
        value={role}
        onChange={setRole}
        options={[
          { value: 'PARTNER', label: 'Partner', hint: 'Full financials & staff, cannot delete org' },
          { value: 'PROPERTY_MANAGER', label: 'Property manager', hint: 'Collect rent, add bookings' },
          { value: 'SUPERVISOR', label: 'Supervisor', hint: 'View property, escalate' },
          { value: 'MARKETING', label: 'Marketing', hint: 'Leads + tenant onboarding, no financials' },
        ]}
      />
      <Button label="Invite" onPress={submit} loading={invite.isPending} block />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  name: { fontSize: fontSize.bodyLg, fontWeight: '700', color: colors.text },
  meta: { fontSize: fontSize.small, color: colors.textMuted, marginTop: 2 },
});
