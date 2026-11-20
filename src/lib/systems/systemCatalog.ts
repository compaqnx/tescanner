/**
 * EV system catalog.
 *
 * Organises every decodable signal into the six architectural systems of an
 * electric vehicle (energy storage, propulsion, power electronics, charging,
 * thermal, control/low-voltage), each split into subsystems. Screens render from
 * this catalog; the poll planner uses it to know which CAN ids each system needs.
 *
 * Access model (same as Scan My Tesla): the app is a passive CAN listener.
 *   - 'read'  = value broadcast on the CAN bus, decoded from the DBC.
 *   - 'calc'  = derived in the app from read values (no extra bus traffic).
 * Nothing here is written to the vehicle. The only "write" path in the app is
 * the ELM327 console, which configures the adapter itself, not the car.
 */

import type { IconName } from '../../ui/icons';

export type SystemId = 'ess' | 'propulsion' | 'power' | 'charging' | 'thermal' | 'control';
export type SignalAccess = 'read' | 'calc';
export type SignalKind = 'number' | 'state';

export interface Label {
  en: string;
  ro: string;
}

export type SignalGetter = (names: string[]) => number | null;

export interface SignalSpec {
  id: string;
  label: Label;
  /** Candidate DBC / canonical signal names, first match wins. */
  names: string[];
  unit?: string;
  digits?: number;
  /** 'state' shows the DBC enum text instead of a number. */
  kind?: SignalKind;
  access?: SignalAccess;
  /** For 'calc' signals: computes the value from other signals. */
  calc?: (get: SignalGetter) => number | null;
  /** Warn when outside [low, high]. */
  warnLow?: number;
  warnHigh?: number;
}

export interface SubsystemSpec {
  id: string;
  title: Label;
  description: Label;
  icon: IconName;
  signals: SignalSpec[];
  /** Optional drill-down route with a richer visualisation. */
  detailRoute?: string;
  detailLabel?: Label;
}

export interface SystemSpec {
  id: SystemId;
  index: number;
  title: Label;
  short: Label;
  description: Label;
  icon: IconName;
  accent: string;
  /** Signal ids (from this system) shown as headline KPIs. */
  kpis: string[];
  subsystems: SubsystemSpec[];
}

const L = (en: string, ro: string): Label => ({ en, ro });

const sum = (...values: Array<number | null>): number | null => {
  const present = values.filter((v): v is number => v !== null && Number.isFinite(v));
  return present.length === 0 ? null : present.reduce((a, b) => a + b, 0);
};

export const SYSTEMS: SystemSpec[] = [
  {
    id: 'ess',
    index: 1,
    title: L('Energy Storage', 'Stocare energie'),
    short: L('Battery', 'Baterie'),
    description: L(
      'High-voltage pack, BMS cell monitoring, contactors and isolation.',
      'Pachet de inalta tensiune, monitorizare celule BMS, contactori si izolatie.',
    ),
    icon: 'car-battery',
    accent: '#C7FF19',
    kpis: ['soc', 'packVoltage', 'packPower', 'cellDelta'],
    subsystems: [
      {
        id: 'pack',
        title: L('High-voltage pack', 'Pachet HV'),
        description: L('Pack voltage, current, power and state of charge.', 'Tensiune, curent, putere si stare de incarcare.'),
        icon: 'battery-high',
        signals: [
          { id: 'soc', label: L('State of charge (UI)', 'Stare incarcare (UI)'), names: ['batterySocUi', 'SOCUI292', 'UI_SOC', 'BMS_uiSoC'], unit: '%', digits: 1, warnLow: 10 },
          { id: 'socReal', label: L('State of charge (real)', 'Stare incarcare (reala)'), names: ['batterySocReal', 'SOCave292', 'BMS_realSoC'], unit: '%', digits: 1 },
          { id: 'socMinMax', label: L('SoC min / max spread', 'Diferenta SoC min / max'), names: [], unit: '%', digits: 2, access: 'calc', calc: (g) => { const a = g(['SOCmax292']); const b = g(['SOCmin292']); return a !== null && b !== null ? a - b : null; } },
          { id: 'packVoltage', label: L('Pack voltage', 'Tensiune pachet'), names: ['packVoltage', 'BattVoltage132', 'BMS_packVoltage', 'HVP_dcLinkVoltageFiltered'], unit: 'V', digits: 1 },
          { id: 'packCurrent', label: L('Pack current', 'Curent pachet'), names: ['SmoothBattCurrent132', 'packCurrent', 'RawBattCurrent132', 'BMS_packCurrent'], unit: 'A', digits: 1 },
          { id: 'packPower', label: L('Pack power', 'Putere pachet'), names: [], unit: 'kW', digits: 1, access: 'calc', calc: (g) => { const v = g(['packVoltage', 'BattVoltage132', 'BMS_packVoltage']); const a = g(['SmoothBattCurrent132', 'packCurrent', 'RawBattCurrent132']); return v !== null && a !== null ? (v * a) / 1000 : null; } },
          { id: 'idealRange', label: L('Ideal range', 'Autonomie ideala'), names: ['idealRange', 'UI_idealRange'], unit: 'km', digits: 0 },
          { id: 'ratedRange', label: L('Rated range', 'Autonomie estimata'), names: ['UI_Range', 'SX_ratedRange'], unit: 'km', digits: 0 },
        ],
      },
      {
        id: 'energy',
        title: L('Energy & capacity', 'Energie si capacitate'),
        description: L('BMS energy counters and capacity estimate.', 'Contoare de energie BMS si estimare capacitate.'),
        icon: 'battery-heart-variant',
        signals: [
          { id: 'nominalFull', label: L('Nominal full pack', 'Pachet plin nominal'), names: ['nominalFullPackEnergy', 'BMS_nominalFullPackEnergy'], unit: 'kWh', digits: 1 },
          { id: 'nominalRemaining', label: L('Nominal remaining', 'Energie ramasa nominala'), names: ['BMS_nominalEnergyRemaining', 'SX_nominalEnergyRemaining'], unit: 'kWh', digits: 1 },
          { id: 'expectedRemaining', label: L('Expected remaining', 'Energie ramasa estimata'), names: ['BMS_expectedEnergyRemaining', 'SX_expectedEnergyRemaining'], unit: 'kWh', digits: 1 },
          { id: 'energyBuffer', label: L('Energy buffer', 'Rezerva energie'), names: ['BMS_energyBuffer', 'SX_energyBuffer'], unit: 'kWh', digits: 1 },
          { id: 'toChargeComplete', label: L('Energy to full', 'Energie pana la plin'), names: ['BMS_energyToChargeComplete', 'SX_energyToChargeComplete'], unit: 'kWh', digits: 1 },
          { id: 'bolEnergy', label: L('Beginning-of-life energy', 'Energie la inceput de viata'), names: ['BattBeginningOfLifeEnergy292'], unit: 'kWh', digits: 1 },
          { id: 'capacityPct', label: L('Capacity vs. new (estimate)', 'Capacitate fata de nou (estimare)'), names: [], unit: '%', digits: 1, access: 'calc', calc: (g) => { const n = g(['nominalFullPackEnergy', 'BMS_nominalFullPackEnergy']); const b = g(['BattBeginningOfLifeEnergy292']); return n !== null && b !== null && b > 0 ? (n / b) * 100 : null; } },
        ],
      },
      {
        id: 'bms',
        title: L('Battery management (BMS)', 'Management baterie (BMS)'),
        description: L('Cell voltage extremes, balance and pack temperatures.', 'Extreme tensiune celule, echilibrare si temperaturi pachet.'),
        icon: 'chip',
        detailRoute: '/systems/cells',
        detailLabel: L('Open cell map', 'Deschide harta celulelor'),
        signals: [
          { id: 'cellMin', label: L('Min cell voltage', 'Tensiune minima celula'), names: ['BattBrickVoltageMin332', 'minBrickVoltage', 'BMS_minBrickVoltage'], unit: 'V', digits: 3, warnLow: 3.0 },
          { id: 'cellMax', label: L('Max cell voltage', 'Tensiune maxima celula'), names: ['BattBrickVoltageMax332', 'maxBrickVoltage', 'BMS_maxBrickVoltage'], unit: 'V', digits: 3, warnHigh: 4.21 },
          { id: 'cellDelta', label: L('Cell imbalance', 'Dezechilibru celule'), names: [], unit: 'mV', digits: 0, access: 'calc', warnHigh: 30, calc: (g) => { const a = g(['BattBrickVoltageMax332', 'maxBrickVoltage']); const b = g(['BattBrickVoltageMin332', 'minBrickVoltage']); return a !== null && b !== null ? (a - b) * 1000 : null; } },
          { id: 'cellMinNum', label: L('Lowest cell #', 'Celula cea mai joasa #'), names: ['BattBrickVoltageMinNum332'], digits: 0 },
          { id: 'cellMaxNum', label: L('Highest cell #', 'Celula cea mai inalta #'), names: ['BattBrickVoltageMaxNum332'], digits: 0 },
          { id: 'brickTempMin', label: L('Min module temp', 'Temp. minima modul'), names: ['BattBrickTempMin332', 'BMSminPackTemperature', 'SX_moduleTempMin'], unit: '°C', digits: 1 },
          { id: 'brickTempMax', label: L('Max module temp', 'Temp. maxima modul'), names: ['BattBrickTempMax332', 'BMSmaxPackTemperature', 'SX_moduleTempMax'], unit: '°C', digits: 1, warnHigh: 50 },
          { id: 'avgBrickTemp', label: L('Average module temp', 'Temp. medie modul'), names: ['avgBrickTemp', 'BMS_avgBrickTemp'], unit: '°C', digits: 1 },
          { id: 'bmsState', label: L('BMS state', 'Stare BMS'), names: ['BMS_state', 'SX_bmsState'], kind: 'state' },
          { id: 'bmsHvState', label: L('HV state', 'Stare HV'), names: ['BMS_hvState'], kind: 'state' },
        ],
      },
      {
        id: 'contactors',
        title: L('Contactors, fuses & isolation', 'Contactori, sigurante si izolatie'),
        description: L('HV disconnect state, interlock loop and isolation resistance.', 'Starea deconectarii HV, bucla de interblocare si rezistenta de izolatie.'),
        icon: 'electric-switch',
        signals: [
          { id: 'packContactor', label: L('Pack contactors', 'Contactori pachet'), names: ['HVP_packContactorSetState', 'BMS_contactorState', 'SX_contactorState'], kind: 'state' },
          { id: 'packContPos', label: L('Pack + contactor', 'Contactor pachet +'), names: ['HVP_packContPositiveState'], kind: 'state' },
          { id: 'packContNeg', label: L('Pack − contactor', 'Contactor pachet −'), names: ['HVP_packContNegativeState'], kind: 'state' },
          { id: 'hvil', label: L('HV interlock (HVIL)', 'Interblocare HV (HVIL)'), names: ['HVP_hvilStatus', 'SX_hvilStatus'], kind: 'state' },
          { id: 'isolation', label: L('Isolation resistance', 'Rezistenta izolatie'), names: ['BMS_isolationResistance'], unit: 'kΩ', digits: 0, warnLow: 500 },
          { id: 'maxDischarge', label: L('Max discharge power', 'Putere maxima descarcare'), names: ['BMS_maxDischargePower', 'SX_maxDischargePower'], unit: 'kW', digits: 0 },
          { id: 'maxRegen', label: L('Max regen power', 'Putere maxima regenerare'), names: ['maxRegenPower', 'BMS_maxRegenPower'], unit: 'kW', digits: 0 },
        ],
      },
      {
        id: 'lifetime',
        title: L('Lifetime counters', 'Contoare pe durata de viata'),
        description: L('Total energy in and out of the pack since new.', 'Energie totala intrata si iesita din pachet de la nou.'),
        icon: 'counter',
        signals: [
          { id: 'totalCharge', label: L('Total charged', 'Total incarcat'), names: ['TotalChargeKWh3D2', 'SX_totalCharge'], unit: 'kWh', digits: 0 },
          { id: 'totalDischarge', label: L('Total discharged', 'Total descarcat'), names: ['TotalDischargeKWh3D2', 'SX_totalDischarge'], unit: 'kWh', digits: 0 },
          { id: 'acChargeTotal', label: L('Total AC charged', 'Total incarcat AC'), names: ['SX_acChargeTotal'], unit: 'kWh', digits: 0 },
          { id: 'dcChargeTotal', label: L('Total DC (Supercharger) charged', 'Total incarcat DC (Supercharger)'), names: ['SX_dcChargeTotal'], unit: 'kWh', digits: 0 },
          { id: 'cycles', label: L('Equivalent full cycles', 'Cicluri complete echivalente'), names: [], digits: 0, access: 'calc', calc: (g) => { const c = g(['TotalChargeKWh3D2', 'SX_totalCharge']); const n = g(['nominalFullPackEnergy', 'BMS_nominalFullPackEnergy']); return c !== null && n !== null && n > 0 ? c / n : null; } },
          { id: 'odometer', label: L('Odometer', 'Kilometraj'), names: ['Odometer3B6', 'UI_odometer', 'SX_batteryOdometer'], unit: 'km', digits: 0 },
          { id: 'lifetimeWhKm', label: L('Lifetime consumption', 'Consum pe durata de viata'), names: [], unit: 'Wh/km', digits: 0, access: 'calc', calc: (g) => { const d = g(['TotalDischargeKWh3D2', 'SX_totalDischarge']); const o = g(['Odometer3B6', 'UI_odometer', 'SX_batteryOdometer']); return d !== null && o !== null && o > 0 ? (d * 1000) / o : null; } },
        ],
      },
    ],
  },
  {
    id: 'propulsion',
    index: 2,
    title: L('Propulsion & Drivetrain', 'Propulsie si transmisie'),
    short: L('Drive', 'Propulsie'),
    description: L(
      'Traction motors, single-speed gearbox, axles and regenerative braking.',
      'Motoare de tractiune, reductor, axe si franare regenerativa.',
    ),
    icon: 'engine-outline',
    accent: '#67B7FF',
    kpis: ['speed', 'drivePower', 'rearTorque', 'gear'],
    subsystems: [
      {
        id: 'motion',
        title: L('Vehicle motion', 'Miscare vehicul'),
        description: L('Speed, gear and pedal inputs.', 'Viteza, treapta si pedale.'),
        icon: 'speedometer',
        detailRoute: '/systems/performance',
        detailLabel: L('Acceleration test', 'Test accelerare'),
        signals: [
          { id: 'speed', label: L('Vehicle speed', 'Viteza vehicul'), names: ['vehicleSpeed', 'DI_vehicleSpeed', 'ESP_vehicleSpeed'], unit: 'km/h', digits: 0 },
          { id: 'gear', label: L('Gear', 'Treapta'), names: ['gear', 'DI_gear'], kind: 'state' },
          { id: 'accelPedal', label: L('Accelerator pedal', 'Pedala acceleratie'), names: ['DI_accelPedalPos', 'DI_pedalPos'], unit: '%', digits: 0 },
          { id: 'brakePedal', label: L('Brake pedal', 'Pedala frana'), names: ['DI_brakePedalState', 'DI_brakePedal'], kind: 'state' },
          { id: 'driveState', label: L('Drive system state', 'Stare sistem propulsie'), names: ['DI_systemState'], kind: 'state' },
          { id: 'tractionMode', label: L('Traction control mode', 'Mod control tractiune'), names: ['DI_tractionControlMode'], kind: 'state' },
        ],
      },
      {
        id: 'motors',
        title: L('Traction motors', 'Motoare de tractiune'),
        description: L('Front and rear drive unit output.', 'Puterea unitatilor de propulsie fata si spate.'),
        icon: 'engine',
        signals: [
          { id: 'drivePower', label: L('Total drive power', 'Putere totala propulsie'), names: [], unit: 'kW', digits: 1, access: 'calc', calc: (g) => sum(g(['RearPower266', 'SX_rearMechPower']), g(['FrontPower2E5', 'SX_frontMechPower'])) ?? g(['drivePower', 'DI_power']) },
          { id: 'rearPower', label: L('Rear motor power', 'Putere motor spate'), names: ['RearPower266', 'SX_rearMechPower'], unit: 'kW', digits: 1 },
          { id: 'frontPower', label: L('Front motor power', 'Putere motor fata'), names: ['FrontPower2E5', 'SX_frontMechPower'], unit: 'kW', digits: 1 },
          { id: 'rearTorque', label: L('Rear torque', 'Cuplu spate'), names: ['RearTorque1D8', 'DIR_torqueActual', 'driveTorque'], unit: 'Nm', digits: 0 },
          { id: 'frontTorque', label: L('Front torque', 'Cuplu fata'), names: ['FrontTorque1D5', 'DIF_torqueActual', 'SX_frontTorqueMeasured'], unit: 'Nm', digits: 0 },
          { id: 'rearAxleSpeed', label: L('Rear axle speed', 'Turatie ax spate'), names: ['DIR_axleSpeed'], unit: 'rpm', digits: 0 },
          { id: 'frontAxleSpeed', label: L('Front axle speed', 'Turatie ax fata'), names: ['DIF_axleSpeed'], unit: 'rpm', digits: 0 },
          { id: 'motorRpm', label: L('Motor RPM', 'Turatie motor'), names: ['DI_motorRPM'], unit: 'rpm', digits: 0 },
        ],
      },
      {
        id: 'ratings',
        title: L('Power limits', 'Limite de putere'),
        description: L('What the drive units are allowed to deliver right now.', 'Ce pot livra unitatile de propulsie in acest moment.'),
        icon: 'gauge',
        signals: [
          { id: 'drivePowerMax', label: L('Max drive power', 'Putere maxima propulsie'), names: ['SystemDrivePowerMax268'], unit: 'kW', digits: 0 },
          { id: 'driveRating', label: L('Drive power rating', 'Putere nominala propulsie'), names: ['DrivePowerRating336'], unit: 'kW', digits: 0 },
          { id: 'regenRating', label: L('Regen power rating', 'Putere nominala regenerare'), names: ['DriveRegenRating336'], unit: 'kW', digits: 0 },
          { id: 'rearPowerLimit', label: L('Rear power limit', 'Limita putere spate'), names: ['RearPowerLimit266', 'SX_rearDrivePowerMax'], unit: 'kW', digits: 0 },
          { id: 'frontPowerLimit', label: L('Front power limit', 'Limita putere fata'), names: ['FrontPowerLimit2E5', 'SX_frontDrivePowerMax'], unit: 'kW', digits: 0 },
          { id: 'perfPackage', label: L('Performance package', 'Pachet performanta'), names: ['DI_performancePackage'], kind: 'state' },
        ],
      },
      {
        id: 'regen',
        title: L('Regenerative braking', 'Franare regenerativa'),
        description: L('Energy recovered while decelerating.', 'Energie recuperata la decelerare.'),
        icon: 'recycle',
        signals: [
          { id: 'regenMax', label: L('Regen available', 'Regenerare disponibila'), names: ['SystemRegenPowerMax268', 'maxRegenPower'], unit: 'kW', digits: 0 },
          { id: 'regenNow', label: L('Regen now', 'Regenerare acum'), names: [], unit: 'kW', digits: 1, access: 'calc', calc: (g) => { const p = sum(g(['RearPower266', 'SX_rearMechPower']), g(['FrontPower2E5', 'SX_frontMechPower'])); return p !== null && p < 0 ? -p : p !== null ? 0 : null; } },
          { id: 'regenLight', label: L('Regen limited indicator', 'Indicator regenerare limitata'), names: ['DI_regenLight', 'regenIndicator'], kind: 'state' },
        ],
      },
      {
        id: 'wheels',
        title: L('Axles & wheels', 'Axe si roti'),
        description: L('Per-wheel speed reported by ABS/ESP.', 'Viteza fiecarei roti raportata de ABS/ESP.'),
        icon: 'tire',
        signals: [
          { id: 'wsFL', label: L('Wheel speed FL', 'Viteza roata FS'), names: ['WheelSpeedFL175'], unit: 'km/h', digits: 1 },
          { id: 'wsFR', label: L('Wheel speed FR', 'Viteza roata FD'), names: ['WheelSpeedFR175'], unit: 'km/h', digits: 1 },
          { id: 'wsRL', label: L('Wheel speed RL', 'Viteza roata SS'), names: ['WheelSpeedRL175'], unit: 'km/h', digits: 1 },
          { id: 'wsRR', label: L('Wheel speed RR', 'Viteza roata SD'), names: ['WheelSpeedRR175'], unit: 'km/h', digits: 1 },
          { id: 'mass', label: L('Estimated mass', 'Masa estimata'), names: ['DI_mass'], unit: 'kg', digits: 0 },
          { id: 'grade', label: L('Road grade', 'Panta drum'), names: ['DI_gradeEst'], unit: '%', digits: 1 },
        ],
      },
    ],
  },
  {
    id: 'power',
    index: 3,
    title: L('Power Electronics', 'Electronica de putere'),
    short: L('Power', 'Putere'),
    description: L(
      'Traction inverters, DC-DC converter and high-voltage distribution.',
      'Invertoare de tractiune, convertor DC-DC si distributie HV.',
    ),
    icon: 'flash-outline',
    accent: '#F5B66A',
    kpis: ['rearInvTemp', 'dcdcCurrent', 'lvBus', 'rearHv'],
    subsystems: [
      {
        id: 'inverters',
        title: L('Traction inverters', 'Invertoare de tractiune'),
        description: L('DC link and phase current of each drive inverter.', 'Legatura DC si curentul de faza al fiecarui invertor.'),
        icon: 'sine-wave',
        signals: [
          { id: 'rearHv', label: L('Rear inverter DC voltage', 'Tensiune DC invertor spate'), names: ['RearHighVoltage126'], unit: 'V', digits: 1 },
          { id: 'rearMotorCurrent', label: L('Rear motor current', 'Curent motor spate'), names: ['RearMotorCurrent126', 'SX_rearStatorCurrent'], unit: 'A', digits: 0 },
          { id: 'rearDcCurrent', label: L('Rear DC cable current', 'Curent cablu DC spate'), names: ['DIR_dcCableCurrentEst'], unit: 'A', digits: 0 },
          { id: 'rearSwitchFreq', label: L('Rear switching frequency', 'Frecventa comutare spate'), names: ['DIR_switchingFrequency'], unit: 'kHz', digits: 1 },
          { id: 'frontHv', label: L('Front inverter DC voltage', 'Tensiune DC invertor fata'), names: ['FrontHighVoltage1A5'], unit: 'V', digits: 1 },
          { id: 'frontMotorCurrent', label: L('Front motor current', 'Curent motor fata'), names: ['FrontMotorCurrent1A5', 'SX_frontStatorCurrent'], unit: 'A', digits: 0 },
          { id: 'frontDcCurrent', label: L('Front DC cable current', 'Curent cablu DC fata'), names: ['DIF_dcCableCurrentEst'], unit: 'A', digits: 0 },
          { id: 'rearLosses', label: L('Rear inverter + motor losses', 'Pierderi invertor + motor spate'), names: ['SX_rearDissipation'], unit: 'kW', digits: 2 },
          { id: 'frontLosses', label: L('Front inverter + motor losses', 'Pierderi invertor + motor fata'), names: ['SX_frontDissipation'], unit: 'kW', digits: 2 },
        ],
      },
      {
        id: 'invTemps',
        title: L('Inverter & stator temperatures', 'Temperaturi invertor si stator'),
        description: L('Semiconductor, capacitor bank and winding temperatures.', 'Temperaturi semiconductori, condensatori si infasurari.'),
        icon: 'thermometer-lines',
        signals: [
          { id: 'rearInvTemp', label: L('Rear inverter', 'Invertor spate'), names: ['RearTempInverter315', 'SX_rearInverterTemp'], unit: '°C', digits: 0, warnHigh: 90 },
          { id: 'rearStatorTemp', label: L('Rear stator', 'Stator spate'), names: ['RearTempStator315', 'SX_rearStatorTemp'], unit: '°C', digits: 0, warnHigh: 120 },
          { id: 'rearHeatsink', label: L('Rear heatsink', 'Radiator spate'), names: ['RearTempInvHeatsink315', 'SX_rearHeatsinkTemp'], unit: '°C', digits: 0 },
          { id: 'rearCapbank', label: L('Rear capacitor bank', 'Condensatori spate'), names: ['RearTempInvCapbank315', 'SX_rearDcCapTemp'], unit: '°C', digits: 0 },
          { id: 'rearInvPcb', label: L('Rear inverter PCB', 'PCB invertor spate'), names: ['SX_rearInverterPcbTemp'], unit: '°C', digits: 0 },
          { id: 'rearIgbt', label: L('Rear IGBT junction', 'Jonctiune IGBT spate'), names: ['DI_IGBTJunctTemp'], unit: '°C', digits: 0 },
          { id: 'frontInvTemp', label: L('Front inverter', 'Invertor fata'), names: ['TempInverter376'], unit: '°C', digits: 0, warnHigh: 90 },
          { id: 'frontStatorTemp', label: L('Front stator', 'Stator fata'), names: ['TempStator376'], unit: '°C', digits: 0, warnHigh: 120 },
          { id: 'frontIgbt', label: L('Front IGBT junction', 'Jonctiune IGBT fata'), names: ['DIF_IGBTJunctTemp'], unit: '°C', digits: 0 },
        ],
      },
      {
        id: 'dcdc',
        title: L('DC-DC converter', 'Convertor DC-DC'),
        description: L('Steps HV down to the 12 V / 16 V low-voltage rail.', 'Coboara HV la reteaua de joasa tensiune 12 V / 16 V.'),
        icon: 'swap-vertical-bold',
        signals: [
          { id: 'dcdcCurrent', label: L('LV output current', 'Curent iesire LV'), names: ['DCDCoutputCurrent224', 'PCS_dcdcLvOutputCurrent', 'SX_dcdcOutputCurrent'], unit: 'A', digits: 1 },
          { id: 'lvBus', label: L('LV bus voltage', 'Tensiune magistrala LV'), names: ['PCS_dcdcLvBusVolt', 'SX_dcdcOutputVoltage'], unit: 'V', digits: 2 },
          { id: 'dcdcHvBus', label: L('HV input voltage', 'Tensiune intrare HV'), names: ['PCS_dcdcHvBusVolt'], unit: 'V', digits: 0 },
          { id: 'dcdcPower', label: L('LV output power', 'Putere iesire LV'), names: [], unit: 'W', digits: 0, access: 'calc', calc: (g) => { const a = g(['DCDCoutputCurrent224', 'PCS_dcdcLvOutputCurrent', 'SX_dcdcOutputCurrent']); const v = g(['PCS_dcdcLvBusVolt', 'SX_dcdcOutputVoltage']); return a !== null && v !== null ? a * v : null; } },
          { id: 'dcdcState', label: L('Converter state', 'Stare convertor'), names: ['DCDCstate224'], kind: 'state' },
          { id: 'dcdcFault', label: L('Fault', 'Defect'), names: ['DCDCFaulted224'], kind: 'state' },
          { id: 'dcdcInput', label: L('HV input power', 'Putere intrare HV'), names: ['SX_dcdcInputPower'], unit: 'W', digits: 0 },
          { id: 'dcdcCoolant', label: L('Coolant inlet', 'Intrare lichid racire'), names: ['SX_dcdcCoolantInlet'], unit: '°C', digits: 1 },
        ],
      },
      {
        id: 'pdu',
        title: L('HV distribution (PDU)', 'Distributie HV (PDU)'),
        description: L('HV consumers fed from the junction: heat power and accessories.', 'Consumatori HV alimentati din cutia de distributie: incalzire si accesorii.'),
        icon: 'source-branch',
        signals: [
          { id: 'heatPower', label: L('Drive unit heat power', 'Putere termica propulsie'), names: ['SystemHeatPower268'], unit: 'kW', digits: 2 },
          { id: 'heatPowerMax', label: L('Max heat power', 'Putere termica maxima'), names: ['SystemHeatPowerMax268'], unit: 'kW', digits: 1 },
          { id: 'hvacBudget', label: L('HVAC power budget', 'Buget putere HVAC'), names: ['BMS_hvacPowerBudget'], unit: 'kW', digits: 1 },
          { id: 'cmpdPower', label: L('Compressor HV power', 'Putere HV compresor'), names: ['CMPD_inputHVPower'], unit: 'W', digits: 0 },
          { id: 'ptcCurrent', label: L('PTC heater HV current', 'Curent HV incalzitor PTC'), names: [], unit: 'A', digits: 1, access: 'calc', calc: (g) => sum(g(['PTC_leftCurrentHV']), g(['PTC_rightCurrentHV'])) },
        ],
      },
    ],
  },
  {
    id: 'charging',
    index: 4,
    title: L('Charging', 'Incarcare'),
    short: L('Charge', 'Incarcare'),
    description: L(
      'Charge port, on-board AC charger and DC fast-charge interface.',
      'Port de incarcare, incarcator AC la bord si interfata DC rapida.',
    ),
    icon: 'ev-station',
    accent: '#20D69A',
    kpis: ['chargePower', 'acPower', 'dcPower', 'timeToFull'],
    subsystems: [
      {
        id: 'session',
        title: L('Charge session', 'Sesiune incarcare'),
        description: L('What is happening right now at the plug.', 'Ce se intampla acum la priza.'),
        icon: 'battery-charging',
        signals: [
          { id: 'chargePower', label: L('Power into pack', 'Putere in pachet'), names: [], unit: 'kW', digits: 1, access: 'calc', calc: (g) => { const v = g(['packVoltage', 'BattVoltage132']); const a = g(['SmoothBattCurrent132', 'packCurrent']); return v !== null && a !== null ? Math.max(0, (-v * a) / 1000) : null; } },
          { id: 'chargeStatus', label: L('Charge status', 'Stare incarcare'), names: ['BMS_uiChargeStatus'], kind: 'state' },
          { id: 'timeToFull', label: L('Time remaining', 'Timp ramas'), names: ['ChargeHoursRemaining132'], unit: 'h', digits: 1 },
          { id: 'toFullEnergy', label: L('Energy to full', 'Energie pana la plin'), names: ['BMS_energyToChargeComplete', 'SX_energyToChargeComplete'], unit: 'kWh', digits: 1 },
          { id: 'chgAvailable', label: L('Charge power available', 'Putere incarcare disponibila'), names: ['BMS_chgPowerAvailable'], unit: 'kW', digits: 1 },
        ],
      },
      {
        id: 'port',
        title: L('Charge port & inlet', 'Port si mufa incarcare'),
        description: L('Pilot signal, EVSE limits and pin temperatures.', 'Semnal pilot, limite EVSE si temperaturi pini.'),
        icon: 'power-plug-outline',
        signals: [
          { id: 'pilot', label: L('Pilot state', 'Stare pilot'), names: ['CC_pilotState'], kind: 'state' },
          { id: 'evseCurrentLimit', label: L('EVSE current limit', 'Limita curent EVSE'), names: ['CC_currentLimit'], unit: 'A', digits: 0 },
          { id: 'acPinTemp', label: L('AC pin temperature', 'Temperatura pin AC'), names: ['CP_acPinTemperature'], unit: '°C', digits: 0, warnHigh: 80 },
          { id: 'dcPinTemp', label: L('DC pin temperature', 'Temperatura pin DC'), names: ['CP_dcPinTemperature'], unit: '°C', digits: 0, warnHigh: 80 },
        ],
      },
      {
        id: 'obc',
        title: L('On-board charger (AC)', 'Incarcator la bord (AC)'),
        description: L('Grid line voltage, phases and AC power converted to DC.', 'Tensiune retea, faze si putere AC convertita in DC.'),
        icon: 'sine-wave',
        signals: [
          { id: 'acPower', label: L('AC line power', 'Putere linie AC'), names: ['ChargeLinePower264'], unit: 'kW', digits: 2 },
          { id: 'acVoltage', label: L('AC line voltage', 'Tensiune linie AC'), names: ['ChargeLineVoltage264', 'CC_line1Voltage'], unit: 'V', digits: 0 },
          { id: 'acCurrent', label: L('AC line current', 'Curent linie AC'), names: ['ChargeLineCurrent264'], unit: 'A', digits: 1 },
          { id: 'acCurrentLimit', label: L('AC current limit', 'Limita curent AC'), names: ['ChargeLineCurrentLimit264'], unit: 'A', digits: 0 },
          { id: 'phases', label: L('Phases', 'Faze'), names: ['CC_numPhases'], digits: 0 },
          { id: 'acAvailable', label: L('Max AC power available', 'Putere AC maxima disponibila'), names: ['PCS_chgMaxAcPowerAvailable'], unit: 'kW', digits: 1 },
          { id: 'obcState', label: L('Charger state', 'Stare incarcator'), names: ['PCS_chgMainState', 'PCS_hvChargeStatus'], kind: 'state' },
        ],
      },
      {
        id: 'dcfc',
        title: L('DC fast charging', 'Incarcare rapida DC'),
        description: L('Direct-to-pack DC from Supercharger / CCS stations.', 'Curent DC direct in pachet de la Supercharger / CCS.'),
        icon: 'lightning-bolt',
        signals: [
          { id: 'dcVoltage', label: L('DC voltage', 'Tensiune DC'), names: ['FC_dcVoltage'], unit: 'V', digits: 0 },
          { id: 'dcCurrent', label: L('DC current', 'Curent DC'), names: ['FC_dcCurrent'], unit: 'A', digits: 0 },
          { id: 'dcPower', label: L('DC power', 'Putere DC'), names: [], unit: 'kW', digits: 1, access: 'calc', calc: (g) => { const v = g(['FC_dcVoltage']); const a = g(['FC_dcCurrent']); return v !== null && a !== null ? (v * a) / 1000 : null; } },
          { id: 'fcPowerLimit', label: L('Vehicle power limit', 'Limita putere vehicul'), names: ['FCPowerLimit244'], unit: 'kW', digits: 0 },
          { id: 'fcCurrentLimit', label: L('Vehicle current limit', 'Limita curent vehicul'), names: ['FCCurrentLimit244'], unit: 'A', digits: 0 },
          { id: 'evseMaxPower', label: L('Station max power', 'Putere maxima statie'), names: ['CP_evseMaxDcPowerLimit'], unit: 'kW', digits: 0 },
          { id: 'fcIsolation', label: L('Station isolation', 'Izolatie statie'), names: ['FCIsolation215'], unit: 'kΩ', digits: 0 },
          { id: 'fcType', label: L('Station type', 'Tip statie'), names: ['FC_type'], kind: 'state' },
          { id: 'fcStatus', label: L('Station status', 'Stare statie'), names: ['FC_statusCode'], kind: 'state' },
        ],
      },
    ],
  },
  {
    id: 'thermal',
    index: 5,
    title: L('Thermal Management', 'Management termic'),
    short: L('Thermal', 'Termic'),
    description: L(
      'Battery heating/cooling, powertrain coolant loop, cabin HVAC and heat pump.',
      'Incalzire/racire baterie, circuit racire propulsie, HVAC habitaclu si pompa de caldura.',
    ),
    icon: 'thermometer',
    accent: '#FF8A65',
    kpis: ['batInletTarget', 'cabinTemp', 'outsideTemp', 'compressorRpm'],
    subsystems: [
      {
        id: 'battery',
        title: L('Battery cooling & heating', 'Racire si incalzire baterie'),
        description: L('Inlet temperature targets and coolant flow through the pack.', 'Tinte de temperatura la intrare si debit de lichid prin pachet.'),
        icon: 'coolant-temperature',
        signals: [
          { id: 'batInletTarget', label: L('Inlet passive target', 'Tinta pasiva intrare'), names: ['BMSinletPassiveTarget312'], unit: '°C', digits: 1 },
          { id: 'batInletHeat', label: L('Inlet heat target', 'Tinta incalzire intrare'), names: ['BMSinletActiveHeatTarget312'], unit: '°C', digits: 1 },
          { id: 'batInletCool', label: L('Inlet cool target', 'Tinta racire intrare'), names: ['BMSinletActiveCoolTarget312'], unit: '°C', digits: 1 },
          { id: 'batFlowActual', label: L('Battery coolant flow', 'Debit racire baterie'), names: ['VCFRONT_coolantFlowBatActual'], unit: 'l/min', digits: 1 },
          { id: 'batFlowTarget', label: L('Battery flow target', 'Tinta debit baterie'), names: ['VCFRONT_coolantFlowBatTarget'], unit: 'l/min', digits: 1 },
          { id: 'bmsDissipation', label: L('Pack heat dissipation', 'Disipare caldura pachet'), names: ['BMSdissipation312'], unit: 'kW', digits: 2 },
          { id: 'heatingWorthwhile', label: L('Active heating worthwhile', 'Incalzire activa utila'), names: ['BMS_activeHeatingWorthwhile'], kind: 'state' },
          { id: 'batInletTemp', label: L('Battery coolant inlet', 'Intrare lichid baterie'), names: ['SX_batteryInletTemp'], unit: '°C', digits: 1 },
          { id: 'batHeaterTemp', label: L('Battery heater temperature', 'Temperatura incalzitor baterie'), names: ['SX_batteryHeaterTemp'], unit: '°C', digits: 1 },
          { id: 'batPump', label: L('Battery pump', 'Pompa baterie'), names: ['SX_batteryPump1'], unit: '%', digits: 0 },
        ],
      },
      {
        id: 'powertrain',
        title: L('Powertrain cooling', 'Racire propulsie'),
        description: L('Coolant loop for motors, inverters and charger.', 'Circuit de racire pentru motoare, invertoare si incarcator.'),
        icon: 'radiator',
        signals: [
          { id: 'ptFlowActual', label: L('Powertrain coolant flow', 'Debit racire propulsie'), names: ['VCFRONT_coolantFlowPTActual'], unit: 'l/min', digits: 1 },
          { id: 'ptFlowTarget', label: L('Powertrain flow target', 'Tinta debit propulsie'), names: ['VCFRONT_coolantFlowPTTarget'], unit: 'l/min', digits: 1 },
          { id: 'wasteHeat', label: L('Waste-heat request', 'Cerere caldura reziduala'), names: ['VCFRONT_wasteHeatRequestType'], kind: 'state' },
          { id: 'radiatorIneffective', label: L('Radiator ineffective', 'Radiator ineficient'), names: ['VCFRONT_radiatorIneffective'], kind: 'state' },
          { id: 'rearStatorLoad', label: L('Rear stator thermal load', 'Incarcare termica stator spate'), names: ['RearTempPctStator315', 'SX_rearStatorTempPct'], unit: '%', digits: 0 },
          { id: 'ptInletTemp', label: L('Powertrain coolant inlet', 'Intrare lichid propulsie'), names: ['SX_ptInletTemp'], unit: '°C', digits: 1 },
          { id: 'rearCoolantInlet', label: L('Rear drive unit coolant inlet', 'Intrare lichid motor spate'), names: ['SX_rearCoolantInletTemp'], unit: '°C', digits: 0 },
          { id: 'ptPump', label: L('Powertrain pump', 'Pompa propulsie'), names: ['SX_ptPump'], unit: '%', digits: 0 },
        ],
      },
      {
        id: 'hvac',
        title: L('Cabin HVAC & heat pump', 'HVAC habitaclu si pompa de caldura'),
        description: L('Compressor, PTC heater, blower and cabin temperatures.', 'Compresor, incalzitor PTC, ventilator si temperaturi habitaclu.'),
        icon: 'air-conditioner',
        signals: [
          { id: 'cabinTemp', label: L('Cabin temperature', 'Temperatura habitaclu'), names: ['VCRIGHT_hvacCabinTempEst', 'AirTemp_Insd', 'SX_insideTemp'], unit: '°C', digits: 1 },
          { id: 'outsideTemp', label: L('Outside temperature', 'Temperatura exterioara'), names: ['outsideTemp', 'DI_outsideTemp', 'AirTemp_Outsd'], unit: '°C', digits: 1 },
          { id: 'ductLeft', label: L('Duct temp left', 'Temp. conducta stanga'), names: ['VCRIGHT_tempDuctLeft'], unit: '°C', digits: 1 },
          { id: 'ductRight', label: L('Duct temp right', 'Temp. conducta dreapta'), names: ['VCRIGHT_tempDuctRight'], unit: '°C', digits: 1 },
          { id: 'compressorRpm', label: L('Compressor speed', 'Turatie compresor'), names: ['CMPD_speedRPM', 'CMP_speedRPM'], unit: 'rpm', digits: 0 },
          { id: 'compressorState', label: L('Compressor state', 'Stare compresor'), names: ['CMPD_state', 'CMP_state'], kind: 'state' },
          { id: 'heatPumpMode', label: L('Heat-pump waste heat', 'Caldura reziduala pompa'), names: ['CMPD_wasteHeatState'], kind: 'state' },
          { id: 'acRunning', label: L('A/C running', 'A/C pornit'), names: ['VCRIGHT_hvacACRunning'], kind: 'state' },
          { id: 'blowerRpm', label: L('Blower speed', 'Turatie ventilator'), names: ['VCLEFT_hvacBlowerRPMActual'], unit: 'rpm', digits: 0 },
          { id: 'recirc', label: L('Recirculation', 'Recirculare'), names: ['VCRIGHT_hvacRecirc'], kind: 'state' },
          { id: 'ptcTemp', label: L('PTC heater PCB temp', 'Temp. PCB incalzitor PTC'), names: ['PTC_tempPCB'], unit: '°C', digits: 0 },
        ],
      },
    ],
  },
  {
    id: 'control',
    index: 6,
    title: L('Control & Low-Voltage', 'Control si joasa tensiune'),
    short: L('Control', 'Control'),
    description: L(
      'Vehicle control unit, 12 V auxiliary battery and electrified chassis.',
      'Unitate de control vehicul, baterie auxiliara 12 V si sasiu electrificat.',
    ),
    icon: 'steering',
    accent: '#B39DFF',
    kpis: ['lvVoltage', 'lvCurrent', 'odometerCtl', 'steeringAngle'],
    subsystems: [
      {
        id: 'vcu',
        title: L('Vehicle control unit', 'Unitate control vehicul'),
        description: L('Supervisory state, identity and odometer.', 'Stare de supervizare, identitate si kilometraj.'),
        icon: 'cpu-64-bit',
        signals: [
          { id: 'odometerCtl', label: L('Odometer', 'Kilometraj'), names: ['Odometer3B6', 'UI_odometer', 'SX_batteryOdometer'], unit: 'km', digits: 0 },
          { id: 'systemState', label: L('Drive system state', 'Stare sistem'), names: ['DI_systemState', 'DI_state'], kind: 'state' },
          { id: 'immobilizer', label: L('Immobilizer', 'Imobilizator'), names: ['DI_immobilizerState'], kind: 'state' },
          { id: 'driveBlocked', label: L('Drive blocked', 'Propulsie blocata'), names: ['DI_driveBlocked'], kind: 'state' },
          { id: 'mcuCoreTemp', label: L('MCU core temp', 'Temp. nucleu MCU'), names: ['tegraCoreTemp', 'UI_tegraCoreTemperature'], unit: '°C', digits: 0 },
          { id: 'cruiseSet', label: L('Cruise set speed', 'Viteza cruise setata'), names: ['cruiseSetSpeed', 'DI_cruiseSet', 'DAS_setSpeed'], unit: 'km/h', digits: 0 },
          { id: 'speedLimit', label: L('Map speed limit', 'Limita de viteza harta'), names: ['speedLimit', 'UI_mapSpeedLimit'], unit: 'km/h', digits: 0 },
        ],
      },
      {
        id: 'lv',
        title: L('12 V / 16 V auxiliary battery', 'Baterie auxiliara 12 V / 16 V'),
        description: L('Low-voltage battery powering safety systems and modules.', 'Baterie de joasa tensiune pentru sisteme de siguranta si module.'),
        icon: 'car-battery',
        signals: [
          { id: 'lvVoltage', label: L('LV battery voltage', 'Tensiune baterie LV'), names: ['v12vBattVoltage261', 'UI_12vBatteryVoltage', 'VCFRONT_lowVoltBatteryVoltage', 'SX_rearInverter12V'], unit: 'V', digits: 2, warnLow: 11.8, warnHigh: 16.2 },
          { id: 'lvCurrent', label: L('LV battery current', 'Curent baterie LV'), names: ['v12vBattCurrent261'], unit: 'A', digits: 1 },
          { id: 'lvTemp', label: L('LV battery temperature', 'Temperatura baterie LV'), names: ['v12vBattTemp261'], unit: '°C', digits: 0 },
          { id: 'lvAh', label: L('LV battery charge', 'Sarcina baterie LV'), names: ['v12vBattAH261'], unit: 'Ah', digits: 1 },
          { id: 'lvTarget', label: L('Target voltage', 'Tensiune tinta'), names: ['VCFRONT_12VBatteryTargetVoltage'], unit: 'V', digits: 2 },
          { id: 'lvState', label: L('LV battery state', 'Stare baterie LV'), names: ['VCFRONT_batterySMState'], kind: 'state' },
          { id: 'lvChargeNeeded', label: L('Charge needed', 'Necesita incarcare'), names: ['VCFRONT_chargeNeeded'], kind: 'state' },
        ],
      },
      {
        id: 'chassis',
        title: L('Electrified chassis', 'Sasiu electrificat'),
        description: L('Electric power steering, brake booster, parking brakes and tyres.', 'Servodirectie electrica, servofrana, frane de parcare si anvelope.'),
        icon: 'car-brake-abs',
        signals: [
          { id: 'steeringAngle', label: L('Steering angle', 'Unghi volan'), names: ['SteeringAngle129', 'StW_Angl'], unit: '°', digits: 1 },
          { id: 'steeringSpeed', label: L('Steering speed', 'Viteza volan'), names: ['SteeringSpeed129', 'StW_AnglSpd'], unit: '°/s', digits: 0 },
          { id: 'epasTorque', label: L('EPS torsion bar torque', 'Cuplu bara torsiune EPS'), names: ['EPAS_torsionBarTorque'], unit: 'Nm', digits: 2 },
          { id: 'iBooster', label: L('Brake booster status', 'Stare servofrana'), names: ['IBST_iBoosterStatus'], kind: 'state' },
          { id: 'brakeApply', label: L('Driver brake apply', 'Apasare frana sofer'), names: ['IBST_driverBrakeApply', 'driverBrakeStatus'], kind: 'state' },
          { id: 'epbLeft', label: L('Parking brake left', 'Frana parcare stanga'), names: ['EPBLunitStatus288'], kind: 'state' },
          { id: 'epbRight', label: L('Parking brake right', 'Frana parcare dreapta'), names: ['EPBRunitStatus228'], kind: 'state' },
          { id: 'brakeTempFL', label: L('Brake temp FL', 'Temp. frana FS'), names: ['BrakeTempFL3FE'], unit: '°C', digits: 0 },
          { id: 'brakeTempFR', label: L('Brake temp FR', 'Temp. frana FD'), names: ['BrakeTempFR3FE'], unit: '°C', digits: 0 },
        ],
      },
      {
        id: 'tpms',
        title: L('Tyre pressure (TPMS)', 'Presiune anvelope (TPMS)'),
        description: L('Pressure and temperature per wheel.', 'Presiune si temperatura pe fiecare roata.'),
        icon: 'car-tire-alert',
        signals: [
          { id: 'tpmsFL', label: L('Pressure FL', 'Presiune FS'), names: ['TPMSFLpressure31F'], unit: 'bar', digits: 2, warnLow: 2.4 },
          { id: 'tpmsFR', label: L('Pressure FR', 'Presiune FD'), names: ['TPMSFRpressure31F'], unit: 'bar', digits: 2, warnLow: 2.4 },
          { id: 'tpmsRL', label: L('Pressure RL', 'Presiune SS'), names: ['TPMSRLpressure31F'], unit: 'bar', digits: 2, warnLow: 2.4 },
          { id: 'tpmsRR', label: L('Pressure RR', 'Presiune SD'), names: ['TPMSRRpressure31F'], unit: 'bar', digits: 2, warnLow: 2.4 },
          { id: 'tpmsTempFL', label: L('Tyre temp FL', 'Temp. anvelopa FS'), names: ['TPMSFLtemp31F'], unit: '°C', digits: 0 },
          { id: 'tpmsTempFR', label: L('Tyre temp FR', 'Temp. anvelopa FD'), names: ['TPMSFRtemp31F'], unit: '°C', digits: 0 },
        ],
      },
    ],
  },
];

export const SYSTEM_BY_ID: Record<SystemId, SystemSpec> = SYSTEMS.reduce(
  (acc, system) => {
    acc[system.id] = system;
    return acc;
  },
  {} as Record<SystemId, SystemSpec>,
);

export function isSystemId(value: unknown): value is SystemId {
  return typeof value === 'string' && value in SYSTEM_BY_ID;
}

/** Every read signal name a system needs (calc inputs included). */
export function systemSignalNames(system: SystemSpec): Set<string> {
  const names = new Set<string>();
  for (const subsystem of system.subsystems) {
    for (const spec of subsystem.signals) {
      for (const name of spec.names) {
        names.add(name);
      }
      if (spec.calc) {
        // Collect the names the calculator asks for by running it with a probe.
        spec.calc((candidates) => {
          for (const name of candidates) {
            names.add(name);
          }
          return null;
        });
      }
    }
  }
  return names;
}

/** Lookup: signal name -> owning system, first system wins. */
export function buildSystemSignalIndex(): Map<string, SystemId> {
  const index = new Map<string, SystemId>();
  for (const system of SYSTEMS) {
    for (const name of systemSignalNames(system)) {
      if (!index.has(name)) {
        index.set(name, system.id);
      }
      const lower = name.toLowerCase();
      if (!index.has(lower)) {
        index.set(lower, system.id);
      }
    }
  }
  return index;
}

export function findSignalSpec(systemId: SystemId, signalId: string): SignalSpec | null {
  for (const subsystem of SYSTEM_BY_ID[systemId].subsystems) {
    const spec = subsystem.signals.find((entry) => entry.id === signalId);
    if (spec) {
      return spec;
    }
  }
  return null;
}
