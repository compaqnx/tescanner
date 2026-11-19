export type LocaleCode = 'en' | 'ro';

type Dictionary = Record<string, string>;

const EN: Dictionary = {
  appTitle: 'Tescanner Pro',
  appSubtitle: 'Real-time Tesla CAN telemetry workstation',
  profileLabel: 'Profile {name}',
  adapterConnected: 'Adapter {name}',
  adapterDisconnected: 'Adapter not connected',
  languageLabel: 'Language',
  languageEN: 'EN',
  languageRO: 'RO',

  statusBooting: 'BOOTING',
  statusIdle: 'IDLE',
  statusScanning: 'SCANNING',
  statusConnecting: 'CONNECTING',
  statusConnected: 'CONNECTED',
  statusStreaming: 'STREAMING',
  statusError: 'ERROR',

  counterFrames: 'Frames',
  counterSignals: 'Signals',
  counterSession: 'Session',
  sessionLive: 'Live',
  sessionIdle: 'Idle',

  tabDashboard: 'Dashboard',
  tabHvBattery: 'HV Battery',
  tabSignals: 'Signals',
  tabAdapter: 'Adapter',
  tabConsole: 'Console',

  sectionLiveControls: 'Live Controls',
  actionScanning: 'Scanning...',
  actionScan: 'Scan',
  actionDisconnecting: 'Disconnecting...',
  actionDisconnect: 'Disconnect',
  actionStarting: 'Starting...',
  actionStartStream: 'Start Stream',
  actionStopping: 'Stopping...',
  actionStopStream: 'Stop Stream',
  actionExporting: 'Exporting...',
  actionExportCsv: 'Export CSV',
  lastExport: 'Last export {uri}',

  sectionPrimaryWidgets: 'Primary Widgets',
  sectionSecondaryMetrics: 'Secondary Metrics',
  waitingForData: 'Waiting for data',

  sectionHvPack: 'Battery pack visualization',
  hvViewGrid: 'Grid View',
  hvViewBars: 'Bars View',
  hvNoCellData: 'No cell voltage signals yet. Start stream and verify profile.',
  hvCellLabel: 'C{index}',
  hvBarsYAxis: 'Voltage (V)',
  hvBarsXAxis: 'Cell Numbers',
  hvPageLabel: 'Cells {start}-{end}',
  hvMin: 'Min {value}',
  hvMax: 'Max {value}',
  hvDelta: 'Delta {value}',

  sectionHvInternals: 'HV internals and accessories',
  hvInternalsEmpty: 'No HV internals detected yet.',

  sectionWatchedSignals: 'Watched Signals',
  watchedEmpty: 'No watched values yet. Start stream and wait for traffic.',
  sectionSignalExplorer: 'Signal Explorer',
  signalSearchPlaceholder: 'Search by signal or message',
  noSignalMatches: 'No matching signals found.',

  sectionVehicleProfile: 'Vehicle Profile',
  profileModel3yName: 'Model 3 / Y',
  profileModel3yDesc: 'Model 3 and Model Y telemetry profile.',
  profileModelsxName: 'Model S / X (2015-2021)',
  profileModelsxDesc: 'Legacy Model S/X telemetry profile.',

  sectionBluetoothAdapters: 'Bluetooth Adapters',
  actionScanAdapters: 'Scan Adapters',
  noAdapters: 'No adapters found yet.',
  rssiLabel: 'RSSI {value}',
  actionConnect: 'Connect',
  connectedState: 'Connected',

  sectionManualCommands: 'Manual Adapter Commands',
  commandPlaceholder: 'ATI, ATRV, 0100',
  actionSend: 'Send',
  commandRequiresAdapter: 'Connect an adapter before sending commands.',
  commandErrorPrefix: 'ERROR',

  sectionRawCan: 'Recent Raw CAN Lines',
  waitingTraffic: 'Waiting for incoming traffic.',

  errBluetoothDenied: 'Bluetooth permission was denied.',
  errSystemNotReady: 'System not ready for streaming yet.',
  errSwitchProfileIdle: 'Switch vehicle profile while idle. Disconnect and stop streaming first.',
  errAdapterNotConnected: 'Adapter is not connected.',

  genericUnknown: 'Unknown',
};

const RO: Dictionary = {
  appTitle: 'Tescanner Pro',
  appSubtitle: 'Statie de telemetrie CAN Tesla in timp real',
  profileLabel: 'Profil {name}',
  adapterConnected: 'Adaptor {name}',
  adapterDisconnected: 'Adaptor neconectat',
  languageLabel: 'Limba',
  languageEN: 'EN',
  languageRO: 'RO',

  statusBooting: 'PORNIRE',
  statusIdle: 'INACTIV',
  statusScanning: 'CAUTARE',
  statusConnecting: 'CONECTARE',
  statusConnected: 'CONECTAT',
  statusStreaming: 'STREAMING',
  statusError: 'EROARE',

  counterFrames: 'Cadre',
  counterSignals: 'Semnale',
  counterSession: 'Sesiune',
  sessionLive: 'Activ',
  sessionIdle: 'Inactiv',

  tabDashboard: 'Tablou',
  tabHvBattery: 'Baterie HV',
  tabSignals: 'Semnale',
  tabAdapter: 'Adaptor',
  tabConsole: 'Consola',

  sectionLiveControls: 'Control live',
  actionScanning: 'Se cauta...',
  actionScan: 'Scaneaza',
  actionDisconnecting: 'Se deconecteaza...',
  actionDisconnect: 'Deconecteaza',
  actionStarting: 'Pornire...',
  actionStartStream: 'Start stream',
  actionStopping: 'Oprire...',
  actionStopStream: 'Stop stream',
  actionExporting: 'Export...',
  actionExportCsv: 'Export CSV',
  lastExport: 'Ultimul export {uri}',

  sectionPrimaryWidgets: 'Widgeturi principale',
  sectionSecondaryMetrics: 'Metrici secundare',
  waitingForData: 'Se asteapta date',

  sectionHvPack: 'Vizualizare pachet baterie',
  hvViewGrid: 'Vizualizare grila',
  hvViewBars: 'Vizualizare bare',
  hvNoCellData: 'Nu exista date de celule. Porneste stream-ul si verifica profilul.',
  hvCellLabel: 'C{index}',
  hvBarsYAxis: 'Tensiune (V)',
  hvBarsXAxis: 'Numere celule',
  hvPageLabel: 'Celule {start}-{end}',
  hvMin: 'Min {value}',
  hvMax: 'Max {value}',
  hvDelta: 'Delta {value}',

  sectionHvInternals: 'Interne HV si accesorii',
  hvInternalsEmpty: 'Nu au fost detectate inca semnale HV interne.',

  sectionWatchedSignals: 'Semnale urmarite',
  watchedEmpty: 'Nu exista valori urmarite. Porneste stream-ul.',
  sectionSignalExplorer: 'Explorator semnale',
  signalSearchPlaceholder: 'Cauta dupa semnal sau mesaj',
  noSignalMatches: 'Nu exista rezultate.',

  sectionVehicleProfile: 'Profil vehicul',
  profileModel3yName: 'Model 3 / Y',
  profileModel3yDesc: 'Profil telemetrie pentru Model 3 si Model Y.',
  profileModelsxName: 'Model S / X (2015-2021)',
  profileModelsxDesc: 'Profil telemetrie legacy pentru Model S/X.',

  sectionBluetoothAdapters: 'Adaptoare Bluetooth',
  actionScanAdapters: 'Scaneaza adaptoare',
  noAdapters: 'Nu au fost gasite adaptoare.',
  rssiLabel: 'RSSI {value}',
  actionConnect: 'Conecteaza',
  connectedState: 'Conectat',

  sectionManualCommands: 'Comenzi manuale adaptor',
  commandPlaceholder: 'ATI, ATRV, 0100',
  actionSend: 'Trimite',
  commandRequiresAdapter: 'Conecteaza un adaptor inainte de comenzi.',
  commandErrorPrefix: 'EROARE',

  sectionRawCan: 'Linii CAN brute recente',
  waitingTraffic: 'Se asteapta trafic.',

  errBluetoothDenied: 'Permisiunea Bluetooth a fost refuzata.',
  errSystemNotReady: 'Sistemul nu este pregatit pentru streaming.',
  errSwitchProfileIdle: 'Schimba profilul doar in stare inactiva. Deconecteaza si opreste stream-ul.',
  errAdapterNotConnected: 'Adaptorul nu este conectat.',

  genericUnknown: 'Necunoscut',
};

const TRANSLATIONS: Record<LocaleCode, Dictionary> = {
  en: EN,
  ro: RO,
};

export type TranslationKey = keyof typeof EN;

function withParams(template: string, params?: Record<string, string | number>): string {
  if (!params) {
    return template;
  }

  return Object.entries(params).reduce((acc, [key, value]) => {
    return acc.replaceAll(`{${key}}`, String(value));
  }, template);
}

export function translate(locale: LocaleCode, key: TranslationKey, params?: Record<string, string | number>): string {
  const dictionary = TRANSLATIONS[locale] ?? EN;
  const template = dictionary[key] ?? EN[key] ?? key;
  return withParams(template, params);
}

export function localizeTelemetryError(locale: LocaleCode, rawError: string | null): string | null {
  if (!rawError) {
    return null;
  }

  switch (rawError) {
    case 'Bluetooth permission was denied.':
      return translate(locale, 'errBluetoothDenied');
    case 'System not ready for streaming yet.':
      return translate(locale, 'errSystemNotReady');
    case 'Switch vehicle profile while idle. Disconnect and stop streaming first.':
      return translate(locale, 'errSwitchProfileIdle');
    case 'Adapter is not connected.':
      return translate(locale, 'errAdapterNotConnected');
    default:
      return rawError;
  }
}
