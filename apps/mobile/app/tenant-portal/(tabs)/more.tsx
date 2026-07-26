/**
 * Resident More — profile, KYC status, personal/emergency/vehicle details,
 * refer-a-friend, get help, and sign out.
 */
import { Alert, Linking, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { colors, space } from '../../../lib/theme';
import { useTenantProfile, useTenantReferralSummary } from '../../../lib/tenant/hooks';
import {
  TScreen,
  TAppBar,
  TCard,
  TListRow,
  TAvatar,
  TPill,
  TButton,
  TIconBtn,
  Cap,
  rupees,
} from '../../../components/tenant-ui';

const VEHICLE_LABEL: Record<string, string> = {
  NONE: 'None added',
  TWO_WHEELER: 'Two-wheeler',
  FOUR_WHEELER: 'Four-wheeler',
};

export default function TenantMore() {
  const router = useRouter();
  const profile = useTenantProfile();
  const referral = useTenantReferralSummary();
  const p = profile.data;

  async function logout() {
    await AsyncStorage.removeItem('tenant_access_token');
    router.replace('/tenant-portal');
  }

  const vehicle =
    p?.vehicle.type && p.vehicle.type !== 'NONE'
      ? `${VEHICLE_LABEL[p.vehicle.type]}${p.vehicle.registration ? ` · ${p.vehicle.registration}` : ''}`
      : 'None added';

  const emergency = p?.emergency
    ? `${p.emergency.name} · ${p.emergency.phone}`
    : 'Not added';

  return (
    <TScreen>
      <TAppBar title="More" right={<TIconBtn icon="settings-outline" />} />

      {/* Identity */}
      <TCard style={{ marginTop: space.xs }}>
        <View style={styles.idRow}>
          <TAvatar name={p?.name ?? '?'} size={44} />
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{p?.name ?? '—'}</Text>
            <Text style={styles.idSub} numberOfLines={1}>
              {[p?.property.name, p?.room.roomNumber && `Room ${p.room.roomNumber}`]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
          <TPill
            label={p?.kycComplete ? 'KYC done' : 'KYC pending'}
            tone={p?.kycComplete ? 'money' : 'warm'}
            icon={p?.kycComplete ? 'checkmark' : 'alert-circle-outline'}
          />
        </View>
      </TCard>

      {/* Profile */}
      <Cap>PROFILE</Cap>
      <TCard style={{ paddingVertical: 4 }}>
        <TListRow icon="person-outline" title="Personal details" sub={p?.phone ?? ''} chevron
          onPress={() => Alert.alert('Personal details', `${p?.name ?? ''}\n${p?.phone ?? ''}`)} />
        <TListRow icon="call-outline" title="Emergency contact" sub={emergency} chevron
          onPress={() => Alert.alert('Emergency contact', emergency)} />
        <TListRow icon="bicycle-outline" title="Vehicle details" sub={vehicle} chevron
          onPress={() => Alert.alert('Vehicle', vehicle)} />
        <TListRow icon="id-card-outline" title="KYC documents"
          sub={p?.kycComplete ? 'verified' : 'pending'} chevron last
          onPress={() => Alert.alert('KYC', p?.kycComplete ? 'Your KYC is verified.' : 'KYC pending — please complete at the desk.')} />
      </TCard>

      {/* Refer */}
      <Cap>EARN</Cap>
      <TCard variant="dark" style={{ alignItems: 'center', paddingVertical: 18 }}>
        <Text style={styles.referTitle}>Refer a friend</Text>
        <Text style={styles.referSub}>
          They get a discount on first rent · you get credit
        </Text>
        {referral.data?.code ? (
          <View style={styles.codeBox}>
            <Text style={styles.code}>{referral.data.code}</Text>
          </View>
        ) : null}
        <TButton
          label="Share on WhatsApp"
          style={{ marginTop: 12, alignSelf: 'stretch', backgroundColor: '#fff', borderColor: '#fff' }}
          icon="logo-whatsapp"
          onPress={() => {
            const code = referral.data?.code;
            const msg = code
              ? `Join me at ${p?.property.name ?? 'our PG'}! Use my code ${code} for a discount on your first rent.`
              : `Join me at ${p?.property.name ?? 'our PG'}!`;
            Linking.openURL(`whatsapp://send?text=${encodeURIComponent(msg)}`).catch(() =>
              Alert.alert('WhatsApp not installed'),
            );
          }}
        />
        {referral.data && referral.data.totalEarnedPaise > 0 && (
          <Text style={styles.earned}>
            Earned so far: {rupees(referral.data.totalEarnedPaise)}
          </Text>
        )}
      </TCard>

      {/* Support */}
      <Cap>SUPPORT</Cap>
      <TCard style={{ paddingVertical: 4 }}>
        <TListRow icon="construct-outline" title="Get help" sub="raise a maintenance request" chevron
          onPress={() => router.push('/tenant-portal/help')} />
        <TListRow icon="notifications-outline" title="Notifications" chevron last
          onPress={() => Alert.alert('Notifications', 'No new notifications.')} />
      </TCard>

      <TButton
        label="Sign out"
        icon="log-out-outline"
        style={{ marginTop: space.lg }}
        onPress={() =>
          Alert.alert('Sign out?', 'You’ll need your phone + OTP to sign back in.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Sign out', style: 'destructive', onPress: logout },
          ])
        }
      />
      <Text style={styles.version}>The LOOP · Resident</Text>
    </TScreen>
  );
}

const styles = StyleSheet.create({
  idRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: { fontSize: 14, fontWeight: '800', color: colors.text },
  idSub: { fontSize: 11, color: colors.textDim, marginTop: 2 },
  referTitle: { color: '#fff', fontSize: 15, fontWeight: '800' },
  referSub: { color: colors.ondark, opacity: 0.75, fontSize: 11.5, marginTop: 3, textAlign: 'center' },
  codeBox: {
    backgroundColor: '#ffffff1f',
    borderRadius: 11,
    paddingVertical: 10,
    paddingHorizontal: 24,
    marginTop: 13,
  },
  code: { color: '#fff', fontSize: 15, fontWeight: '800', letterSpacing: 3 },
  earned: { color: colors.ondark, opacity: 0.85, fontSize: 11.5, marginTop: 10 },
  version: { fontSize: 11, color: colors.textDim, textAlign: 'center', marginTop: space.md },
});
