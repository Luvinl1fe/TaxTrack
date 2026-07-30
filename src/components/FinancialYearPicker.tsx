/**
 * Financial year selector.
 *
 * Two parts: a button that always shows the year currently displayed, and the
 * sheet it opens. The button carries a chevron and a border because the year is
 * the one thing on the dashboard that changes what every other number means —
 * it has to read as a control, not a heading.
 *
 * Styled to match `CategoryPicker`, which is the same shape of problem.
 */

import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@react-navigation/native';
import { Modal, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

import { formatDateAu, fyBounds, fyLabel } from '@/lib/financialYear';

type Colors = ReturnType<typeof useTheme>['colors'];

export function FinancialYearButton({ fy, onPress }: { fy: number; onPress: () => void }) {
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Financial year ${fyLabel(fy)}. Tap to change.`}
      style={({ pressed }) => [
        styles.yearButton,
        { borderColor: colors.border, backgroundColor: colors.card, opacity: pressed ? 0.6 : 1 },
      ]}>
      <Text style={[styles.yearLabel, { color: colors.text }]}>{fyLabel(fy)}</Text>
      <Ionicons name="chevron-down" size={18} color={colors.text} style={styles.chevron} />
    </Pressable>
  );
}

export function FinancialYearPicker({
  visible,
  options,
  selectedFy,
  onSelect,
  onClose,
}: {
  visible: boolean;
  options: readonly number[];
  selectedFy: number;
  onSelect: (fy: number) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}>
      <SafeAreaView style={[styles.sheet, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.text }]}>Financial year</Text>
          <Pressable
            onPress={onClose}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close">
            <Ionicons name="close" size={26} color={colors.text} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.list}>
          {options.map((fy) => (
            <YearRow
              key={fy}
              fy={fy}
              selected={fy === selectedFy}
              colors={colors}
              onPress={() => {
                onSelect(fy);
                onClose();
              }}
            />
          ))}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

/**
 * One year in the sheet.
 *
 * Shows the dates the year covers, because "2025–26" is not obviously
 * 1 July 2025 to 30 June 2026 to everyone who files a return.
 */
function YearRow({
  fy,
  selected,
  colors,
  onPress,
}: {
  fy: number;
  selected: boolean;
  colors: Colors;
  onPress: () => void;
}) {
  const bounds = fyBounds(fy);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.row,
        {
          borderColor: selected ? colors.primary : colors.border,
          backgroundColor: colors.card,
          opacity: pressed ? 0.6 : 1,
        },
      ]}>
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, { color: colors.text }]}>{fyLabel(fy)}</Text>
        <Text style={[styles.rowRange, { color: colors.text }]}>
          {formatDateAu(bounds.start)} to {formatDateAu(bounds.end)}
        </Text>
      </View>
      {selected && <Ionicons name="checkmark" size={22} color={colors.primary} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  yearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingVertical: 8,
    paddingLeft: 12,
    paddingRight: 8,
  },
  yearLabel: { fontSize: 17, fontWeight: '700' },
  chevron: { opacity: 0.5 },
  sheet: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 20, fontWeight: '700' },
  list: { padding: 20, gap: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 14,
  },
  rowText: { gap: 2 },
  rowTitle: { fontSize: 16, fontWeight: '600' },
  rowRange: { fontSize: 12, opacity: 0.5 },
});
