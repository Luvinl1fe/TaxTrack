/**
 * Receipt list: every receipt in the selected year, searchable, grouped by
 * category.
 *
 * The search box sits above the list rather than scrolling with it — a filter you
 * have to scroll back up to reach doesn't get used. Grouping and searching are
 * both `receiptList.ts`, so the behaviour is tested without a renderer.
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
  TextInput,
  View,
} from 'react-native';

import { ReceiptRow } from '@/components/ReceiptRow';
import { receiptRepository } from '@/db/receiptRepository';
import { groupByCategory, searchReceipts, totalClaimedCents } from '@/domain/receiptList';
import type { Receipt } from '@/domain/types';
import { fyLabel } from '@/lib/financialYear';
import { formatCents } from '@/lib/money';
import { useFinancialYear } from '@/state/financialYear';

type Colors = ReturnType<typeof useTheme>['colors'];

export default function Receipts() {
  const { colors } = useTheme();
  const { fy } = useFinancialYear();

  const [receipts, setReceipts] = useState<Receipt[] | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setReceipts(await receiptRepository.list(fy));
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

  const matches = useMemo(
    () => (receipts === null ? [] : searchReceipts(receipts, query)),
    [receipts, query],
  );

  const sections = useMemo(
    () =>
      groupByCategory(matches).map((group) => ({
        title: group.categoryName,
        totalCents: group.totalCents,
        data: group.receipts,
      })),
    [matches],
  );

  // Deleting is irreversible from the user's point of view, so it asks first —
  // and the prompt names the receipt rather than saying "this item".
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

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <SearchField query={query} onChange={setQuery} colors={colors} />

      {error !== null && (
        <Text style={[styles.error, { color: colors.notification }]}>{error}</Text>
      )}

      {receipts === null ? (
        <ActivityIndicator style={styles.loading} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(receipt) => receipt.id}
          contentContainerStyle={styles.list}
          // So tapping a receipt while the keyboard is open opens it, rather than
          // being swallowed by the keyboard dismissing.
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          stickySectionHeadersEnabled
          ListHeaderComponent={
            <Summary
              fy={fy}
              shown={matches.length}
              total={receipts.length}
              claimedCents={totalClaimedCents(matches)}
              colors={colors}
            />
          }
          ListEmptyComponent={
            <Empty fy={fy} searching={query.trim().length > 0} colors={colors} />
          }
          renderSectionHeader={({ section }) => (
            <View style={[styles.sectionHeader, { backgroundColor: colors.background }]}>
              <Text style={[styles.sectionTitle, { color: colors.text }]} numberOfLines={1}>
                {section.title}
              </Text>
              <Text style={[styles.sectionTotal, { color: colors.text }]}>
                {formatCents(section.totalCents)}
              </Text>
            </View>
          )}
          renderItem={({ item }) => (
            <ReceiptRow
              receipt={item}
              // Category is already the group heading above the row.
              showCategory={false}
              onEdit={(receipt) => router.push(`/receipt/${receipt.id}`)}
              onDelete={confirmDelete}
            />
          )}
        />
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
    </View>
  );
}

/**
 * The search box.
 *
 * Carries its own clear button rather than relying on iOS's `clearButtonMode`,
 * so Android gets one too — otherwise clearing a search means holding backspace.
 */
function SearchField({
  query,
  onChange,
  colors,
}: {
  query: string;
  onChange: (query: string) => void;
  colors: Colors;
}) {
  return (
    <View style={[styles.search, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Ionicons name="search" size={17} color={colors.text} style={styles.searchIcon} />
      <TextInput
        value={query}
        onChangeText={onChange}
        placeholder="Search merchant, category or amount"
        placeholderTextColor={colors.border}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        accessibilityLabel="Search receipts"
        style={[styles.searchInput, { color: colors.text }]}
      />
      {query.length > 0 && (
        <Pressable
          onPress={() => onChange('')}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Clear search">
          <Ionicons name="close-circle" size={18} color={colors.text} style={styles.clearIcon} />
        </Pressable>
      )}
    </View>
  );
}

function Summary({
  fy,
  shown,
  total,
  claimedCents,
  colors,
}: {
  fy: number;
  shown: number;
  total: number;
  claimedCents: number;
  colors: Colors;
}) {
  // While searching, say what's hidden — a count that silently shrank looks like
  // missing data.
  const label =
    shown === total
      ? `${total} ${total === 1 ? 'receipt' : 'receipts'} in ${fyLabel(fy)}`
      : `${shown} of ${total} receipts in ${fyLabel(fy)}`;

  return (
    <View style={styles.summary}>
      <Text style={[styles.summaryText, { color: colors.text }]}>{label}</Text>
      <Text style={[styles.summaryTotal, { color: colors.text }]}>{formatCents(claimedCents)}</Text>
    </View>
  );
}

function Empty({
  fy,
  searching,
  colors,
}: {
  fy: number;
  searching: boolean;
  colors: Colors;
}) {
  return (
    <View style={styles.empty}>
      <Ionicons
        name={searching ? 'search' : 'receipt-outline'}
        size={28}
        color={colors.text}
        style={styles.emptyIcon}
      />
      <Text style={[styles.emptyTitle, { color: colors.text }]}>
        {searching ? 'No matches' : `No receipts in ${fyLabel(fy)}`}
      </Text>
      <Text style={[styles.emptyBody, { color: colors.text }]}>
        {searching
          ? 'Try a shorter search, or part of the merchant name.'
          : 'Receipts you add will be grouped here by category.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginTop: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 10,
  },
  searchIcon: { opacity: 0.4, marginRight: 6 },
  // 44 tall so the tap target reaches the platform minimum without the text
  // sitting cramped against the border.
  searchInput: { flex: 1, height: 44, fontSize: 15 },
  clearIcon: { opacity: 0.4 },
  loading: { marginVertical: 40 },
  list: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 20 },
  summary: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  summaryText: { fontSize: 13, opacity: 0.5 },
  summaryTotal: { fontSize: 13, opacity: 0.5, fontVariant: ['tabular-nums'] },
  // Opaque background: these headers stick, and transparent ones would let rows
  // scroll visibly underneath the text.
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
    paddingTop: 14,
    paddingBottom: 6,
  },
  sectionTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    opacity: 0.5,
  },
  sectionTotal: {
    fontSize: 13,
    fontWeight: '600',
    opacity: 0.5,
    fontVariant: ['tabular-nums'],
  },
  empty: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 20, gap: 6 },
  emptyIcon: { opacity: 0.3, marginBottom: 4 },
  emptyTitle: { fontSize: 17, fontWeight: '600' },
  emptyBody: { fontSize: 14, opacity: 0.5, textAlign: 'center', lineHeight: 20 },
  error: { fontSize: 13, lineHeight: 18, paddingHorizontal: 20, paddingTop: 10 },
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
