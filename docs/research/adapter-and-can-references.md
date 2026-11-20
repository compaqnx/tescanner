# Adapter and CAN References

## Online documentation

- Scan My Tesla adapter compatibility page:
  - https://www.scanmytesla.com/adapters
  - Confirms vLinker FS Bluetooth as compatible on iOS and Android.
- vLinker FS product listing used by Scan My Tesla community stores:
  - https://sensotech.it/products/obdii-bluetooth-dongle-vgate-for-android-ios-scan-my-tesla-approved-apple-mfi-certified
  - Highlights Apple MFi and Scan My Tesla approval wording.
- ELM327/AT command reference (for adapter initialization and diagnostics):
  - https://www.obdtester.com/elm-usb-commands
- Community DBC source for Tesla Model 3/Y decoding:
  - https://github.com/joshwardell/model3dbc
  - Raw DBC file:
  - https://github.com/joshwardell/model3dbc/raw/refs/heads/master/Model3CAN.dbc
- openDBC Tesla DBC set used for Model S/X profile:
  - https://github.com/commaai/opendbc/tree/master/opendbc/dbc
  - Raw files:
  - https://raw.githubusercontent.com/commaai/opendbc/master/opendbc/dbc/tesla_can.dbc
  - https://raw.githubusercontent.com/commaai/opendbc/master/opendbc/dbc/tesla_powertrain.dbc
- Additional Tesla signal catalogs reviewed for naming/coverage:
  - https://github.com/talas9/tesla_can_signals
  - Google sheet reference (public CSV export works):
  - https://docs.google.com/spreadsheets/d/1UBHw2eY3QyJL3vUz0CnTZ7iLlLB-ao5s61hexT0GuHM/export?format=csv&gid=0

## CAN decode source integrated in this app

- Local DBC imported in project:
  - assets/can/Model3CAN.dbc
  - assets/can/TeslaSx_tesla_can.dbc
  - assets/can/TeslaSx_tesla_powertrain.dbc
- License/provenance files:
  - docs/third_party/model3dbc.LICENSE
  - docs/third_party/model3dbc.README.md
  - docs/third_party/opendbc_LICENSE
  - docs/third_party/opendbc_provenance.txt

## Key decoded signals found in current DBC

From the currently bundled `Model3CAN.dbc`:

- UI_idealRange
  - BO_ 826 ID33AUI_rangeSOC: 8 VehicleBus
  - SG_ UI_idealRange : 16|10@1+ (1,0) [0|1023] "mi"
- DI_vehicleSpeed
  - BO_ 599 ID257DIspeed: 8 VehicleBus
  - SG_ DI_vehicleSpeed : 12|12@1+ (0.08,-40) [-40|285] "kph"
- DI_gear
  - BO_ 280 ID118DriveSystemStatus: 8 VehicleBus
  - SG_ DI_gear : 21|3@1+ (1,0) [0|7] ""
- BMS_nominalFullPackEnergy
  - BO_ 850 ID352BMS_energyStatus: 8 VehicleBus
  - SG_ BMS_nominalFullPackEnergy : 0|11@1+ (0.1,0) [0|204.6] "KWh"
- SystemRegenPowerMax268
  - BO_ 616 ID268SystemPower: 5 VehicleBus
  - SG_ SystemRegenPowerMax268 : 32|8@1+ (1,-100) [-100|155] "kW"

## Naming gaps to account for

Some Scan My Tesla/UI names are not literal matches in this DBC snapshot and need alias mapping in app logic:

- Missing by exact name in this file:
  - BMS_hvPower
  - BMS_packVoltage
  - BMS_packCurrent
  - UI_batteryBar
- Available related candidates include:
  - BMS_chgPowerAvailable
  - BMS_maxDischargePower
  - BMS_maxRegenPower
  - UI_SOC
  - UI_Range

Next implementation step: add a signal alias dictionary so canonical app metrics can be resolved from evolving DBC naming across model years and DBC revisions.

## Model S/X (2015-2021) decoded signal coverage

From `TeslaSx_tesla_can.dbc` and `TeslaSx_tesla_powertrain.dbc`, key decoded fields currently available include:

- DI_vehicleSpeed / ESP_vehicleSpeed / DI_digitalSpeed / DI_analogSpeed
- DI_gear / DI_gearRequest
- DI_regenLight
- DI_cruiseSet / DAS_setSpeed / DAS_locSpeed / DAS_accSpeedLimit
- UI_mapSpeedLimit / UI_mppSpeedLimit / DAS_fusedSpeedLimit / DAS_visionOnlySpeedLimit
- UI_tegraCoreTemperature / UI_tegraAmbientTemperature

Note: the openDBC S/X files above are strong for drivetrain/speed/UI status signals, but do not expose the same rich battery metric namespace (`BMS_*`) found in the Model 3/Y DBC snapshot. The app now supports profile-based alias mapping so additional S/X battery signals can be plugged in as soon as validated DBC/decoded mappings are sourced.

Update: battery, cell and powertrain coverage for legacy S/X now comes from the project-authored `assets/can/TeslaSx_powertrain_battery.dbc` (profile `modelsx_powertrain`). Sources, licensing and fields to verify are in `docs/research/model-sx-can.md`.

## Decoupled CAN data architecture

The app now keeps vehicle-specific CAN concerns in profile metadata instead of screen code:

- `src/lib/config/vehicleProfiles.ts` contains:
  - DBC asset list per profile (`dbcAssets`)
  - Canonical signal alias mapping (`aliases`)
  - Widget metric layout (`dashboardPrimaryMetrics`, `dashboardSecondaryMetrics`)
- `src/lib/dbc/dbcLoader.ts` loads DBC files from profile metadata (not hardcoded maps in multiple places).
- `src/state/useTelemetryController.ts` resolves decoded DBC names to canonical metric names at runtime.

Result: when CAN databases evolve, the usual change path is to update DBC files and profile metadata, while UI/controller flow remains unchanged.
