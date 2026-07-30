import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

import { FinancialYearProvider } from '@/state/financialYear';

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    // Required ancestor for every gesture in the app — without it, the photo
    // viewer's pinch and pan silently do nothing on Android.
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        {/* Above the navigator so the selected year survives navigating to the
            receipt form and back. */}
        <FinancialYearProvider>
          <Stack>
            {/* The tab group draws its own per-tab headers, so the stack's would
                be a second one stacked on top. */}
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          </Stack>
        </FinancialYearProvider>
        <StatusBar style="auto" />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
