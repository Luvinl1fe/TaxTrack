import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useTheme } from '@react-navigation/native';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { getRate, rateUnavailableMessage, ratesForFy, type NullableRate } from '@/config/atoRates';
import { receiptRepository } from '@/db/receiptRepository';
import { categoryById } from '@/domain/categories';
import { substantiationMessage, substantiationStatus } from '@/domain/substantiation';
import type { CategoryTotal, Receipt } from '@/domain/types';
import { currentFy, formatDateAu, fyBounds, fyLabel } from '@/lib/financialYear';
import { formatCents } from '@/lib/money';

/**
 * Temporary development screen.
 *
 * Proves the FY module, rates config and SQLite repository work on a real
 * device rather than only under Jest. Milestone 4 replaces it with the real
 * receipt list and entry form.
 */
export default function Index() {
  const { colors } = useTheme();

  const fy = currentFy();
  const bounds = fyBounds(fy);
  const rates = ratesForFy(fy);

  const [receipts, setReceipts] = useState<Receipt[] | null>(null);
  const [totals, setTotals] = useState<CategoryTotal[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [rows, categoryTotals] = await Promise.all([
        receiptRepository.list(fy),
        receiptRepository.totalsByCategory(fy),
      ]);
      setReceipts(rows);
      setTotals(categoryTotals);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [fy]);

  // On focus, not on mount: coming back from the receipt form has to pick up
  // what was just saved, and the screen underneath never unmounts.
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  // Deleting is destructive and irreversible from the user's point of view, so
  // it asks first. The prompt names the receipt rather than saying "this item".
  const confirmDelete = useCallback(
    (receipt: Receipt) => {
      Alert.alert(
        'Delete receipt?',
        `${receipt.merchant} · ${formatCents(receipt.amountCents)} will be removed from your ${fyLabel(receipt.financialYear)} records.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => {
              void (async () => {
                try {
                  await receiptRepository.softDelete(receipt.id);
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

  const status = receipts === null ? null : substantiationStatus(receipts, fy);

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}>
      <Text style={[styles.title, { color: colors.text }]}>{fyLabel(fy)}</Text>
      <Text style={[styles.caption, { color: colors.text }]}>
        {formatDateAu(bounds.start)} to {formatDateAu(bounds.end)}
      </Text>

      {error !== null && (
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.notification }]}>
          <Text style={[styles.warning, { color: colors.notification }]}>{error}</Text>
        </View>
      )}

      <Section title="ATO rates" colors={colors}>
        {rates === null ? (
          <Text style={[styles.warning, { color: colors.notification }]}>
            No rates on file for {fyLabel(fy)}.
          </Text>
        ) : (
          <>
            <RateRow fy={fy} rate="centsPerKm" label="Cents per km" colors={colors} />
            <Row
              label="Km cap per car"
              value={rates.kmCapPerCar.toLocaleString('en-AU')}
              colors={colors}
            />
            <RateRow fy={fy} rate="wfhCentsPerHour" label="WFH per hour" colors={colors} />
            <Row
              label="Substantiation"
              value={formatCents(rates.substantiationThresholdCents)}
              colors={colors}
            />
            <Text style={[styles.note, { color: colors.text }]}>
              Aggregate across the year. Excludes car expenses.
            </Text>
            <Row
              label="Immediate write-off"
              value={formatCents(rates.immediateWriteOffThresholdCents)}
              colors={colors}
            />
            <Text style={[styles.note, { color: colors.text }]}>
              Per individual asset. Depreciation is Phase 3.
            </Text>
          </>
        )}
      </Section>

      <Section title="Database" colors={colors}>
        {receipts === null ? (
          <ActivityIndicator />
        ) : (
          <>
            <Row label="Receipts stored" value={String(receipts.length)} colors={colors} />
            {status !== null && (
              <>
                <Row
                  label="Counting toward $300"
                  value={formatCents(status.totalCents)}
                  colors={colors}
                />
                <Row
                  label="Excluded"
                  value={String(status.excluded.length)}
                  colors={colors}
                />
                <Text
                  style={[
                    styles.note,
                    { color: status.crossed ? colors.notification : colors.text },
                  ]}>
                  {substantiationMessage(status)}
                </Text>
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
          </>
        )}
      </Section>

      {totals.length > 0 && (
        <Section title="Totals by category" colors={colors}>
          {totals.map((total) => (
            <Row
              key={total.categoryId}
              label={categoryById(total.categoryId)?.name ?? total.categoryId}
              value={`${formatCents(total.totalCents)}  (${total.receiptCount})`}
              colors={colors}
            />
          ))}
        </Section>
      )}

      {receipts !== null && receipts.length > 0 && (
        <Section title="Receipts" colors={colors}>
          {receipts.map((receipt) => (
            <View key={receipt.id} style={styles.receiptRow}>
              <Pressable
                onPress={() => router.push(`/receipt/${receipt.id}`)}
                accessibilityRole="button"
                accessibilityLabel={`Edit receipt from ${receipt.merchant}`}
                style={({ pressed }) => [styles.receiptTap, { opacity: pressed ? 0.6 : 1 }]}>
                <View style={styles.receiptText}>
                  <View style={styles.receiptHeading}>
                    <Text
                      style={[styles.rowLabel, styles.merchant, { color: colors.text }]}
                      numberOfLines={1}>
                      {receipt.merchant}
                    </Text>
                    <Text style={[styles.note, { color: colors.text }]}>
                      {formatDateAu(receipt.purchaseDate)}
                    </Text>
                  </View>
                  <Text style={[styles.note, { color: colors.text }]} numberOfLines={1}>
                    {categoryById(receipt.categoryId)?.name ?? receipt.categoryId}
                  </Text>
                </View>

                {receipt.photoUri !== null && (
                  <Ionicons
                    name="image-outline"
                    size={15}
                    color={colors.text}
                    style={styles.photoBadge}
                  />
                )}

                <Text style={[styles.rowValue, styles.receiptAmount, { color: colors.text }]}>
                  {formatCents(receipt.amountCents)}
                </Text>
              </Pressable>
              <DeleteButton receipt={receipt} onPress={confirmDelete} colors={colors} />
            </View>
          ))}
        </Section>
      )}

      <Text style={[styles.disclaimer, { color: colors.text }]}>
        TaxTrack is a record-keeping tool, not tax advice.
      </Text>
    </ScrollView>
  );
}

type Colors = ReturnType<typeof useTheme>['colors'];

function Section({
  title,
  colors,
  children,
}: {
  title: string;
  colors: Colors;
  children: React.ReactNode;
}) {
  return (
    <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
      {children}
    </View>
  );
}

function Row({ label, value, colors }: { label: string; value: string; colors: Colors }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: colors.text }]}>{label}</Text>
      <Text style={[styles.rowValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

/**
 * Visible delete affordance on a receipt row.
 *
 * A discoverable control, not a hidden gesture: nothing on screen can tell a
 * user that a long-press deletes, so they either never find it or trigger it by
 * accident. `hitSlop` keeps the tap target at the ~44pt Apple/Android minimum
 * while the icon itself stays small enough not to compete with the amount.
 */
function DeleteButton({
  receipt,
  onPress,
  colors,
}: {
  receipt: Receipt;
  onPress: (receipt: Receipt) => void;
  colors: Colors;
}) {
  return (
    <Pressable
      onPress={() => onPress(receipt)}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={`Delete receipt from ${receipt.merchant}`}
      style={({ pressed }) => [styles.deleteButton, { opacity: pressed ? 0.5 : 1 }]}>
      <Ionicons name="trash-outline" size={18} color={colors.notification} />
    </Pressable>
  );
}

/** Renders a rate, or the reason it's unavailable — never a stale fallback. */
function RateRow({
  fy,
  rate,
  label,
  colors,
}: {
  fy: number;
  rate: NullableRate;
  label: string;
  colors: Colors;
}) {
  const value = getRate(fy, rate);

  if (value === null) {
    return (
      <View style={styles.unavailable}>
        <Text style={[styles.rowLabel, { color: colors.text }]}>{label}</Text>
        <Text style={[styles.warning, { color: colors.notification }]}>
          {rateUnavailableMessage(fy, rate)}
        </Text>
      </View>
    );
  }

  return <Row label={label} value={`${value}c`} colors={colors} />;
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 16 },
  title: { fontSize: 34, fontWeight: '700' },
  caption: { fontSize: 13, opacity: 0.6, marginTop: -12 },
  section: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    opacity: 0.5,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  receiptRow: { flexDirection: 'row', alignItems: 'center' },
  // The tap target for editing covers everything except the bin, so the two
  // actions can't be confused for one another.
  receiptTap: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingVertical: 2 },
  photoBadge: { opacity: 0.35, marginRight: 8 },
  // flex: 1 lets the merchant name absorb the leftover width, so the amount
  // and bin sit in fixed columns instead of drifting with the name's length.
  receiptText: { flex: 1, gap: 2, paddingRight: 12 },
  // baseline alignment so the date sits on the merchant's text baseline
  // rather than floating in the middle of its larger line box.
  receiptHeading: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  // flexShrink, not flex: the date keeps its natural width and a long merchant
  // name truncates instead of pushing the date off the row.
  merchant: { flexShrink: 1 },
  rowLabel: { fontSize: 15, opacity: 0.7 },
  rowValue: { fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
  // Right-aligned over a fixed width: with tabular figures the decimal points
  // stack, so the column scans as a list of numbers rather than ragged text.
  receiptAmount: { minWidth: 84, textAlign: 'right' },
  deleteButton: { width: 32, alignItems: 'flex-end', paddingVertical: 6 },
  unavailable: { gap: 4 },
  warning: { fontSize: 13, lineHeight: 18 },
  note: { fontSize: 12, opacity: 0.45, lineHeight: 16 },
  // Filled rather than outlined: adding a receipt is the one thing this screen
  // is for, and it should read as the primary action at a glance.
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 10,
    paddingVertical: 13,
    marginTop: 6,
  },
  addLabel: { color: '#fff', fontSize: 15, fontWeight: '700' },
  disclaimer: { fontSize: 12, opacity: 0.5, textAlign: 'center', marginTop: 4 },
});
