import { Stack } from 'expo-router';
import { useApp } from '../../../state/AppContext';
import { colors } from '../../../ui/theme';

// Deep links such as /systems/ess (from Live or Diagnose) still get the hub
// underneath, so "back" lands on the Systems overview.
export const unstable_settings = {
  initialRouteName: 'index',
};

export default function SystemsLayout() {
  // Subscribed so the stack background follows a theme switch.
  useApp();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />;
}
