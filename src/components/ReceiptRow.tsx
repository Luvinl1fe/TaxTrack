/**
 * One receipt in a list.
 *
 * Lifted out of the milestone 4 dev screen unchanged in behaviour: tap the row
 * to edit, tap the bin to delete. The bin is a visible control rather than a
 * long-press, because nothing on screen can advertise a hidden gesture — the
 * user either never finds it or triggers it by accident.
 */

import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@react-navigation/native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { categoryName } from '@/domain/receiptList';
import type { Receipt } from '@/domain/types';
import { formatDateAu } from '@/lib/financialYear';
import { formatCents } from '@/lib/money';

export function ReceiptRow({
  receipt,
  onEdit,
  onDelete,
  /** Hidden inside a category group, where the heading already says it. */
  showCategory = true,
}: {
  receipt: Receipt;
  onEdit: (receipt: Receipt) => void;
  onDelete: (receipt: Receipt) => void;
  showCategory?: boolean;
}) {
  const { colors } = useTheme();

  return (
    <View style={styles.row}>
      <Pressable
        onPress={() => onEdit(receipt)}
        accessibilityRole="button"
        accessibilityLabel={`Edit receipt from ${receipt.merchant}, ${formatCents(receipt.amountCents)}`}
        style={({ pressed }) => [styles.tap, { opacity: pressed ? 0.6 : 1 }]}>
        <View style={styles.text}>
          <View style={styles.heading}>
            <Text style={[styles.merchant, { color: colors.text }]} numberOfLines={1}>
              {receipt.merchant}
            </Text>
            <Text style={[styles.note, { color: colors.text }]}>
              {formatDateAu(receipt.purchaseDate)}
            </Text>
          </View>
          <View style={styles.subheading}>
            {showCategory && (
              <Text style={[styles.note, { color: colors.text }]} numberOfLines={1}>
                {categoryName(receipt.categoryId)}
              </Text>
            )}
            {/* Only shown when it isn't 100%: the apportioned figure is what the
                totals use, so a row that reads $120.00 while contributing $72.00
                needs to say why. */}
            {receipt.workUsePercent !== 100 && (
              <Text style={[styles.note, { color: colors.text }]}>
                {receipt.workUsePercent}% work use
              </Text>
            )}
          </View>
        </View>

        {receipt.photoUri !== null && (
          <Ionicons name="image-outline" size={15} color={colors.text} style={styles.photoBadge} />
        )}

        <Text style={[styles.amount, { color: colors.text }]}>
          {formatCents(receipt.amountCents)}
        </Text>
      </Pressable>

      <Pressable
        onPress={() => onDelete(receipt)}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel={`Delete receipt from ${receipt.merchant}`}
        style={({ pressed }) => [styles.deleteButton, { opacity: pressed ? 0.5 : 1 }]}>
        <Ionicons name="trash-outline" size={18} color={colors.notification} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  // The edit target covers everything except the bin, so the two actions can't
  // be confused for one another.
  tap: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  // flex: 1 lets the merchant name absorb the leftover width, so the amount and
  // bin sit in fixed columns instead of drifting with the name's length.
  text: { flex: 1, gap: 2, paddingRight: 12 },
  // baseline alignment so the date sits on the merchant's text baseline rather
  // than floating in the middle of its larger line box.
  heading: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  subheading: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  // flexShrink, not flex: the date keeps its natural width and a long merchant
  // name truncates instead of pushing the date off the row.
  merchant: { fontSize: 15, opacity: 0.9, flexShrink: 1 },
  photoBadge: { opacity: 0.35, marginRight: 8 },
  // Right-aligned over a fixed width: with tabular figures the decimal points
  // stack, so the column scans as a list of numbers rather than ragged text.
  amount: {
    fontSize: 15,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    minWidth: 84,
    textAlign: 'right',
  },
  deleteButton: { width: 32, alignItems: 'flex-end', paddingVertical: 6 },
  note: { fontSize: 12, opacity: 0.45, lineHeight: 16 },
});
