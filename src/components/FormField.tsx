/**
 * A labelled form row.
 *
 * The label is always visible rather than a placeholder that vanishes on first
 * keystroke: once someone has typed, a placeholder-only form gives them no way
 * to check what a field was asking for.
 */

import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@react-navigation/native';
import { StyleSheet, Text, View } from 'react-native';

export function FormField({
  label,
  hint,
  warning,
  error,
  children,
}: {
  label: string;
  /** Shown under the input. Explains a field the user may not know. */
  hint?: string;
  /**
   * A value that's allowed but looks like a slip. Outranks the hint, ranks below
   * an error, and never prevents submitting — the field is still valid.
   *
   * Rendered in the same red as an error, with an outline icon to tell them
   * apart. If the two ever need to be distinguishable at a glance, this is the
   * thing to change.
   */
  warning?: string;
  /** Outranks both, so the three never compete for attention. */
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
      ) : warning !== undefined ? (
        // Red, as asked for. It shares the error's colour, so the outline icon is
        // the only thing distinguishing "have a look at this" from "you can't
        // save" — the field is still valid and still submits.
        <View style={styles.warningRow}>
          <Ionicons name="alert-circle-outline" size={13} color={colors.notification} />
          <Text style={[styles.warning, { color: colors.notification }]}>{warning}</Text>
        </View>
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
  // Icon aligned to the first line rather than centred, so a message that wraps
  // to two lines doesn't push the icon into the gap between them.
  warningRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 4 },
  // Full opacity so the red reads as red rather than washed out.
  warning: { flex: 1, fontSize: 12, lineHeight: 16 },
});
