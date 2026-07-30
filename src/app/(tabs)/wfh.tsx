/**
 * Working-from-home calculator: hours × the fixed rate.
 *
 * All arithmetic is in `wfhCalculator.ts` and the rate comes from `atoRates.ts`.
 *
 * The 2026–27 rate is unpublished, so the figure here is computed from a
 * provisional 70c and is labelled as an estimate wherever it appears. That
 * labelling is not cosmetic: it is the only thing standing between a placeholder
 * and a number someone copies onto a return.
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
import { receiptRepository, wfhLogRepository } from '@/db/receiptRepository';
import { categoryName } from '@/domain/receiptList';
import type { CategoryTotal, WfhLog } from '@/domain/types';
import {
  calculateWfhClaim,
  conflictingCategoryIds,
  conflictingCents,
  type WfhCalculation,
} from '@/domain/wfhCalculator';
import { formatHours } from '@/domain/wfhForm';
import { formatDateAu, fyLabel } from '@/lib/financialYear';
import { formatCents } from '@/lib/money';
import { useFinancialYear } from '@/state/financialYear';

type Colors = ReturnType<typeof useTheme>['colors'];

/** Logs grouped under a month heading, so a year of entries stays navigable. */
function monthKey(date: string): string {
  return date.slice(0, 7);
}

function monthLabel(key: string): string {
  const [year, month] = key.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('en-AU', {
    month: 'long',
    year: 'numeric',
  });
}

export default function Wfh() {
  const { colors } = useTheme();
  const { fy } = useFinancialYear();

  const [logs, setLogs] = useState<WfhLog[] | null>(null);
  const [totals, setTotals] = useState<CategoryTotal[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [yearLogs, categoryTotals] = await Promise.all([
        wfhLogRepository.list(fy),
        // For the double-claim check: the fixed rate already covers phone,
        // internet and stationery, so receipts in those categories clash with it.
        receiptRepository.totalsByCategory(fy),
      ]);
      setLogs(yearLogs);
      setTotals(categoryTotals);
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
    () => (logs === null ? null : calculateWfhClaim(logs, fy)),
    [logs, fy],
  );

  const sections = useMemo(() => {
    const byMonth = new Map<string, WfhLog[]>();

    for (const log of logs ?? []) {
      const key = monthKey(log.date);
      const existing = byMonth.get(key);
      if (existing === undefined) byMonth.set(key, [log]);
      else existing.push(log);
    }

    return [...byMonth.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([key, monthLogs]) => ({
        title: monthLabel(key),
        hours: monthLogs.reduce((sum, log) => sum + log.hours, 0),
        data: monthLogs.sort((a, b) => b.date.localeCompare(a.date)),
      }));
  }, [logs]);

  const confirmDelete = useCallback(
    (log: WfhLog) => {
      Alert.alert(
        'Delete log?',
        `${formatDateAu(log.date)} — ${formatHours(log.hours)} will be removed from your ${fyLabel(log.financialYear)} hours.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => {
              void (async () => {
                try {
                  await wfhLogRepository.softDelete(log.id);
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

      {logs === null ? (
        <ActivityIndicator style={styles.loading} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(log) => log.id}
          contentContainerStyle={styles.list}
          stickySectionHeadersEnabled={false}
          ListHeaderComponent={
            <Header fy={fy} calculation={calculation} totals={totals} colors={colors} />
          }
          ListEmptyComponent={<Empty fy={fy} colors={colors} />}
          renderSectionHeader={({ section }) => (
            <View style={styles.monthHeader}>
              <Text style={[styles.monthTitle, { color: colors.text }]}>{section.title}</Text>
              <Text style={[styles.monthHours, { color: colors.text }]}>
                {formatHours(section.hours)}
              </Text>
            </View>
          )}
          renderItem={({ item }) => <LogRow log={item} colors={colors} onDelete={confirmDelete} />}
        />
      )}

      <Pressable
        onPress={() => router.push('/wfh/new')}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.addButton,
          { backgroundColor: colors.primary, opacity: pressed ? 0.7 : 1 },
        ]}>
        <Ionicons name="add" size={20} color="#fff" />
        <Text style={styles.addLabel}>Log hours</Text>
      </Pressable>
    </View>
  );
}

function Header({
  fy,
  calculation,
  totals,
  colors,
}: {
  fy: number;
  calculation: WfhCalculation | null;
  totals: CategoryTotal[];
  colors: Colors;
}) {
  const clashes = conflictingCategoryIds(totals);

  if (calculation === null) {
    return (
      <View
        style={[styles.card, { backgroundColor: colors.card, borderColor: colors.notification }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Fixed rate method</Text>
        <Text style={[styles.warning, { color: colors.notification }]}>
          {rateUnavailableMessage(fy, 'wfhCentsPerHour')}
        </Text>
        <Text style={[styles.note, { color: colors.text }]}>
          Your hours are still saved. The figure will appear once the rate is published.
        </Text>
      </View>
    );
  }

  return (
    <>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>
          {calculation.provisional ? 'Estimate' : 'Claimable'} · {fyLabel(fy)}
        </Text>
        <Text style={[styles.total, { color: colors.text }]}>
          {formatCents(calculation.claimableCents)}
        </Text>
        <Text style={[styles.note, { color: colors.text }]}>
          {formatHours(calculation.totalHours)} across {calculation.dayCount}{' '}
          {calculation.dayCount === 1 ? 'day' : 'days'}, at {calculation.centsPerHour}c per hour.
        </Text>

        {calculation.provisional && (
          <View style={styles.provisionalRow}>
            <Ionicons name="alert-circle" size={15} color={colors.notification} />
            <Text style={[styles.provisional, { color: colors.notification }]}>
              {provisionalRateMessage(fy, 'wfhCentsPerHour')}
            </Text>
          </View>
        )}
      </View>

      {clashes.length > 0 && (
        <View
          style={[styles.card, { backgroundColor: colors.card, borderColor: colors.notification }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Check for double-claiming</Text>
          <Text style={[styles.warning, { color: colors.notification }]}>
            The fixed rate already covers phone, internet, electricity, gas and stationery. You have{' '}
            {formatCents(conflictingCents(totals))} of receipts in{' '}
            {clashes.map((id) => categoryName(id)).join(' and ')}, which can&apos;t be claimed on top
            of it.
          </Text>
          <Text style={[styles.note, { color: colors.text }]}>
            Either keep the fixed rate and remove those receipts, or claim the actual costs instead —
            not both. A desk, chair or computer is different: those aren&apos;t covered by the rate
            and can still be claimed.
          </Text>
        </View>
      )}

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.note, { color: colors.text }]}>
          The ATO needs a record of the hours you actually worked from home across the whole year —
          an estimate or a typical four-week sample isn&apos;t enough any more. This log is that
          record.
        </Text>
      </View>
    </>
  );
}

function LogRow({
  log,
  colors,
  onDelete,
}: {
  log: WfhLog;
  colors: Colors;
  onDelete: (log: WfhLog) => void;
}) {
  return (
    <View style={styles.logRow}>
      <Pressable
        onPress={() => router.push(`/wfh/${log.id}`)}
        accessibilityRole="button"
        accessibilityLabel={`Edit ${formatDateAu(log.date)}, ${formatHours(log.hours)}`}
        style={({ pressed }) => [styles.logTap, { opacity: pressed ? 0.6 : 1 }]}>
        <View style={styles.logText}>
          <Text style={[styles.logDate, { color: colors.text }]}>{formatDateAu(log.date)}</Text>
          {log.notes !== null && (
            <Text style={[styles.note, { color: colors.text }]} numberOfLines={1}>
              {log.notes}
            </Text>
          )}
        </View>
        <Text style={[styles.logHours, { color: colors.text }]}>{formatHours(log.hours)}</Text>
      </Pressable>

      <Pressable
        onPress={() => onDelete(log)}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel={`Delete ${formatDateAu(log.date)}`}
        style={({ pressed }) => [styles.deleteButton, { opacity: pressed ? 0.5 : 1 }]}>
        <Ionicons name="trash-outline" size={18} color={colors.notification} />
      </Pressable>
    </View>
  );
}

function Empty({ fy, colors }: { fy: number; colors: Colors }) {
  return (
    <View style={styles.empty}>
      <Ionicons name="home-outline" size={28} color={colors.text} style={styles.emptyIcon} />
      <Text style={[styles.emptyTitle, { color: colors.text }]}>No hours in {fyLabel(fy)}</Text>
      <Text style={[styles.emptyBody, { color: colors.text }]}>
        Log the hours you work from home and TaxTrack applies the ATO&apos;s fixed rate. It covers
        electricity, gas, phone, internet and stationery in one figure.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  loading: { marginVertical: 40 },
  list: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20 },
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
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
    paddingTop: 14,
    paddingBottom: 6,
  },
  monthTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    opacity: 0.5,
  },
  monthHours: { fontSize: 13, fontWeight: '600', opacity: 0.5, fontVariant: ['tabular-nums'] },
  logRow: { flexDirection: 'row', alignItems: 'center' },
  logTap: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  logText: { flex: 1, gap: 2, paddingRight: 12 },
  logDate: { fontSize: 15, opacity: 0.9 },
  logHours: {
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
