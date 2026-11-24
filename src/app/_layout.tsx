import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider, useApp } from '../state/AppContext';
import { colors } from '../ui/theme';

/** Subscribes to the app context so a theme switch repaints the navigator chrome. */
function ThemedStack() {
  const { colorScheme } = useApp();

  return (
    <>
      <StatusBar style={colorScheme === 'light' ? 'dark' : 'light'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Screen name="(tabs)" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <ThemedStack />
      </AppProvider>
    </SafeAreaProvider>
  );
}
