/**
 * The year selector, in the header of every tab.
 *
 * It lives in the header rather than on the dashboard because the year governs
 * what all three tabs show. Having it on one tab only meant someone looking at
 * last year's receipts had to know to go back to the dashboard to change it —
 * an invisible dependency between screens.
 *
 * Self-contained: it owns the sheet, its open state, and loading the years. That
 * way `(tabs)/_layout.tsx` can hand it to every screen as `headerRight` without
 * each screen wiring anything up.
 */

import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { FinancialYearButton, FinancialYearPicker } from '@/components/FinancialYearPicker';
import { receiptRepository, vehicleTripRepository } from '@/db/receiptRepository';
import { financialYearOptions } from '@/domain/receiptList';
import { currentFy } from '@/lib/financialYear';
import { useFinancialYear } from '@/state/financialYear';

export function FinancialYearHeaderControl() {
  const { fy, setFy } = useFinancialYear();

  const [years, setYears] = useState<number[]>([]);
  const [open, setOpen] = useState(false);

  /**
   * Years are loaded when the sheet opens rather than on a focus effect.
   *
   * It's the one moment the list is read, so it can't be stale, and it avoids
   * three headers each re-querying on every tab switch.
   */
  const openPicker = useCallback(() => {
    setOpen(true);

    void (async () => {
      try {
        // Both sources: a year may hold trips but no receipts, or the reverse.
        const [receiptYears, tripYears] = await Promise.all([
          receiptRepository.financialYearsWithReceipts(),
          vehicleTripRepository.financialYearsWithTrips(),
        ]);
        setYears([...receiptYears, ...tripYears]);
      } catch {
        // A failed lookup shouldn't trap the user in the current year: the
        // options fall back to whatever is already known plus the current year.
        setYears([]);
      }
    })();
  }, []);

  return (
    <View style={styles.container}>
      <FinancialYearButton fy={fy} onPress={openPicker} />

      <FinancialYearPicker
        visible={open}
        // currentFy() and the selected year are always present, so the picker can
        // never become a dead end — see financialYearOptions.
        options={financialYearOptions([...years, fy], currentFy())}
        selectedFy={fy}
        onSelect={setFy}
        onClose={() => setOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // Keeps the pill off the screen edge, where the header would otherwise crop it.
  container: { marginRight: 12 },
});
