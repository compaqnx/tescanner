import { Stack } from 'expo-router';
import { colors } from '../../../ui/theme';

// Deep links such as /systems/ess (from Live or Diagnose) still get the hub
// underneath, so "back" lands on the Systems overview.
export const unstable_settings = {
  initialRouteName: 'index',
};

export default function SystemsLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />;
}
