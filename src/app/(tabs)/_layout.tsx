import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useApp } from '../../state/AppContext';
import type { IconName } from '../../ui/icons';
import { colors, fonts } from '../../ui/theme';

function tabIcon(name: IconName) {
  function TabIcon({ color, size }: { color: string; size: number }) {
    return <MaterialCommunityIcons name={name} size={size} color={color} />;
  }
  return TabIcon;
}

/**
 * Bottom tabs keep the five jobs of a scanner within thumb reach:
 * Live (glance while driving) · Systems (drill into the six EV systems) ·
 * Record (logging & export) · Diagnose (alerts, raw CAN, console) · Setup.
 */
export default function TabsLayout() {
  const { t, alerts, storedErrors } = useApp();
  const diagBadge = alerts.length + storedErrors.length;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.neon,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, minHeight: 60 },
        tabBarLabelStyle: { fontFamily: fonts.heading, fontSize: 12 },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t('tabLive'), tabBarIcon: tabIcon('speedometer') }} />
      <Tabs.Screen name="systems" options={{ title: t('tabSystems'), tabBarIcon: tabIcon('car-cog') }} />
      <Tabs.Screen name="record" options={{ title: t('tabRecord'), tabBarIcon: tabIcon('record-rec') }} />
      <Tabs.Screen
        name="diagnostics"
        options={{
          title: t('tabDiagnostics'),
          tabBarIcon: tabIcon('stethoscope'),
          tabBarBadge: diagBadge > 0 ? diagBadge : undefined,
        }}
      />
      <Tabs.Screen name="setup" options={{ title: t('tabSetup'), tabBarIcon: tabIcon('cog-outline') }} />
    </Tabs>
  );
}
