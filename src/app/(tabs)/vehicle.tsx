/**
 * Vehicle calculator: cents-per-kilometre, capped at 5,000 km per car.
 *
 * All arithmetic is in `vehicleCalculator.ts` and the rate comes from
 * `atoRates.ts`. This screen reads numbers and renders them; it computes nothing,
 * so there is no figure here that a test can't reach.
 *
 * The cap is shown as a bar per car because "how much of my 5,000 km is left" is
 * the question this method actually raises, and it's per vehicle — someone with
 * two cars has two allowances.
 */

import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useTheme } from '@react-navigation/native';
import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { provisionalRateMessage, rateUnavailableMessage } from '@/config/atoRates';
import { vehicleTripRepository } from '@/db/receiptRepository';
import type { VehicleTrip } from '@/domain/types';
import { capProgress, calculateVehicleClaim, type VehicleClaim } from '@/domain/vehicleCalculator';
import { formatDateAu, fyLabel } from '@/lib/financialYear';
import { formatCents } from '@/lib/money';
import { useFinancialYear } from '@/state/financialYear';

type Colors = ReturnType<typeof useTheme>['colors'];

/** Kilometres for display: no trailing `.0`, but decimals kept when present. */
function formatKm(kilometres: number): string {
  return `${Number(kilometres.toFixed(2)).toLocaleString('en-AU')} km`;
}

export default function Vehicle() {
  const { colors } = useTheme();
  const { fy } = useFinancialYear();

  const [trips, setTrips] = useState<VehicleTrip[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setTrips(await vehicleTripRepository.list(fy));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [fy]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const calculation = useMemo(
    () => (trips === null ? null : calculateVehicleClaim(trips, fy)),
    [trips, fy],
  );

  const sections = useMemo(
    () =>
      (calculation?.claims ?? []).map((claim) => ({
        claim,
        data: (trips ?? [])
          .filter((trip) => trip.vehicleLabel === claim.vehicleLabel)
          // Newest first, matching every other list in the app.
          .sort((a, b) => b.date.localeCompare(a.date)),
      })),
    [calculation, trips],
  );

  const confirmDelete = useCallback(
    (trip: VehicleTrip) => {
      Alert.alert(
        'Delete trip?',
        `${formatKm(trip.kilometres)} — ${trip.purpose} will be removed from your ${fyLabel(trip.financialYear)} records.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => {
              void (async () => {
                try {
                  await vehicleTripRepository.softDelete(trip.id);
                  await refresh();
                } catch (cause) {
                  setError(cause instanceof Error ? cause.message : String(cause));
                }
              })();
            },
          },
        ],
      );
    },
    [refresh],
  );

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {error !== null && <Text style={[styles.error, { color: colors.notification }]}>{error}</Text>}

      {trips === null ? (
        <ActivityIndicator style={styles.loading} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(trip) => trip.id}
          contentContainerStyle={styles.list}
          stickySectionHeadersEnabled={false}
          ListHeaderComponent={
            <Header fy={fy} calculation={calculation} tripCount={trips.length} colors={colors} />
          }
          ListEmptyComponent={<Empty fy={fy} colors={colors} />}
          renderSectionHeader={({ section }) =>
            calculation === null ? null : (
              <CarHeader
                claim={section.claim}
                capPerCar={calculation.capPerCar}
                centsPerKm={calculation.centsPerKm}
                colors={colors}
              />
            )
          }
          renderItem={({ item }) => (
            <TripRow trip={item} colors={colors} onDelete={confirmDelete} />
          )}
        />
      )}

      <Pressable
        onPress={() => router.push('/trip/new')}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.addButton,
          { backgroundColor: colors.primary, opacity: pressed ? 0.7 : 1 },
        ]}>
        <Ionicons name="add" size={20} color="#fff" />
        <Text style={styles.addLabel}>Add trip</Text>
      </Pressable>
    </View>
  );
}

/** The claimable total, the rate behind it, and any caveat about that rate. */
function Header({
  fy,
  calculation,
  tripCount,
  colors,
}: {
  fy: number;
  calculation: ReturnType<typeof calculateVehicleClaim>;
  tripCount: number;
  colors: Colors;
}) {
  if (calculation === null) {
    return (
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.notification }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Cents per kilometre</Text>
        <Text style={[styles.warning, { color: colors.notification }]}>
          {rateUnavailableMessage(fy, 'centsPerKm')}
        </Text>
        <Text style={[styles.note, { color: colors.text }]}>
          Your {tripCount === 1 ? 'trip is' : 'trips are'} still saved. The figure will appear once
          the rate is published.
        </Text>
      </View>
    );
  }

  return (
    <>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Claimable · {fyLabel(fy)}</Text>
        <Text style={[styles.total, { color: colors.text }]}>
          {formatCents(calculation.totalClaimableCents)}
        </Text>
        <Text style={[styles.note, { color: colors.text }]}>
          {calculation.centsPerKm}c per kilometre, capped at{' '}
          {calculation.capPerCar.toLocaleString('en-AU')} km per car. Covers all running costs for
          that car, so they can&apos;t also be claimed separately.
        </Text>

        {calculation.provisional && (
          <View style={styles.provisionalRow}>
            <Ionicons name="alert-circle" size={15} color={colors.notification} />
            <Text style={[styles.provisional, { color: colors.notification }]}>
              {provisionalRateMessage(fy, 'centsPerKm')}
            </Text>
          </View>
        )}
      </View>

      {calculation.claims.some((claim) => claim.capped) && (
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.note, { color: colors.text }]}>
            A car past {calculation.capPerCar.toLocaleString('en-AU')} km can&apos;t claim more under
            this method. The logbook method has no cap, but it needs receipts and a 12-week logbook —
            TaxTrack doesn&apos;t do that yet.
          </Text>
        </View>
      )}
    </>
  );
}

/** One car: its kilometres, how much of the cap is used, and what it claims. */
function CarHeader({
  claim,
  capPerCar,
  centsPerKm,
  colors,
}: {
  claim: VehicleClaim;
  capPerCar: number;
  centsPerKm: number;
  colors: Colors;
}) {
  const progress = capProgress(claim, capPerCar);
  const accent = claim.capped ? colors.notification : colors.primary;

  return (
    <View style={styles.carHeader}>
      <View style={styles.carTopRow}>
        <Text style={[styles.carName, { color: colors.text }]} numberOfLines={1}>
          {claim.vehicleLabel}
        </Text>
        <Text style={[styles.carClaim, { color: colors.text }]}>
          {formatCents(claim.claimableCents)}
        </Text>
      </View>

      <View style={[styles.track, { backgroundColor: colors.border }]}>
        <View
          style={[styles.fill, { backgroundColor: accent, width: `${Math.round(progress * 100)}%` }]}
        />
      </View>

      <Text style={[styles.note, { color: claim.capped ? accent : colors.text }]}>
        {claim.capped
          ? `${formatKm(claim.kilometres)} logged — only ${formatKm(claim.claimableKilometres)} is claimable at ${centsPerKm}c.`
          : `${formatKm(claim.kilometres)} of ${capPerCar.toLocaleString('en-AU')} km · ${claim.tripCount} ${claim.tripCount === 1 ? 'trip' : 'trips'}`}
      </Text>
    </View>
  );
}

function TripRow({
  trip,
  colors,
  onDelete,
}: {
  trip: VehicleTrip;
  colors: Colors;
  onDelete: (trip: VehicleTrip) => void;
}) {
  return (
    <View style={styles.tripRow}>
      <Pressable
        onPress={() => router.push(`/trip/${trip.id}`)}
        accessibilityRole="button"
        accessibilityLabel={`Edit trip, ${formatKm(trip.kilometres)}, ${trip.purpose}`}
        style={({ pressed }) => [styles.tripTap, { opacity: pressed ? 0.6 : 1 }]}>
        <View style={styles.tripText}>
          <View style={styles.tripHeading}>
            <Text style={[styles.tripPurpose, { color: colors.text }]} numberOfLines={1}>
              {trip.purpose}
            </Text>
            <Text style={[styles.note, { color: colors.text }]}>{formatDateAu(trip.date)}</Text>
          </View>
        </View>
        <Text style={[styles.tripKm, { color: colors.text }]}>{formatKm(trip.kilometres)}</Text>
      </Pressable>

      <Pressable
        onPress={() => onDelete(trip)}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel={`Delete trip, ${trip.purpose}`}
        style={({ pressed }) => [styles.deleteButton, { opacity: pressed ? 0.5 : 1 }]}>
        <Ionicons name="trash-outline" size={18} color={colors.notification} />
      </Pressable>
    </View>
  );
}

function Empty({ fy, colors }: { fy: number; colors: Colors }) {
  return (
    <View style={styles.empty}>
      <Ionicons name="car-outline" size={28} color={colors.text} style={styles.emptyIcon} />
      <Text style={[styles.emptyTitle, { color: colors.text }]}>No trips in {fyLabel(fy)}</Text>
      <Text style={[styles.emptyBody, { color: colors.text }]}>
        Log a work trip and TaxTrack works out the claim at the ATO&apos;s cents-per-kilometre rate.
      </Text>
      <Text style={[styles.emptyBody, { color: colors.text }]}>
        This method needs no receipts, but you do need to show you own the car and how you worked out
        the kilometres — which is what this log is.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  loading: { marginVertical: 40 },
  list: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20, gap: 4 },
  card: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 8,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    opacity: 0.5,
  },
  total: { fontSize: 40, fontWeight: '700', fontVariant: ['tabular-nums'] },
  provisionalRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 5, marginTop: 2 },
  provisional: { flex: 1, fontSize: 12, lineHeight: 17 },
  carHeader: { paddingTop: 16, paddingBottom: 8, gap: 6 },
  carTopRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  carName: { flex: 1, fontSize: 17, fontWeight: '700' },
  carClaim: { fontSize: 17, fontWeight: '700', fontVariant: ['tabular-nums'] },
  track: { height: 5, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 5, borderRadius: 3 },
  tripRow: { flexDirection: 'row', alignItems: 'center' },
  tripTap: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  tripText: { flex: 1, paddingRight: 12 },
  tripHeading: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  tripPurpose: { fontSize: 15, opacity: 0.9, flexShrink: 1 },
  // Right-aligned over a fixed width so the distances stack into a column.
  tripKm: {
    fontSize: 15,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    minWidth: 92,
    textAlign: 'right',
  },
  deleteButton: { width: 32, alignItems: 'flex-end', paddingVertical: 6 },
  empty: { alignItems: 'center', paddingVertical: 40, gap: 6 },
  emptyIcon: { opacity: 0.3, marginBottom: 4 },
  emptyTitle: { fontSize: 17, fontWeight: '600' },
  emptyBody: { fontSize: 14, opacity: 0.5, textAlign: 'center', lineHeight: 20 },
  warning: { fontSize: 13, lineHeight: 18 },
  error: { fontSize: 13, lineHeight: 18, paddingHorizontal: 20, paddingTop: 10 },
  note: { fontSize: 12, opacity: 0.45, lineHeight: 16 },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 10,
    paddingVertical: 13,
    marginHorizontal: 20,
    marginBottom: 12,
  },
  addLabel: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
