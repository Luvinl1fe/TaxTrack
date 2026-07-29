/**
 * Category chooser.
 *
 * A full-screen list rather than a native dropdown. There are twelve options
 * and most users won't know the difference between "Tools & equipment" and
 * "Stationery" by name alone, so each row carries its examples and its myTax
 * label — the same code they'll see on their return.
 */

import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@react-navigation/native';
import { Modal, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ACTIVE_CATEGORIES, type Category } from '@/domain/categories';

/** Categories entered as receipts. WFH hours and vehicle trips have their own
 *  screens, so offering them here would produce an entry nothing can total. */
export const RECEIPT_CATEGORIES: readonly Category[] = ACTIVE_CATEGORIES.filter(
  (category) => category.entryKind === 'receipt',
);

export function CategoryPicker({
  visible,
  selectedId,
  onSelect,
  onClose,
}: {
  visible: boolean;
  selectedId: string;
  onSelect: (categoryId: string) => void;
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
          <Text style={[styles.title, { color: colors.text }]}>Category</Text>
          <Pressable
            onPress={onClose}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close">
            <Ionicons name="close" size={26} color={colors.text} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.list}>
          {RECEIPT_CATEGORIES.map((category) => {
            const selected = category.id === selectedId;

            return (
              <Pressable
                key={category.id}
                onPress={() => {
                  onSelect(category.id);
                  onClose();
                }}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={({ pressed }) => [
                  styles.option,
                  {
                    borderColor: selected ? colors.primary : colors.border,
                    backgroundColor: colors.card,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}>
                <View style={styles.optionText}>
                  <Text style={[styles.optionName, { color: colors.text }]}>{category.name}</Text>
                  <Text style={[styles.optionExamples, { color: colors.text }]}>
                    {category.examples}
                  </Text>
                </View>

                <View style={styles.optionTrailing}>
                  <Text style={[styles.label, { color: colors.text }]}>{category.myTaxLabel}</Text>
                  {selected && <Ionicons name="checkmark" size={20} color={colors.primary} />}
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 20, fontWeight: '700' },
  list: { padding: 20, gap: 10 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  optionText: { flex: 1, gap: 3 },
  optionName: { fontSize: 16, fontWeight: '600' },
  optionExamples: { fontSize: 12, opacity: 0.5, lineHeight: 16 },
  optionTrailing: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { fontSize: 12, fontWeight: '700', opacity: 0.4, letterSpacing: 0.5 },
});
