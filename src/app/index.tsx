import { useTheme } from '@react-navigation/native';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { getRate, rateUnavailableMessage, ratesForFy, type NullableRate } from '@/config/atoRates';
import { newId, receiptRepository } from '@/db/receiptRepository';
import { ACTIVE_CATEGORIES, categoryById } from '@/domain/categories';
import { createReceipt } from '@/domain/factories';
import { substantiationMessage, substantiationStatus } from '@/domain/substantiation';
import type { CategoryTotal, Receipt } from '@/domain/types';
import { currentFy, fyBounds, fyLabel, toIsoDate } from '@/lib/financialYear';

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

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addSample = useCallback(async () => {
    // Rotates through categories so category totals have something to show.
    const category = ACTIVE_CATEGORIES.filter((c) => c.entryKind === 'receipt')[
      Math.floor(Math.random() * ACTIVE_CATEGORIES.filter((c) => c.entryKind === 'receipt').length)
    ];

    try {
      await receiptRepository.save(
        createReceipt({
          id: newId(),
          merchant: SAMPLE_MERCHANTS[Math.floor(Math.random() * SAMPLE_MERCHANTS.length)],
          amountCents: Math.floor(Math.random() * 15_000) + 500,
          purchaseDate: toIsoDate(new Date()),
          categoryId: category.id,
        }),
      );
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [refresh]);

  const removeReceipt = useCallback(
    async (id: string) => {
      await receiptRepository.softDelete(id);
      await refresh();
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
        {bounds.start} to {bounds.end}
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
              onPress={addSample}
              style={({ pressed }) => [
                styles.button,
                { borderColor: colors.border, opacity: pressed ? 0.6 : 1 },
              ]}>
              <Text style={[styles.buttonLabel, { color: colors.primary }]}>Add sample receipt</Text>
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
            <Pressable
              key={receipt.id}
              onLongPress={() => void removeReceipt(receipt.id)}
              style={styles.row}>
              <View style={styles.receiptText}>
                <Text style={[styles.rowLabel, { color: colors.text }]}>{receipt.merchant}</Text>
                <Text style={[styles.note, { color: colors.text }]}>
                  {categoryById(receipt.categoryId)?.name ?? receipt.categoryId} ·{' '}
                  {receipt.purchaseDate}
                </Text>
              </View>
              <Text style={[styles.rowValue, { color: colors.text }]}>
                {formatCents(receipt.amountCents)}
              </Text>
            </Pressable>
          ))}
          <Text style={[styles.note, { color: colors.text }]}>Long-press a receipt to delete it.</Text>
        </Section>
      )}

      <Text style={[styles.disclaimer, { color: colors.text }]}>
        TaxTrack is a record-keeping tool, not tax advice.
      </Text>
    </ScrollView>
  );
}

const SAMPLE_MERCHANTS = ['Officeworks', 'Bunnings', 'JB Hi-Fi', 'Telstra', 'Kmart'];

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

/** Temporary. A proper money module lands with the receipt screens. */
function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-AU', { minimumFractionDigits: 2 })}`;
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
  receiptText: { flexShrink: 1, gap: 2 },
  rowLabel: { fontSize: 15, opacity: 0.7 },
  rowValue: { fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
  unavailable: { gap: 4 },
  warning: { fontSize: 13, lineHeight: 18 },
  note: { fontSize: 12, opacity: 0.45, lineHeight: 16 },
  button: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonLabel: { fontSize: 15, fontWeight: '600' },
  disclaimer: { fontSize: 12, opacity: 0.5, textAlign: 'center', marginTop: 4 },
});
