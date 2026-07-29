/**
 * A labelled form row.
 *
 * The label is always visible rather than a placeholder that vanishes on first
 * keystroke: once someone has typed, a placeholder-only form gives them no way
 * to check what a field was asking for.
 */

import { useTheme } from '@react-navigation/native';
import { StyleSheet, Text, View } from 'react-native';

export function FormField({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  /** Shown under the input. Explains a field the user may not know. */
  hint?: string;
  /** Replaces the hint when present, so the two never compete for attention. */
  error?: string;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();

  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      {children}
      {error !== undefined ? (
        <Text style={[styles.error, { color: colors.notification }]}>{error}</Text>
      ) : hint !== undefined ? (
        <Text style={[styles.hint, { color: colors.text }]}>{hint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  label: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    opacity: 0.5,
  },
  hint: { fontSize: 12, opacity: 0.45, lineHeight: 16 },
  error: { fontSize: 12, lineHeight: 16 },
});
