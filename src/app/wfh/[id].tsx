/**
 * Add or edit a working-from-home log. One route serves both: `/wfh/new` and
 * `/wfh/:id`.
 *
 * Hours are entered per day rather than as one annual figure because the ATO
 * requires a record of the hours *actually worked* from home across the whole
 * year — an estimate or a four-week sample is no longer accepted. This log is
 * that record.
 */

import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useTheme } from '@react-navigation/native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { FormField } from '@/components/FormField';
import { newId, wfhLogRepository } from '@/db/receiptRepository';
import { createWfhLog } from '@/domain/factories';
import type { WfhLog } from '@/domain/types';
import { hoursLoggedOn } from '@/domain/wfhCalculator';
import {
  emptyWfhForm,
  hoursWarning,
  validateWfhForm,
  wfhDateWarning,
  type WfhFormErrors,
  type WfhFormValues,
} from '@/domain/wfhForm';
import { formatDateAu, fyLabel, fyStartYear, parseIsoDate, toIsoDate } from '@/lib/financialYear';

/** A stored `YYYY-MM-DD` as a local `Date`, for the platform date picker. */
function toDate(iso: string): Date {
  const { year, month, day } = parseIsoDate(iso);
  return new Date(year, month - 1, day);
}

/** Common working days, so the usual case is one tap rather than typing. */
const HOUR_PRESETS = ['4', '6', '7.6', '8'];

export default function WfhFormScreen() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';

  const [logId] = useState(() => (isNew ? newId() : id));

  const [values, setValues] = useState<WfhFormValues>(() => emptyWfhForm(toIsoDate(new Date())));
  const [errors, setErrors] = useState<WfhFormErrors>({});
  const [existing, setExisting] = useState<WfhLog | null>(null);
  const [yearLogs, setYearLogs] = useState<WfhLog[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);

  useEffect(() => {
    if (isNew) return;

    let cancelled = false;

    void (async () => {
      const log = await wfhLogRepository.get(logId);
      if (cancelled) return;

      if (log === null) {
        Alert.alert('Log not found', 'It may have been deleted.', [
          { text: 'OK', onPress: () => router.back() },
        ]);
        return;
      }

      setExisting(log);
      setValues({ date: log.date, hours: String(log.hours), notes: log.notes ?? '' });
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [isNew, logId]);

  /** The FY this log lands in, derived the same way the repository will. */
  const financialYear = useMemo(() => {
    try {
      return fyStartYear(values.date);
    } catch {
      return null;
    }
  }, [values.date]);

  // Reloaded whenever the date crosses into another financial year, since that's
  // the scope the duplicate-day check needs.
  useEffect(() => {
    if (financialYear === null) return;

    let cancelled = false;

    void (async () => {
      const logs = await wfhLogRepository.list(financialYear);
      if (!cancelled) setYearLogs(logs);
    })();

    return () => {
      cancelled = true;
    };
  }, [financialYear]);

  const update = useCallback(<K extends keyof WfhFormValues>(key: K, value: WfhFormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (current[key] === undefined) return current;
      const { [key]: _removed, ...rest } = current;
      return rest;
    });
  }, []);

  const dateWarning = useMemo(() => wfhDateWarning(values.date), [values.date]);

  /** Hours already on this date, ignoring the log being edited. */
  const alreadyLogged = useMemo(
    () => hoursLoggedOn(yearLogs, values.date, logId),
    [yearLogs, values.date, logId],
  );

  const hoursNote = useMemo(
    () => hoursWarning(values.hours, alreadyLogged),
    [values.hours, alreadyLogged],
  );

  const save = useCallback(async () => {
    const result = validateWfhForm(values);

    if (!result.ok) {
      setErrors(result.errors);
      return;
    }

    setSaving(true);

    try {
      const log: WfhLog =
        existing === null
          ? createWfhLog({ id: logId, ...result.value })
          : {
              ...existing,
              ...result.value,
              financialYear: fyStartYear(result.value.date),
              updatedAt: new Date().toISOString(),
              syncState: 'pending',
            };

      await wfhLogRepository.save(log);
      router.back();
    } catch (cause) {
      setSaving(false);
      Alert.alert('Could not save', cause instanceof Error ? cause.message : String(cause));
    }
  }, [existing, logId, values]);

  const confirmDelete = useCallback(() => {
    Alert.alert('Delete log?', `${formatDateAu(values.date)} will be removed from your hours.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            await wfhLogRepository.softDelete(logId);
            router.back();
          })();
        },
      },
    ]);
  }, [logId, values.date]);

  const onDateChange = useCallback(
    (event: DateTimePickerEvent, selected?: Date) => {
      if (Platform.OS === 'android') setDateOpen(false);
      if (event.type === 'dismissed' || selected === undefined) return;
      update('date', toIsoDate(selected));
    },
    [update],
  );

  if (loading) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator />
      </View>
    );
  }

  const inputStyle = [
    styles.input,
    { color: colors.text, backgroundColor: colors.card, borderColor: colors.border },
  ];

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: isNew ? 'Log hours' : 'Edit hours' }} />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <FormField
          label="Date"
          error={errors.date}
          warning={dateWarning ?? undefined}
          hint={
            financialYear === null
              ? undefined
              : `Counts toward the ${fyLabel(financialYear)} financial year.`
          }>
          <Pressable
            onPress={() => setDateOpen((open) => !open)}
            accessibilityRole="button"
            accessibilityLabel={`Date, currently ${formatDateAu(values.date)}`}
            style={[...inputStyle, styles.pickerRow]}>
            <Text style={{ color: colors.text }}>{formatDateAu(values.date)}</Text>
            <Ionicons name="calendar-outline" size={18} color={colors.text} />
          </Pressable>
        </FormField>

        {dateOpen && (
          <View style={styles.datePicker}>
            <DateTimePicker
              value={toDate(values.date)}
              mode="date"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              maximumDate={new Date()}
              onChange={onDateChange}
            />
            {Platform.OS === 'ios' && (
              <Pressable
                onPress={() => setDateOpen(false)}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  { borderColor: colors.border, opacity: pressed ? 0.6 : 1 },
                ]}>
                <Text style={{ color: colors.primary, fontWeight: '600' }}>Done</Text>
              </Pressable>
            )}
          </View>
        )}

        <FormField
          label="Hours worked from home"
          error={errors.hours}
          warning={hoursNote ?? undefined}
          hint="Decimal hours — 7.5, not 7:30. Only the hours you actually worked.">
          <View style={styles.hoursRow}>
            <TextInput
              value={values.hours}
              onChangeText={(text) => update('hours', text)}
              placeholder="7.5"
              placeholderTextColor={colors.border}
              keyboardType="decimal-pad"
              style={[...inputStyle, styles.hoursInput]}
            />
            <Text style={[styles.hoursUnit, { color: colors.text }]}>hours</Text>
          </View>
        </FormField>

        <View style={styles.presets}>
          {HOUR_PRESETS.map((preset) => (
            <Pressable
              key={preset}
              onPress={() => update('hours', preset)}
              accessibilityRole="button"
              accessibilityLabel={`${preset} hours`}
              style={({ pressed }) => [
                styles.preset,
                {
                  borderColor: values.hours === preset ? colors.primary : colors.border,
                  backgroundColor: colors.card,
                  opacity: pressed ? 0.6 : 1,
                },
              ]}>
              <Text
                style={{
                  color: values.hours === preset ? colors.primary : colors.text,
                  fontSize: 13,
                }}>
                {preset}
              </Text>
            </Pressable>
          ))}
        </View>

        <FormField label="Notes" hint="Optional.">
          <TextInput
            value={values.notes}
            onChangeText={(text) => update('notes', text)}
            placeholder="Worked from the spare room"
            placeholderTextColor={colors.border}
            multiline
            style={[...inputStyle, styles.notesInput]}
          />
        </FormField>

        <Pressable
          onPress={() => void save()}
          disabled={saving}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.primaryButton,
            { backgroundColor: colors.primary, opacity: pressed || saving ? 0.6 : 1 },
          ]}>
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryLabel}>{isNew ? 'Save hours' : 'Save changes'}</Text>
          )}
        </Pressable>

        {!isNew && (
          <Pressable
            onPress={confirmDelete}
            accessibilityRole="button"
            style={({ pressed }) => [styles.deleteRow, { opacity: pressed ? 0.6 : 1 }]}>
            <Ionicons name="trash-outline" size={18} color={colors.notification} />
            <Text style={{ color: colors.notification, fontWeight: '600' }}>Delete log</Text>
          </Pressable>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 20, gap: 18 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
  },
  pickerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  datePicker: { alignItems: 'center', gap: 8, marginTop: -8 },
  hoursRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hoursInput: { width: 110 },
  hoursUnit: { fontSize: 16, opacity: 0.5 },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: -12 },
  preset: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  notesInput: { minHeight: 70, textAlignVertical: 'top' },
  primaryButton: {
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    marginTop: 4,
  },
  primaryLabel: { color: '#fff', fontSize: 16, fontWeight: '700' },
  secondaryButton: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  deleteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
  },
});
