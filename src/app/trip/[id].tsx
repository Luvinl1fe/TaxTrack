/**
 * Add or edit a vehicle trip. One route serves both: `/trip/new` and `/trip/:id`.
 *
 * Modelled on the receipt form, including keeping validation in a pure module
 * (`tripForm.ts`) so the screen only holds strings and renders messages.
 *
 * The car is picked from the cars already logged wherever possible, rather than
 * retyped. Labels are matched exactly when the 5,000 km cap is applied, so
 * 'Hilux' and 'hilux' would be two cars with two caps and an overstated claim.
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
import { newId, vehicleTripRepository } from '@/db/receiptRepository';
import { createVehicleTrip } from '@/domain/factories';
import {
  emptyTripForm,
  similarVehicleLabel,
  tripDateWarning,
  validateTripForm,
  type TripFormErrors,
  type TripFormValues,
} from '@/domain/tripForm';
import type { VehicleTrip } from '@/domain/types';
import { formatDateAu, fyLabel, fyStartYear, parseIsoDate, toIsoDate } from '@/lib/financialYear';

/** A stored `YYYY-MM-DD` as a local `Date`, for the platform date picker. */
function toDate(iso: string): Date {
  const { year, month, day } = parseIsoDate(iso);
  return new Date(year, month - 1, day);
}

export default function TripFormScreen() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';

  const [tripId] = useState(() => (isNew ? newId() : id));

  const [values, setValues] = useState<TripFormValues>(() => emptyTripForm(toIsoDate(new Date())));
  const [errors, setErrors] = useState<TripFormErrors>({});
  const [existing, setExisting] = useState<VehicleTrip | null>(null);
  const [knownLabels, setKnownLabels] = useState<string[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      // Loaded for both new and existing trips: on a new one it prefills the car,
      // on an existing one it still powers the duplicate-label check.
      const labels = await vehicleTripRepository.vehicleLabels();
      if (cancelled) return;
      setKnownLabels(labels);

      if (isNew) {
        // The next trip is usually in the same car as the last one.
        if (labels.length > 0) {
          setValues((current) =>
            current.vehicleLabel === '' ? { ...current, vehicleLabel: labels[0] } : current,
          );
        }
        return;
      }

      const trip = await vehicleTripRepository.get(tripId);
      if (cancelled) return;

      if (trip === null) {
        Alert.alert('Trip not found', 'It may have been deleted.', [
          { text: 'OK', onPress: () => router.back() },
        ]);
        return;
      }

      setExisting(trip);
      setValues({
        date: trip.date,
        kilometres: String(trip.kilometres),
        purpose: trip.purpose,
        vehicleLabel: trip.vehicleLabel,
      });
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [isNew, tripId]);

  const update = useCallback(<K extends keyof TripFormValues>(key: K, value: TripFormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    // Clear the field's error as soon as it's touched: a stale message under an
    // input the user has just fixed reads as "still wrong".
    setErrors((current) => {
      if (current[key] === undefined) return current;
      const { [key]: _removed, ...rest } = current;
      return rest;
    });
  }, []);

  /** The FY this trip lands in, derived the same way the repository will. */
  const financialYear = useMemo(() => {
    try {
      return fyStartYear(values.date);
    } catch {
      return null;
    }
  }, [values.date]);

  const dateWarning = useMemo(() => tripDateWarning(values.date), [values.date]);

  /** An existing car whose label differs only by case or spacing. */
  const nearDuplicate = useMemo(
    () => similarVehicleLabel(values.vehicleLabel, knownLabels),
    [values.vehicleLabel, knownLabels],
  );

  const save = useCallback(async () => {
    const result = validateTripForm(values);

    if (!result.ok) {
      setErrors(result.errors);
      return;
    }

    setSaving(true);

    try {
      const trip: VehicleTrip =
        existing === null
          ? createVehicleTrip({ id: tripId, ...result.value })
          : {
              ...existing,
              ...result.value,
              financialYear: fyStartYear(result.value.date),
              updatedAt: new Date().toISOString(),
              syncState: 'pending',
            };

      await vehicleTripRepository.save(trip);
      router.back();
    } catch (cause) {
      setSaving(false);
      Alert.alert('Could not save', cause instanceof Error ? cause.message : String(cause));
    }
  }, [existing, tripId, values]);

  const confirmDelete = useCallback(() => {
    Alert.alert(
      'Delete trip?',
      `${values.kilometres || 'This'} km${values.purpose ? ` — ${values.purpose}` : ''} will be removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              await vehicleTripRepository.softDelete(tripId);
              router.back();
            })();
          },
        },
      ],
    );
  }, [tripId, values.kilometres, values.purpose]);

  const onDateChange = useCallback(
    (event: DateTimePickerEvent, selected?: Date) => {
      // Android's picker is a dialog that dismisses itself; iOS's is inline and
      // stays until the user closes it.
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
      <Stack.Screen options={{ title: isNew ? 'Add trip' : 'Edit trip' }} />

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
              // A trip can't be in the future.
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
          label="Distance"
          error={errors.kilometres}
          hint="Work-related kilometres for this trip.">
          <View style={styles.kmRow}>
            <TextInput
              value={values.kilometres}
              onChangeText={(text) => update('kilometres', text)}
              placeholder="12.5"
              placeholderTextColor={colors.border}
              keyboardType="decimal-pad"
              style={[...inputStyle, styles.kmInput]}
            />
            <Text style={[styles.kmUnit, { color: colors.text }]}>km</Text>
          </View>
        </FormField>

        <FormField
          label="Purpose"
          error={errors.purpose}
          hint="Why the trip was work-related. Required — this is the record of how the claim was worked out.">
          <TextInput
            value={values.purpose}
            onChangeText={(text) => update('purpose', text)}
            placeholder="Client site visit — Fremantle"
            placeholderTextColor={colors.border}
            style={inputStyle}
          />
        </FormField>

        <FormField
          label="Car"
          error={errors.vehicleLabel}
          warning={
            nearDuplicate === null
              ? undefined
              : `You've already logged "${nearDuplicate}". Use the same name, or this counts as a second car with its own 5,000 km cap.`
          }
          hint="Each car gets its own 5,000 km cap, so the name has to match between trips.">
          <TextInput
            value={values.vehicleLabel}
            onChangeText={(text) => update('vehicleLabel', text)}
            placeholder="Hilux"
            placeholderTextColor={colors.border}
            autoCapitalize="words"
            style={inputStyle}
          />
        </FormField>

        {knownLabels.length > 0 && (
          <View style={styles.labelChips}>
            {nearDuplicate !== null && (
              <Chip
                label={`Use "${nearDuplicate}"`}
                highlighted
                onPress={() => update('vehicleLabel', nearDuplicate)}
              />
            )}
            {knownLabels
              .filter((label) => label !== values.vehicleLabel && label !== nearDuplicate)
              .map((label) => (
                <Chip key={label} label={label} onPress={() => update('vehicleLabel', label)} />
              ))}
          </View>
        )}

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
            <Text style={styles.primaryLabel}>{isNew ? 'Save trip' : 'Save changes'}</Text>
          )}
        </Pressable>

        {!isNew && (
          <Pressable
            onPress={confirmDelete}
            accessibilityRole="button"
            style={({ pressed }) => [styles.deleteRow, { opacity: pressed ? 0.6 : 1 }]}>
            <Ionicons name="trash-outline" size={18} color={colors.notification} />
            <Text style={{ color: colors.notification, fontWeight: '600' }}>Delete trip</Text>
          </Pressable>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/**
 * A tappable existing car name.
 *
 * Picking beats typing here: the label has to match exactly for two trips to
 * share a cap, and a chip can't be misspelled.
 */
function Chip({
  label,
  highlighted = false,
  onPress,
}: {
  label: string;
  highlighted?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Use car ${label}`}
      style={({ pressed }) => [
        styles.chip,
        {
          borderColor: highlighted ? colors.notification : colors.border,
          backgroundColor: colors.card,
          opacity: pressed ? 0.6 : 1,
        },
      ]}>
      <Text style={{ color: highlighted ? colors.notification : colors.text, fontSize: 13 }}>
        {label}
      </Text>
    </Pressable>
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
  kmRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  kmInput: { width: 120 },
  kmUnit: { fontSize: 16, opacity: 0.5 },
  labelChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: -10 },
  chip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
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
