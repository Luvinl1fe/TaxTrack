import { useTheme } from '@react-navigation/native';
import { StyleSheet, Text, View } from 'react-native';

export default function Index() {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.text }]}>TaxTrack</Text>
      <Text style={[styles.subtitle, { color: colors.text }]}>
        Scaffold is running. Next up: the financial-year module.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 8,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 15,
    opacity: 0.6,
    textAlign: 'center',
  },
});
