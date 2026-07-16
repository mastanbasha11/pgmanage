/**
 * Properties list — one card per property with occupancy, tap-to-open detail,
 * and a Setup button that launches the setup wizard.
 */
import { useRouter } from 'expo-router';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
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
  IconButton,
} from '../../components/ui';
import { useProperties } from '../../lib/hooks/properties';
import { useAppStore } from '../../lib/store';
import { colors, radius, space, type as fontSize } from '../../lib/theme';

export default function PropertiesPage() {
  const router = useRouter();
  const properties = useProperties();
  const { setSelectedProperty } = useAppStore();

  return (
    <Screen>
      <Header
        title="Properties"
        subtitle="Manage floors, rooms and beds"
        onBack={() => router.back()}
      />
      <ScrollView showsVerticalScrollIndicator={false}>
        {properties.isLoading ? (
          <Loading />
        ) : properties.data?.items?.length === 0 ? (
          <Empty
            title="No properties yet"
            hint="Create your first property from the web app."
            iconName="business-outline"
          />
        ) : (
          properties.data?.items.map((p) => {
            const pct = Math.round((p.occupancy_rate ?? 0) * 100);
            return (
              <Card key={p.id} style={{ marginBottom: space.md }}>
                <Row justify="space-between">
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{p.name}</Text>
                    {!!p.address && <Text style={styles.addr}>{p.address}</Text>}
                  </View>
                  <IconButton
                    name="open-outline"
                    accessibilityLabel="Open detail"
                    onPress={() => {
                      setSelectedProperty(p.id);
                      router.push({ pathname: '/tabs/rooms' });
                    }}
                  />
                </Row>
                <Row gap={space.sm} style={{ marginTop: space.md }} wrap>
                  <StatusPill label={`${pct}% occupied`} tone={pct > 80 ? 'success' : 'info'} />
                  {p.total_beds != null && (
                    <StatusPill label={`${p.total_beds} beds`} tone="neutral" />
                  )}
                  {p.vacant_beds != null && p.vacant_beds > 0 && (
                    <StatusPill label={`${p.vacant_beds} vacant`} tone="success" />
                  )}
                  {p.reserved_beds != null && p.reserved_beds > 0 && (
                    <StatusPill label={`${p.reserved_beds} reserved`} tone="warn" />
                  )}
                </Row>
                <Row gap={space.sm} style={{ marginTop: space.md }}>
                  <Button
                    label="Setup"
                    variant="secondary"
                    iconName="construct-outline"
                    onPress={() =>
                      router.push({
                        pathname: '/properties/setup',
                        params: { propertyId: p.id },
                      })
                    }
                    block
                    style={{ flex: 1 }}
                  />
                  <Button
                    label="Vacancies"
                    variant="secondary"
                    iconName="bed-outline"
                    onPress={() => {
                      setSelectedProperty(p.id);
                      router.push('/tabs/rooms');
                    }}
                    block
                    style={{ flex: 1 }}
                  />
                </Row>
              </Card>
            );
          })
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  name: { fontSize: fontSize.h3, fontWeight: '700', color: colors.text },
  addr: { fontSize: fontSize.small, color: colors.textMuted, marginTop: 2 },
});
