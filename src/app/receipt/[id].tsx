/**
 * Add or edit a receipt.
 *
 * One route serves both: `/receipt/new` creates, `/receipt/<id>` edits. The
 * fields and validation are identical, and splitting them into two screens
 * would mean maintaining the same form twice.
 */

import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useTheme } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
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

import { CategoryPicker } from '@/components/CategoryPicker';
import { FormField } from '@/components/FormField';
import { PhotoViewer } from '@/components/PhotoViewer';
import { newId, receiptRepository } from '@/db/receiptRepository';
import { categoryById } from '@/domain/categories';
import { createReceipt } from '@/domain/factories';
import {
  emptyReceiptForm,
  purchaseDateWarning,
  validateReceiptForm,
  type ReceiptFormErrors,
  type ReceiptFormValues,
} from '@/domain/receiptForm';
import type { Receipt } from '@/domain/types';
import { formatDateAu, fyLabel, fyStartYear, parseIsoDate, toIsoDate } from '@/lib/financialYear';
import { centsToInput } from '@/lib/money';
import { deletePhoto, persistPhoto } from '@/lib/photos';

/** A stored `YYYY-MM-DD` as a local `Date`, for the platform date picker. */
function toDate(iso: string): Date {
  const { year, month, day } = parseIsoDate(iso);
  return new Date(year, month - 1, day);
}

export default function ReceiptFormScreen() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';

  // Fixed for the life of the screen so the photo filename is stable even
  // before the row exists.
  const [receiptId] = useState(() => (isNew ? newId() : id));

  const [values, setValues] = useState<ReceiptFormValues>(() =>
    emptyReceiptForm(toIsoDate(new Date())),
  );
  const [errors, setErrors] = useState<ReceiptFormErrors>({});
  const [existing, setExisting] = useState<Receipt | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);

  useEffect(() => {
    if (isNew) return;

    let cancelled = false;

    void (async () => {
      const receipt = await receiptRepository.get(receiptId);

      if (cancelled) return;

      if (receipt === null) {
        Alert.alert('Receipt not found', 'It may have been deleted.', [
          { text: 'OK', onPress: () => router.back() },
        ]);
        return;
      }

      setExisting(receipt);
      setPhotoUri(receipt.photoUri);
      setValues({
        merchant: receipt.merchant,
        amount: centsToInput(receipt.amountCents),
        purchaseDate: receipt.purchaseDate,
        categoryId: receipt.categoryId,
        workUsePercent: String(receipt.workUsePercent),
        notes: receipt.notes ?? '',
      });
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [isNew, receiptId]);

  const update = useCallback(<K extends keyof ReceiptFormValues>(
    key: K,
    value: ReceiptFormValues[K],
  ) => {
    setValues((current) => ({ ...current, [key]: value }));
    // Clear the field's error as soon as it's touched: leaving a stale message
    // under an input the user has just fixed reads as "still wrong".
    setErrors((current) => {
      if (current[key] === undefined) return current;
      const { [key]: _removed, ...rest } = current;
      return rest;
    });
  }, []);

  const category = categoryById(values.categoryId);

  /** The FY this receipt lands in, derived from the date the same way the
   *  repository will derive it. Shown so a 30 June / 1 July date isn't a
   *  surprise at tax time. */
  const financialYear = useMemo(() => {
    try {
      return fyStartYear(values.purchaseDate);
    } catch {
      return null;
    }
  }, [values.purchaseDate]);

  /**
   * A note when the date looks like a typo. The hint above already says which FY
   * the receipt lands in; this says when that year is far enough away to be
   * worth a second look. It never blocks saving — see `purchaseDateWarning`.
   */
  const dateWarning = useMemo(
    () => purchaseDateWarning(values.purchaseDate),
    [values.purchaseDate],
  );

  const pickPhoto = useCallback(async (source: 'camera' | 'library') => {
    const permission =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(
        source === 'camera' ? 'Camera access needed' : 'Photo access needed',
        'TaxTrack needs this to attach a photo of your receipt. You can turn it on in Settings.',
      );
      return;
    }

    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      quality: 0.7,
      allowsEditing: false,
    };

    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);

    if (result.canceled) return;

    // Held as the picker's temporary URI and only copied into permanent
    // storage on save, so abandoning the form leaves no orphaned file.
    setPhotoUri(result.assets[0].uri);
  }, []);

  const save = useCallback(async () => {
    const result = validateReceiptForm(values);

    if (!result.ok) {
      setErrors(result.errors);
      return;
    }

    setSaving(true);

    try {
      const previousPhoto = existing?.photoUri ?? null;
      const photoChanged = photoUri !== previousPhoto;

      // Copied out of the cache directory only now, once the receipt is known
      // to be valid and actually being saved.
      const storedPhoto =
        photoUri === null ? null : photoChanged ? persistPhoto(photoUri, receiptId) : photoUri;

      const receipt: Receipt =
        existing === null
          ? createReceipt({ id: receiptId, ...result.value, photoUri: storedPhoto })
          : {
              ...existing,
              ...result.value,
              financialYear: fyStartYear(result.value.purchaseDate),
              photoUri: storedPhoto,
              updatedAt: new Date().toISOString(),
              syncState: 'pending',
            };

      await receiptRepository.save(receipt);

      if (photoChanged && previousPhoto !== null && previousPhoto !== storedPhoto) {
        deletePhoto(previousPhoto);
      }

      router.back();
    } catch (cause) {
      setSaving(false);
      Alert.alert('Could not save', cause instanceof Error ? cause.message : String(cause));
    }
  }, [existing, photoUri, receiptId, values]);

  const confirmDelete = useCallback(() => {
    Alert.alert('Delete receipt?', `${values.merchant || 'This receipt'} will be removed.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            await receiptRepository.softDelete(receiptId);
            router.back();
          })();
        },
      },
    ]);
  }, [receiptId, values.merchant]);

  const onDateChange = useCallback(
    (event: DateTimePickerEvent, selected?: Date) => {
      // Android's picker is a dialog that dismisses itself; iOS's is inline
      // and stays until the user closes it.
      if (Platform.OS === 'android') setDateOpen(false);
      if (event.type === 'dismissed' || selected === undefined) return;
      update('purchaseDate', toIsoDate(selected));
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
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: isNew ? 'Add receipt' : 'Edit receipt' }} />

      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">
        <FormField label="Who you paid" error={errors.merchant}>
          <TextInput
            value={values.merchant}
            onChangeText={(text) => update('merchant', text)}
            placeholder="Officeworks"
            placeholderTextColor={colors.border}
            autoCapitalize="words"
            style={inputStyle}
          />
        </FormField>

        <FormField label="Amount" error={errors.amount} hint="Total paid, including GST.">
          <TextInput
            value={values.amount}
            onChangeText={(text) => update('amount', text)}
            placeholder="49.95"
            placeholderTextColor={colors.border}
            keyboardType="decimal-pad"
            style={inputStyle}
          />
        </FormField>

        <FormField
          label="Date"
          error={errors.purchaseDate}
          warning={dateWarning ?? undefined}
          hint={
            financialYear === null
              ? undefined
              : `Counts toward the ${fyLabel(financialYear)} financial year.`
          }>
          <Pressable
            onPress={() => setDateOpen((open) => !open)}
            accessibilityRole="button"
            accessibilityLabel={`Date, currently ${formatDateAu(values.purchaseDate)}`}
            style={[...inputStyle, styles.pickerRow]}>
            <Text style={{ color: colors.text }}>{formatDateAu(values.purchaseDate)}</Text>
            <Ionicons name="calendar-outline" size={18} color={colors.text} />
          </Pressable>
        </FormField>

        {dateOpen && (
          <View style={styles.datePicker}>
            <DateTimePicker
              value={toDate(values.purchaseDate)}
              mode="date"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              // A receipt can't be from the future, and a typo of 2027 for 2026
              // would file it in a year the user can't lodge yet.
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

        <FormField label="Category" error={errors.categoryId} hint={category?.examples}>
          <Pressable
            onPress={() => setCategoryOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={`Category, currently ${category?.name ?? 'not chosen'}`}
            style={[...inputStyle, styles.pickerRow]}>
            <Text style={{ color: category === null ? colors.border : colors.text }}>
              {category?.name ?? 'Choose a category'}
            </Text>
            <Ionicons name="chevron-forward" size={18} color={colors.text} />
          </Pressable>
        </FormField>

        <FormField
          label="Work use"
          error={errors.workUsePercent}
          hint="The share you're claiming. Leave at 100% for something bought only for work.">
          <View style={styles.percentRow}>
            <TextInput
              value={values.workUsePercent}
              onChangeText={(text) => update('workUsePercent', text)}
              keyboardType="number-pad"
              maxLength={4}
              style={[...inputStyle, styles.percentInput]}
            />
            <Text style={[styles.percentSign, { color: colors.text }]}>%</Text>
          </View>
        </FormField>

        <FormField label="Photo" hint="A photo of the receipt is your written evidence.">
          {photoUri !== null && (
            <View style={styles.photoWrapper}>
              <Pressable
                onPress={() => setViewerOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="View photo full screen"
                style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
                <Image source={{ uri: photoUri }} style={styles.photo} contentFit="cover" />
                {/* A thumbnail gives no sign it can be opened, so it says so. */}
                <View style={styles.expandBadge}>
                  <Ionicons name="expand-outline" size={14} color="#fff" />
                  <Text style={styles.expandLabel}>Tap to enlarge</Text>
                </View>
              </Pressable>
              <Pressable
                onPress={() => setPhotoUri(null)}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Remove photo"
                style={[styles.removePhoto, { backgroundColor: colors.card }]}>
                <Ionicons name="close" size={18} color={colors.notification} />
              </Pressable>
            </View>
          )}

          <View style={styles.photoButtons}>
            <PhotoButton
              icon="camera-outline"
              label={photoUri === null ? 'Take photo' : 'Retake'}
              onPress={() => void pickPhoto('camera')}
            />
            <PhotoButton
              icon="images-outline"
              label="Choose photo"
              onPress={() => void pickPhoto('library')}
            />
          </View>
        </FormField>

        <FormField label="Notes" hint="Optional. What it was for, if it isn't obvious.">
          <TextInput
            value={values.notes}
            onChangeText={(text) => update('notes', text)}
            placeholder="Printer paper for home office"
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
            <Text style={styles.primaryLabel}>{isNew ? 'Save receipt' : 'Save changes'}</Text>
          )}
        </Pressable>

        {!isNew && (
          <Pressable
            onPress={confirmDelete}
            accessibilityRole="button"
            style={({ pressed }) => [styles.deleteRow, { opacity: pressed ? 0.6 : 1 }]}>
            <Ionicons name="trash-outline" size={18} color={colors.notification} />
            <Text style={{ color: colors.notification, fontWeight: '600' }}>Delete receipt</Text>
          </Pressable>
        )}
      </ScrollView>

      <CategoryPicker
        visible={categoryOpen}
        selectedId={values.categoryId}
        onSelect={(categoryId) => update('categoryId', categoryId)}
        onClose={() => setCategoryOpen(false)}
      />

      <PhotoViewer uri={photoUri} visible={viewerOpen} onClose={() => setViewerOpen(false)} />
    </KeyboardAvoidingView>
  );
}

function PhotoButton({
  icon,
  label,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.photoButton,
        { borderColor: colors.border, backgroundColor: colors.card, opacity: pressed ? 0.6 : 1 },
      ]}>
      <Ionicons name={icon} size={18} color={colors.primary} />
      <Text style={{ color: colors.primary, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 20, gap: 20, paddingBottom: 48 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  pickerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  datePicker: { alignItems: 'center', gap: 8, marginTop: -8 },
  percentRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  percentInput: { width: 90 },
  percentSign: { fontSize: 16, opacity: 0.5 },
  photoWrapper: { alignSelf: 'flex-start' },
  photo: { width: 140, height: 180, borderRadius: 10 },
  expandBadge: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 6,
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  expandLabel: { color: '#fff', fontSize: 11, fontWeight: '600' },
  removePhoto: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoButtons: { flexDirection: 'row', gap: 10, marginTop: 4 },
  photoButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingVertical: 12,
  },
  notesInput: { minHeight: 80, textAlignVertical: 'top' },
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
