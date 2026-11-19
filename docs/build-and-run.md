# Build and Run Guide

This project is an Expo React Native app that uses Bluetooth Low Energy (`react-native-ble-plx`), so you must run it in a development build (not plain Expo Go).

## 1) Prerequisites

- macOS with Xcode (for iOS simulator/device builds)
- Android Studio (for Android emulator/device builds)
- Node.js 20+
- npm 10+
- Expo CLI available via `npx`
- A BLE OBD adapter (vGate vLinker FS Bluetooth)

## 2) Install dependencies

From the project root:

```bash
npm install
```

If npm reports peer dependency conflicts, retry with:

```bash
npm install --legacy-peer-deps
```

## 3) Verify project health

Run typecheck and lint before building:

```bash
npx tsc --noEmit
npx expo lint
npx expo-doctor
```

## 4) Build a development client

Because BLE uses native code, build a development client.

### iOS (local)

```bash
npx expo run:ios
```

### Android (local)

```bash
npx expo run:android
```

### Cloud build with EAS (optional)

If you prefer cloud builds:

```bash
npx eas-cli@latest build --profile development --platform ios
npx eas-cli@latest build --profile development --platform android
```

Install the resulting build on your phone.

## 5) Start Metro and launch app

```bash
npx expo start
```

Then open the app in your development build:

- iOS: open the installed dev client and connect to Metro
- Android: open the installed dev client and connect to Metro

## 6) Connect to vLinker FS and stream

In the app:

1. Select vehicle profile:
   - Model 3 / Y
   - Model S / X (2015-2021)
2. Tap Scan Adapters
3. Connect to your vLinker FS device
4. Tap Start Live Stream
5. Watch decoded signals and export CSV when needed

Tip: keep profile switching to idle state (not while connected/streaming).

## 7) Troubleshooting

- No BLE devices found:
  - Confirm adapter is powered and not connected to another phone.
  - Grant Bluetooth permissions when prompted.
  - Toggle phone Bluetooth off/on.
- Connect fails:
  - Re-scan and reconnect.
  - Fully close the app and reopen the development build.
- No decoded signals:
  - Ensure the correct vehicle profile is selected.
  - Verify CAN traffic is active (vehicle ON and adapter seated).
- iOS build issues:
  - Run `npx expo prebuild --clean` then `npx expo run:ios`.
- Android build issues:
  - Run `npx expo prebuild --clean` then `npx expo run:android`.

## 8) Production builds

For release binaries, use EAS:

```bash
npx eas-cli@latest build --platform ios
npx eas-cli@latest build --platform android
```

For over-the-air JS updates:

```bash
npx eas-cli@latest update
```

## 9) Updating CAN databases with minimal app changes

The app is profile-driven. To switch to a newer CAN database revision:

1. Drop new DBC files in `assets/can/`.
2. Update the target profile in `src/lib/config/vehicleProfiles.ts`:
  - `dbcAssets`: point to new file modules.
  - `aliases`: update canonical-to-DBC signal names only when names changed.
  - `dashboardPrimaryMetrics` / `dashboardSecondaryMetrics`: tune widget layout.

No UI tab code or controller flow changes are required for typical DBC refreshes.
