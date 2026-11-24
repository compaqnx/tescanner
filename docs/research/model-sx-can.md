# Model S/X CAN support

## Profiles

| Profile | Bus | DBC files | Covers |
| --- | --- | --- | --- |
| `modelsx_powertrain` – *battery & powertrain* | Legacy S/X powertrain bus (500 kbit/s, the bus the Scan My Tesla S/X harness taps) | `TeslaSx_powertrain_battery.dbc` (this project) + openDBC `tesla_powertrain.dbc` | Pack V/A/SoC, energy, 96 cell voltages + 32 module temps, power limits, lifetime kWh (total / AC / DC), battery odometer, rear/front drive unit power, torque, losses, temperatures, DC-DC, coolant temps, pumps, cabin/outside temps, rated/typical range |
| `modelsx_2015_2021` – *chassis & driver assist* | Legacy S/X chassis bus | openDBC `tesla_can.dbc` + `tesla_powertrain.dbc` | Speed, gear, cruise, speed limits, autopilot status, MCU temps |

The profiles are separate because the same CAN ids mean different things on each bus. For
example, `0x318` carries temperatures on the powertrain bus but `GTW_carState` on the chassis
bus. Merging the two would decode garbage.

2021+ (Palladium) S/X are not covered. They use a Model 3-like architecture, but no open,
verified mapping was found.

## Where `TeslaSx_powertrain_battery.dbc` comes from

No permissively licensed S/X battery or powertrain DBC exists. The file was written for this
project with its own signal names (`SX_` prefix), from bit layouts documented publicly in:

| Source | License | Used as |
| --- | --- | --- |
| [amund7/CANBUS-Analyzer](https://github.com/amund7/CANBUS-Analyzer) `ModelSPackets.cs` (Scan My Tesla's open-source ancestor; credits WK057) | none stated | Reference for bit layouts |
| [dalathegreat/Battery-Emulator](https://github.com/dalathegreat/Battery-Emulator) `TESLA-LEGACY-BATTERY.cpp` | GPL-3.0 | Cross-check (0x102, 0x332, 0x3D2, 0x6F2) |
| [joshwardell/model3dbc](https://github.com/joshwardell/model3dbc) | MIT | Cross-check of shared ids (0x3D2 order) |
| [Scan My Tesla signal sheet](https://docs.google.com/spreadsheets/d/1UBHw2eY3QyJL3vUz0CnTZ7iLlLB-ao5s61hexT0GuHM/edit) | none stated | Id/ECU index only |

No code or comments were copied. `talas9/tesla_can_signals` was deliberately **not** used,
because its README says the data was extracted from Tesla firmware.

> Licensing note: bit positions are facts, but the upstream sources are unlicensed or GPL.
> Whoever owns this project's licensing should approve shipping this file.

## Message map (powertrain bus)

| Id | Message | Signals |
| --- | --- | --- |
| 0x102 | BMS_hvBusStatus | `SX_packVoltage`, `SX_packCurrent` |
| 0x116 | DI_torque2 (merged with openDBC) | `SX_vehicleSpeedKph` (openDBC reports MPH) |
| 0x154 / 0x1D4 | RDI / FDI torque | `SX_rearTorqueMeasured`, `SX_frontTorqueMeasured`, `SX_wattPedal` |
| 0x210 | DCDC_status | output current/voltage, input power, coolant inlet |
| 0x212 | BMS_status | `SX_hvilStatus`, `SX_contactorState`, `SX_bmsState` |
| 0x232 | BMS_powerLimits | max regen / discharge power |
| 0x266 / 0x2E5 | RDI / FDI power | mech power, losses, stator current, drive power max, rear regen max, rear 12 V |
| 0x26A | THC_batteryHeater | heater temp, request, state |
| 0x302 | BMS_socStatus | SoC min / UI; mux 0 = DC charge total, mux 1 = AC charge total |
| 0x306 | RDI_temps | inverter, PCB, stator, DC cap, heatsink, coolant inlet, thermal load % |
| 0x318 / 0x31A | THC temps | outside, inside, A/C air, battery inlet, powertrain inlet |
| 0x32A | THC_pumps | battery pumps 1/2, powertrain pumps |
| 0x332 | BMS_brickMinMax | brick voltage min/max, module temp min/max |
| 0x338 | UI_range | rated / typical range (km) |
| 0x382 | BMS_energyStatus | nominal full, nominal/expected/ideal remaining, to full, buffer |
| 0x3D2 | BMS_kwhCounters | total discharge / charge |
| 0x562 | BMS_odometer | battery odometer (km) |
| 0x6F2 | BMS_brickData | mux 0–23 → `Brick0`–`Brick95`; mux 24–31 → `SX_moduleTemp1`–`32` |

## Verify on a real car before trusting

- **0x102 current** — *verified, 2018 Model X (parked, 2026-11-23 export)*: signed 16-bit
  × −0.1, no offset (Battery-Emulator's form). Raw `0xFFF3` → +1.3 A discharge at 309 V. The
  `1000 − signed15 × 0.1` form read ~1001 A at rest. Still confirm the sign under
  acceleration (positive) and regen (negative).
- **0x382 energy** — *verified, same export*: 11-bit fields like the Model 3 `0x352`
  (full 0|11, nominal 11|11, expected 22|11, ideal 33|11, to-full 44|11, buffer 55|8).
  Nominal remaining / full = 29.4 / 63.3 = 46.4 % = UI SoC. The 10-bit layout read
  58.8 kWh remaining at 46 % SoC.
- **0x6F2 bricks**: raw `0x3FFF` (4.997 V) marks an unpopulated slot (SNA). The verified car
  sends mux 0–20 (slots 0–83, the last one SNA) and temperature mux 24–30 (28 sensors).
- **0x318 temperatures**: bytes 0–2 read `0xFD` (SNA) on the parked car; only the A/C air
  temperature (byte 4) was valid.
- **0x302 lifetime counters**: mux 0 = 6913 kWh, mux 1 = 49 801 kWh (labelled DC and AC
  here). Not yet cross-checked against the car's own totals.
- **0x3D2 order**: discharge in bytes 0–3 follows the Model 3 DBC and Battery-Emulator;
  Scan My Tesla labels bytes 0–3 as charge. On a used car, discharge should be the larger
  value.
- **0x302 bits 0–9**: labelled SoC min here; Battery-Emulator calls them UI SoC.
- **0x266 / 0x2E5 drive power max**: field is spread across two bytes; confirm against the
  car's rated power.
- **0x318 / 0x338**: ids reused on the chassis bus. Only trust them with the powertrain
  harness.
