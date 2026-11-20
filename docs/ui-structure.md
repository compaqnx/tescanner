# UI structure

The app is organised around the six architectural systems of an electric vehicle, with
navigation built for in-car use: bottom tabs within thumb reach, 48 dp touch targets, large
glanceable numbers, and one always-visible connection bar holding the next action
(find adapter → start → stop).

Routes use Expo Router (`src/app/`). Non-route code lives in `src/state`, `src/ui` and `src/lib`.

## Navigation map

```
(tabs)
├── Live            src/app/(tabs)/index.tsx         glance dashboard while driving
├── Systems         src/app/(tabs)/systems/          Stack
│   ├── index       hub: six EV system cards with KPIs, coverage and stream state
│   ├── [systemId]  ess | propulsion | power | charging | thermal | control
│   ├── cells       cell map / bars / HV internals (from the BMS subsystem)
│   └── performance acceleration test 0–50 / 0–60 mph / 0–100 (from Vehicle motion)
├── Record          src/app/(tabs)/record.tsx        start/stop recording, sessions, CSV export
├── Diagnose        src/app/(tabs)/diagnostics.tsx   alerts · events · raw CAN · console · explorer
└── Setup           src/app/(tabs)/setup.tsx         adapter · vehicle · data stream · language · capabilities
```

The connection bar (`ConnectionBar` in `src/ui/components.tsx`) sits under every screen header.

## Where the old screens went

| Old drawer screen | New location |
| --- | --- |
| Dashboard | **Live** (hero, KPIs, alerts and system tiles) |
| HV Battery | **Systems → Energy Storage → BMS → Cell map** |
| Signals (watched + explorer) | Watched values now appear inside their system; explorer is **Diagnose → Explorer** |
| Adapter | **Setup → Adapter**, with Start/Stop in the connection bar |
| Console + raw CAN | **Diagnose → Console** and **Diagnose → Raw CAN** |
| Errors | **Diagnose → Events**, plus threshold **Alerts** |
| Settings | **Setup** (vehicle, data stream, language) |

## EV systems → subsystems

Defined in `src/lib/systems/systemCatalog.ts`. Each signal lists candidate DBC names (the
first one present wins), so one catalog serves the Model 3/Y profile and both S/X profiles (see `docs/research/model-sx-can.md`).

| # | System | Subsystems |
| --- | --- | --- |
| 1 | Energy Storage | HV pack · Energy & capacity · BMS (cells, temps) · Contactors, fuses & isolation · Lifetime counters |
| 2 | Propulsion & Drivetrain | Vehicle motion · Traction motors · Power limits · Regenerative braking · Axles & wheels |
| 3 | Power Electronics | Traction inverters · Inverter & stator temps · DC-DC converter · HV distribution (PDU) |
| 4 | Charging | Charge session · Charge port & inlet · On-board charger (AC) · DC fast charging |
| 5 | Thermal Management | Battery cooling & heating · Powertrain cooling · Cabin HVAC & heat pump |
| 6 | Control & Low-Voltage | Vehicle control unit · 12 V / 16 V battery · Electrified chassis · TPMS |

## Read / calculate / write

As with Scan My Tesla, the app only **listens** to the CAN bus.

- **READ**: values broadcast on the bus and decoded with the DBC.
- **CALC**: derived in the app (pack power, cell imbalance, capacity vs. beginning-of-life,
  equivalent cycles, lifetime Wh/km, DC power, acceleration times).
- **WRITE**: not supported for the vehicle. The Diagnose console sends AT/ST commands to the
  OBD adapter only.

Every signal row shows a READ or CALC badge. Warning thresholds (`warnLow` / `warnHigh` in
the catalog) drive the Alerts list and the red highlights.

## Streaming scope

`describePollTargets` tags every CAN id with the systems that use it. By default only the
core and HV ids are polled, which keeps the refresh cycle short. On each system screen,
**Stream only this system** restarts the stream with just that system's ids. In
**Setup → Data stream** you can toggle whole systems or single ids.

## Not yet implemented

- Replay of recorded sessions. Sessions are recorded and exported to CSV, but cannot be
  played back into the UI yet.
- Editable dashboards, and charts of values over time.
