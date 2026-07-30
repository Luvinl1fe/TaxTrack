/**
 * Dashboard: what the year adds up to.
 *
 * Replaces the milestone 3/4 development screen. The ATO rates panel that screen
 * carried was there to prove the config loaded on a device; it isn't something a
 * user needs on their home screen, so it goes.
 *
 * Every figure here comes from the repository's SQL, and the receipt list groups
 * the same rows in TypeScript. `receiptRepository.test.ts` asserts the two agree
 * — the dashboard must not be able to contradict the list.
 */

import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useTheme } from '@react-navigation/native';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { provisionalRateMessage, rateUnavailableMessage } from '@/config/atoRates';
import { receiptRepository, vehicleTripRepository } from '@/db/receiptRepository';
import { categoryName } from '@/domain/receiptList';
import {
  substantiationMessage,
  substantiationStatus,
  thresholdCentsForFy,
  type SubstantiationStatus,
} from '@/domain/substantiation';
import type { CategoryTotal } from '@/domain/types';
import { calculateVehicleClaim, type VehicleCalculation } from '@/domain/vehicleCalculator';
import { fyLabel } from '@/lib/financialYear';
import { formatCents } from '@/lib/money';
import { useFinancialYear } from '@/state/financialYear';

type Colors = ReturnType<typeof useTheme>['colors'];

export default function Dashboard() {
  const { colors } = useTheme();
  // Read only: the year is now chosen from the header control, which every tab
  // shows, so no screen owns the selector any more.
  const { fy } = useFinancialYear();

  const [totals, setTotals] = useState<CategoryTotal[] | null>(null);
  const [status, setStatus] = useState<SubstantiationStatus | null>(null);
  const [vehicle, setVehicle] = useState<VehicleCalculation | null>(null);
  const [tripCount, setTripCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [categoryTotals, receipts, trips] = await Promise.all([
        receiptRepository.totalsByCategory(fy),
        receiptRepository.list(fy),
        vehicleTripRepository.list(fy),
      ]);

      setTotals(categoryTotals);
      // Kept in its own card, never folded into the receipts total: the two are
      // computed from different records under different ATO rules, and a single
      // figure would invite someone to claim car costs twice.
      setVehicle(calculateVehicleClaim(trips, fy));
      setTripCount(trips.length);

      // The threshold is a published figure and `substantiationStatus` throws
      // rather than assuming $300 for a year it has no rates for. A receipt
      // backdated past the earliest year on file makes that year selectable, so
      // check before asking — and keep the totals on screen either way.
      const threshold = thresholdCentsForFy(fy);
      // The nudge counts a narrower set than the totals do — car, gifts and tax
      // affairs are out, and so is allowance-covered travel — so it needs the
      // receipts themselves, not the category sums.
      setStatus(threshold === null ? null : substantiationStatus(receipts, fy));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [fy]);

  // On focus, not on mount: returning from the receipt form has to pick up what
  // was just saved, and this screen never unmounts while the form is open.
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const totalClaimedCents =
    totals === null ? 0 : totals.reduce((sum, total) => sum + total.totalCents, 0);
  const receiptCount =
    totals === null ? 0 : totals.reduce((sum, total) => sum + total.receiptCount, 0);

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}>
      {error !== null && (
        <View
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.notification },
          ]}>
          <Text style={[styles.warning, { color: colors.notification }]}>{error}</Text>
        </View>
      )}

      {totals === null ? (
        <ActivityIndicator style={styles.loading} />
      ) : receiptCount === 0 && tripCount === 0 ? (
        <EmptyYear fy={fy} colors={colors} />
      ) : (
        <>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {/* "Receipts", not "Total claimed". Car trips are a separate claim
                under separate rules, and one combined figure would read as
                everything the user can claim — which it isn't. */}
            <Text style={[styles.cardTitle, { color: colors.text }]}>Receipts</Text>
            <Text style={[styles.total, { color: colors.text }]}>
              {formatCents(totalClaimedCents)}
            </Text>
            <Text style={[styles.note, { color: colors.text }]}>
              The work-use portion of {receiptCount} {receiptCount === 1 ? 'receipt' : 'receipts'} in{' '}
              {fyLabel(fy)}. Car trips are claimed separately — see the Vehicle tab.
            </Text>
          </View>

          {tripCount > 0 && (
            <VehicleCard
              fy={fy}
              calculation={vehicle}
              tripCount={tripCount}
              colors={colors}
              onPress={() => router.push('/vehicle')}
            />
          )}

          {receiptCount > 0 &&
            (status === null ? (
              <ThresholdUnavailable fy={fy} colors={colors} />
            ) : (
              <EvidenceCard status={status} colors={colors} />
            ))}

          {receiptCount > 0 && (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Receipts by category</Text>
            {totals.map((total) => (
              <View key={total.categoryId} style={styles.categoryRow}>
                <Text style={[styles.categoryName, { color: colors.text }]} numberOfLines={1}>
                  {categoryName(total.categoryId)}
                </Text>
                <Text style={[styles.categoryCount, { color: colors.text }]}>
                  {total.receiptCount}
                </Text>
                <Text style={[styles.categoryAmount, { color: colors.text }]}>
                  {formatCents(total.totalCents)}
                </Text>
              </View>
            ))}
          </View>
          )}
        </>
      )}

      <Pressable
        onPress={() => router.push('/receipt/new')}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.addButton,
          { backgroundColor: colors.primary, opacity: pressed ? 0.7 : 1 },
        ]}>
        <Ionicons name="add" size={20} color="#fff" />
        <Text style={styles.addLabel}>Add receipt</Text>
      </Pressable>

      <Text style={[styles.disclaimer, { color: colors.text }]}>
        TaxTrack is a record-keeping tool, not tax advice.
      </Text>
    </ScrollView>
  );
}

/**
 * The $300 nudge.
 *
 * This is the aggregate substantiation test — written evidence — not the
 * immediate write-off threshold, which is the same figure applied to a single
 * asset. The heading says so, because conflating them is the mistake the two
 * separate config fields exist to prevent.
 *
 * The wording comes from `substantiationMessage`, which never says "you can
 * claim $300 without receipts": the threshold governs evidence, not entitlement.
 */
function EvidenceCard({ status, colors }: { status: SubstantiationStatus; colors: Colors }) {
  const progress = Math.min(1, status.totalCents / status.thresholdCents);
  const accent = status.crossed ? colors.notification : colors.primary;

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.cardTitle, { color: colors.text }]}>
        Written evidence · {formatCents(status.thresholdCents)} test
      </Text>

      <View style={styles.evidenceHeading}>
        <Ionicons
          name={status.crossed ? 'alert-circle' : 'information-circle-outline'}
          size={18}
          color={accent}
        />
        <Text style={[styles.evidenceTotal, { color: colors.text }]}>
          {formatCents(status.totalCents)} of work expenses
        </Text>
      </View>

      {/* A bar, because "how close am I" is a comparison, and a number alone
          doesn't answer it at a glance. */}
      <View style={[styles.track, { backgroundColor: colors.border }]}>
        <View
          style={[styles.fill, { backgroundColor: accent, width: `${Math.round(progress * 100)}%` }]}
        />
      </View>

      <Text style={[styles.evidenceMessage, { color: status.crossed ? accent : colors.text }]}>
        {substantiationMessage(status)}
      </Text>

      {status.excluded.length > 0 && (
        <Text style={[styles.note, { color: colors.text }]}>
          {status.excluded.length}{' '}
          {status.excluded.length === 1 ? 'receipt is' : 'receipts are'} outside this test — car
          expenses, gifts, tax affairs, and travel or meals covered by an allowance have their own
          rules.
        </Text>
      )}
    </View>
  );
}

/**
 * The vehicle claim, deliberately its own card.
 *
 * Separate from the receipts total because they are different claims under
 * different rules: cents-per-kilometre needs no receipts, covers all running
 * costs for that car, and is excluded from the $300 evidence test. Adding the two
 * into one "total claimed" would invite someone to also claim fuel receipts on
 * top, which this method forbids.
 *
 * Tappable through to the Vehicle tab, since the per-car detail lives there.
 */
function VehicleCard({
  fy,
  calculation,
  tripCount,
  colors,
  onPress,
}: {
  fy: number;
  calculation: VehicleCalculation | null;
  tripCount: number;
  colors: Colors;
  onPress: () => void;
}) {
  const trips = `${tripCount} ${tripCount === 1 ? 'trip' : 'trips'}`;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Car and vehicle claim. Opens the Vehicle tab."
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
      ]}>
      <View style={styles.cardHeaderRow}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Car &amp; vehicle</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.text} style={styles.chevron} />
      </View>

      {calculation === null ? (
        <>
          <Text style={[styles.warning, { color: colors.notification }]}>
            {rateUnavailableMessage(fy, 'centsPerKm')}
          </Text>
          <Text style={[styles.note, { color: colors.text }]}>
            Your {trips} {tripCount === 1 ? 'is' : 'are'} still saved.
          </Text>
        </>
      ) : (
        <>
          <Text style={[styles.total, { color: colors.text }]}>
            {formatCents(calculation.totalClaimableCents)}
          </Text>
          <Text style={[styles.note, { color: colors.text }]}>
            {trips} at {calculation.centsPerKm}c per kilometre. Covers all running costs for the car,
            so fuel and servicing can&apos;t also be claimed as receipts.
          </Text>
          {calculation.provisional && (
            <Text style={[styles.warning, { color: colors.notification }]}>
              {provisionalRateMessage(fy, 'centsPerKm')}
            </Text>
          )}
        </>
      )}
    </Pressable>
  );
}

/**
 * Shown instead of the nudge for a year with no rates on file.
 *
 * States the reason rather than quietly omitting the card, and never falls back
 * to $300 from memory — the same rule the rates config follows for the
 * unpublished WFH rate. The receipts and totals above are unaffected: they don't
 * depend on any published figure.
 */
function ThresholdUnavailable({ fy, colors }: { fy: number; colors: Colors }) {
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.cardTitle, { color: colors.text }]}>Written evidence</Text>
      <Text style={[styles.note, { color: colors.text }]}>
        TaxTrack has no ATO thresholds on file for {fyLabel(fy)}, so it can&apos;t tell you whether
        this year&apos;s expenses need written evidence. Your receipts and totals above are
        unaffected.
      </Text>
    </View>
  );
}

/** First launch, or a year the user hasn't filed anything under yet. */
function EmptyYear({ fy, colors }: { fy: number; colors: Colors }) {
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.cardTitle, { color: colors.text }]}>Nothing yet</Text>
      <Text style={[styles.emptyBody, { color: colors.text }]}>
        No receipts for {fyLabel(fy)}. Add one and this screen will show what you&apos;ve claimed,
        broken down by category.
      </Text>
      <Text style={[styles.note, { color: colors.text }]}>
        Receipts are stored on this phone only. There is no backup yet.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 16 },
  loading: { marginVertical: 40 },
  card: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 8,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    opacity: 0.5,
  },
  // The headline figure of the whole app. Tabular so it doesn't jitter as the
  // digits change between years.
  total: { fontSize: 40, fontWeight: '700', fontVariant: ['tabular-nums'] },
  // The chevron sits on the title's line so the card reads as one tappable unit
  // rather than a heading with a stray arrow beside it.
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chevron: { opacity: 0.3 },
  evidenceHeading: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  evidenceTotal: { fontSize: 17, fontWeight: '600', fontVariant: ['tabular-nums'] },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  evidenceMessage: { fontSize: 13, lineHeight: 19 },
  categoryRow: { flexDirection: 'row', alignItems: 'baseline', gap: 12 },
  categoryName: { flex: 1, fontSize: 15, opacity: 0.8 },
  // Fixed column so the counts line up under each other rather than sitting
  // wherever the category name ends.
  categoryCount: {
    fontSize: 12,
    opacity: 0.4,
    minWidth: 20,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  categoryAmount: {
    fontSize: 15,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    minWidth: 88,
    textAlign: 'right',
  },
  emptyBody: { fontSize: 15, lineHeight: 21, opacity: 0.8 },
  warning: { fontSize: 13, lineHeight: 18 },
  note: { fontSize: 12, opacity: 0.45, lineHeight: 16 },
  // Filled rather than outlined: adding a receipt is the primary action, and it
  // should read that way at a glance.
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 10,
    paddingVertical: 13,
  },
  addLabel: { color: '#fff', fontSize: 15, fontWeight: '700' },
  disclaimer: { fontSize: 12, opacity: 0.5, textAlign: 'center' },
});
