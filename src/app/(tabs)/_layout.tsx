/**
 * The app's two destinations.
 *
 * A tab bar rather than a button that pushes a screen: it's permanently visible,
 * so both halves of the app are discoverable without exploring. The user does
 * this once a year and shouldn't have to remember where anything was.
 *
 * Milestones 6–8 add WFH, vehicle and settings tabs alongside these.
 */

import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@react-navigation/native';
import { Tabs } from 'expo-router';

export default function TabsLayout() {
  const { colors } = useTheme();

  return (
    // Only the active tint is overridden. React Navigation's default inactive
    // grey already reads as inactive in both themes; colors.text would be full
    // white in dark mode, making both tabs look selected.
    <Tabs screenOptions={{ tabBarActiveTintColor: colors.primary }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          // The tab says Dashboard; the header is where the app says its name.
          headerTitle: 'TaxTrack',
          // Filled when active, outlined when not — the label alone is a weak
          // signal of which tab you're on.
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'stats-chart' : 'stats-chart-outline'}
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="receipts"
        options={{
          title: 'Receipts',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'receipt' : 'receipt-outline'} size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
