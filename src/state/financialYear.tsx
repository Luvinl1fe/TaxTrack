/**
 * The financial year the whole app is currently showing.
 *
 * Shared state rather than per-screen: the year is chosen on the dashboard and
 * the receipt list has to honour it. Tabs are siblings, so there's nothing to
 * pass a prop through.
 *
 * Deliberately not persisted. Reopening the app lands on the current year,
 * which is what someone adding today's receipt expects; a remembered 2023–24
 * would silently file new entries out of sight.
 */

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

import { currentFy } from '@/lib/financialYear';

interface FinancialYearContextValue {
  fy: number;
  setFy: (fy: number) => void;
}

const FinancialYearContext = createContext<FinancialYearContextValue | null>(null);

export function FinancialYearProvider({ children }: { children: ReactNode }) {
  // Read once at mount, not on every render: the device's date crossing 30 June
  // mid-session shouldn't move the year out from under the user.
  const [fy, setFy] = useState(() => currentFy());

  const value = useMemo(() => ({ fy, setFy }), [fy]);

  return <FinancialYearContext.Provider value={value}>{children}</FinancialYearContext.Provider>;
}

export function useFinancialYear(): FinancialYearContextValue {
  const value = useContext(FinancialYearContext);
  if (value === null) {
    throw new Error('useFinancialYear must be used inside a FinancialYearProvider');
  }
  return value;
}
