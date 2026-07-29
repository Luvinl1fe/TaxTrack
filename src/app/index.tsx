import { useTheme } from '@react-navigation/native';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  getRate,
  rateUnavailableMessage,
  ratesForFy,
  type NullableRate,
} from '@/config/atoRates';
import { currentFy, fyBounds, fyLabel, toIsoDate } from '@/lib/financialYear';

/**
 * Temporary development screen.
 *
 * Exists to confirm the financial-year and rates modules behave on a real
 * device — under Hermes, in the device's own timezone — rather than only in
 * Node under Jest. Milestone 4 replaces this with the real receipt list.
 */
export default function Index() {
  const { colors } = useTheme();

  const today = toIsoDate(new Date());
  const fy = currentFy();
  const bounds = fyBounds(fy);
  const rates = ratesForFy(fy);

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}>
      <Text style={[styles.title, { color: colors.text }]}>{fyLabel(fy)}</Text>
      <Text style={[styles.caption, { color: colors.text }]}>
        Today is {today} on this device
      </Text>

      <Section title="Financial year" colors={colors}>
        <Row label="Starts" value={bounds.start} colors={colors} />
        <Row label="Ends" value={bounds.end} colors={colors} />
        <Row label="FY start year" value={String(fy)} colors={colors} />
      </Section>

      <Section title="ATO rates" colors={colors}>
        {rates === null ? (
          <Text style={[styles.warning, { color: colors.notification }]}>
            No rates on file for {fyLabel(fy)}.
          </Text>
        ) : (
          <>
            <RateRow fy={fy} rate="centsPerKm" label="Cents per km" colors={colors} />
            <Row
              label="Km cap per car"
              value={rates.kmCapPerCar.toLocaleString('en-AU')}
              colors={colors}
            />
            <RateRow fy={fy} rate="wfhCentsPerHour" label="WFH per hour" colors={colors} />
            <Row
              label="Evidence threshold"
              value={formatCents(rates.noReceiptThresholdCents)}
              colors={colors}
            />
          </>
        )}
      </Section>

      <Text style={[styles.disclaimer, { color: colors.text }]}>
        TaxTrack is a record-keeping tool, not tax advice.
      </Text>
    </ScrollView>
  );
}

type Colors = ReturnType<typeof useTheme>['colors'];

function Section({
  title,
  colors,
  children,
}: {
  title: string;
  colors: Colors;
  children: React.ReactNode;
}) {
  return (
    <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
      {children}
    </View>
  );
}

function Row({ label, value, colors }: { label: string; value: string; colors: Colors }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: colors.text }]}>{label}</Text>
      <Text style={[styles.rowValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

/** Renders a rate, or the reason it's unavailable — never a stale fallback. */
function RateRow({
  fy,
  rate,
  label,
  colors,
}: {
  fy: number;
  rate: NullableRate;
  label: string;
  colors: Colors;
}) {
  const value = getRate(fy, rate);

  if (value === null) {
    return (
      <View style={styles.unavailable}>
        <Text style={[styles.rowLabel, { color: colors.text }]}>{label}</Text>
        <Text style={[styles.warning, { color: colors.notification }]}>
          {rateUnavailableMessage(fy, rate)}
        </Text>
      </View>
    );
  }

  return <Row label={label} value={`${value}c`} colors={colors} />;
}

/** Temporary. A proper money module lands with the receipt screens. */
function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-AU', { minimumFractionDigits: 2 })}`;
}

const styles = StyleSheet.create({
  content: {
    padding: 20,
    gap: 16,
  },
  title: {
    fontSize: 34,
    fontWeight: '700',
  },
  caption: {
    fontSize: 13,
    opacity: 0.6,
    marginTop: -12,
  },
  section: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    opacity: 0.5,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  rowLabel: {
    fontSize: 15,
    opacity: 0.7,
  },
  rowValue: {
    fontSize: 15,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  unavailable: {
    gap: 4,
  },
  warning: {
    fontSize: 13,
    lineHeight: 18,
  },
  disclaimer: {
    fontSize: 12,
    opacity: 0.5,
    textAlign: 'center',
    marginTop: 4,
  },
});
