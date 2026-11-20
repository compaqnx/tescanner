export type LocaleCode = 'en' | 'ro';

type Dictionary = Record<string, string>;

const EN: Dictionary = {
  appTitle: 'Tescanner Pro',
  appSubtitle: 'Real-time Tesla CAN telemetry workstation',
  drawerNavigation: 'Navigation',
  menuButtonLabel: 'Menu',
  screenLabel: 'Screen {name}',
  profileLabel: 'Profile {name}',
  adapterConnected: 'Adapter {name}',
  adapterDisconnected: 'Adapter not connected',
  settingsCurrentAdapter: 'Current adapter',
  settingsNoAdapter: 'No adapter connected',
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
  tabErrors: 'Errors',
  tabSettings: 'Settings',

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
  exportNoDataTitle: 'Export',
  exportNoData: 'Nothing to export yet. Start a stream first.',

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
  sectionAppSettings: 'App Settings',
  sectionLanguageSettings: 'Language',
  sectionConnectionSettings: 'Connection',
  settingsCanFilter: 'CAN hardware filtering',
  settingsCanFilterHint:
    'Request only the signals this profile decodes so the adapter is not flooded by the whole bus. Turn off to monitor every frame (debug).',
  settingsCanFilterOn: 'On',
  settingsCanFilterOff: 'Off',
  sectionSignalSelection: 'Signal selection',
  signalSelectionHint: 'Choose which signal groups to poll. Fewer groups refresh faster.',
  signalSelectionRefresh: 'Full refresh ≈ {value} · {count} groups',
  signalSelectionSelectAll: 'All',
  signalSelectionSelectNone: 'None',
  signalSelectionCore: 'Core',
  signalSelectionHv: 'HV / battery',
  profileModel3yName: 'Model 3 / Y',
  profileModel3yDesc: 'Model 3 and Model Y telemetry profile.',
  profileModelsxName: 'Model S / X (2015-2021)',
  profileModelsxDesc: 'Legacy Model S/X telemetry profile.',

  actionDiscover: 'Discover',
  actionGoHv: 'HV Battery',
  actionViewErrors: 'Errors',
  actionClearErrors: 'Clear',

  modelNameUnknown: 'Tesla Model --',
  modelDisconnectedHint: 'Connect an adapter to detect model',

  dashboardWidgetPackVoltage: 'Battery voltage',
  dashboardWidgetPackCurrent: 'Battery current',
  dashboardWidgetHvPower: 'Battery power',
  dashboardWidgetIdealRange: 'Ideal range',
  dashboardWidgetSystem12v: '12V system',
  dashboardWidgetSystem16v: '16V system',
  dashboardWidgetVehicleSpeed: 'Speed',
  dashboardWidgetBatterySoc: 'Battery SoC',
  statusOk: 'OK',
  statusLow: 'LOW',
  statusHigh: 'HIGH',
  statusNoData: 'NO DATA',

  sectionBluetoothAdapters: 'Bluetooth Adapters',
  actionScanAdapters: 'Scan Adapters',
  noAdapters: 'No adapters found yet.',
  rssiLabel: 'RSSI {value}',
  actionConnect: 'Connect',
  connectedState: 'Connected',
  genericNotAvailable: 'n/a',

  modelNameModel3: 'Tesla Model 3',
  modelNameModelY: 'Tesla Model Y',
  modelNameModelS: 'Tesla Model S',
  modelNameModelX: 'Tesla Model X',
  modelNameModelSx: 'Tesla Model S / X',
  modelNameModel3y: 'Tesla Model 3 / Y',

  sectionManualCommands: 'Manual Adapter Commands',
  commandPlaceholder: 'ATI, ATRV, 0100',
  actionSend: 'Send',
  commandRequiresAdapter: 'Connect an adapter before sending commands.',
  commandBlockedWhileStreaming: 'Stop the live stream before sending commands.',
  commandEmptyResponse: '<empty response>',
  commandErrorPrefix: 'ERROR',

  errorsCurrentTitle: 'Current Errors',
  errorsStoredCount: '{count} stored errors',
  errorsNoneStored: 'No errors stored yet.',
  errorLoggedAt: 'Logged at {time}',

  exitAppTitle: 'Close App',
  exitAppMessage: 'Do you want to close Tescanner?',
  exitAppCancel: 'Cancel',
  exitAppConfirm: 'Close',

  sectionRawCan: 'Recent Raw CAN Lines',
  waitingTraffic: 'Waiting for incoming traffic.',

  dashboardLocation: 'Location',
  dashboardCharging: 'Charging',
  dashboardSessionLive: 'Live session active',
  dashboardWaitingStream: 'Waiting for stream',
  dashboardBatteryTemperature: 'Battery temperature',
  dashboardClimateInterior: 'Climate interior',
  dashboardPowertrain: 'Powertrain',
  dashboardTelemetry: 'Telemetry',
  dashboardSignalsCount: '{value} signals',

  errBluetoothDenied: 'Bluetooth permission was denied.',
  errSystemNotReady: 'System not ready for streaming yet.',
  errSwitchProfileIdle: 'Switch vehicle profile while idle. Disconnect and stop streaming first.',
  errAdapterNotConnected: 'Adapter is not connected.',
  errCommandWhileStreaming: 'Stop the live stream before sending commands.',
  errNoPollSelection: 'Select at least one signal group to stream.',

  genericUnknown: 'Unknown',
};

const RO: Dictionary = {
  appTitle: 'Tescanner Pro',
  appSubtitle: 'Statie de telemetrie CAN Tesla in timp real',
  drawerNavigation: 'Navigare',
  menuButtonLabel: 'Meniu',
  screenLabel: 'Ecran {name}',
  profileLabel: 'Profil {name}',
  adapterConnected: 'Adaptor {name}',
  adapterDisconnected: 'Adaptor neconectat',
  settingsCurrentAdapter: 'Adaptor curent',
  settingsNoAdapter: 'Niciun adaptor conectat',
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
  tabErrors: 'Erori',
  tabSettings: 'Setari',

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
  exportNoDataTitle: 'Export',
  exportNoData: 'Nimic de exportat. Porneste un stream mai intai.',

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
  sectionAppSettings: 'Setari aplicatie',
  sectionLanguageSettings: 'Limba',
  sectionConnectionSettings: 'Conexiune',
  settingsCanFilter: 'Filtrare hardware CAN',
  settingsCanFilterHint:
    'Cere doar semnalele decodate de acest profil, ca adaptorul sa nu fie inundat de tot bus-ul. Dezactiveaza pentru a monitoriza fiecare cadru (debug).',
  settingsCanFilterOn: 'Pornit',
  settingsCanFilterOff: 'Oprit',
  sectionSignalSelection: 'Selectie semnale',
  signalSelectionHint: 'Alege ce grupuri de semnale sa polezi. Mai putine grupuri = reimprospatare mai rapida.',
  signalSelectionRefresh: 'Reimprospatare completa ≈ {value} · {count} grupuri',
  signalSelectionSelectAll: 'Toate',
  signalSelectionSelectNone: 'Niciunul',
  signalSelectionCore: 'Principale',
  signalSelectionHv: 'HV / baterie',
  profileModel3yName: 'Model 3 / Y',
  profileModel3yDesc: 'Profil telemetrie pentru Model 3 si Model Y.',
  profileModelsxName: 'Model S / X (2015-2021)',
  profileModelsxDesc: 'Profil telemetrie legacy pentru Model S/X.',

  actionDiscover: 'Descopera',
  actionGoHv: 'Baterie HV',
  actionViewErrors: 'Erori',
  actionClearErrors: 'Sterge',

  modelNameUnknown: 'Tesla Model --',
  modelDisconnectedHint: 'Conecteaza adaptorul pentru detectie model',

  dashboardWidgetPackVoltage: 'Tensiune baterie',
  dashboardWidgetPackCurrent: 'Curent baterie',
  dashboardWidgetHvPower: 'Putere baterie',
  dashboardWidgetIdealRange: 'Autonomie ideala',
  dashboardWidgetSystem12v: 'Sistem 12V',
  dashboardWidgetSystem16v: 'Sistem 16V',
  dashboardWidgetVehicleSpeed: 'Viteza',
  dashboardWidgetBatterySoc: 'SoC baterie',
  statusOk: 'OK',
  statusLow: 'SCAZUT',
  statusHigh: 'RIDICAT',
  statusNoData: 'FARA DATE',

  sectionBluetoothAdapters: 'Adaptoare Bluetooth',
  actionScanAdapters: 'Scaneaza adaptoare',
  noAdapters: 'Nu au fost gasite adaptoare.',
  rssiLabel: 'RSSI {value}',
  actionConnect: 'Conecteaza',
  connectedState: 'Conectat',
  genericNotAvailable: 'n/a',

  modelNameModel3: 'Tesla Model 3',
  modelNameModelY: 'Tesla Model Y',
  modelNameModelS: 'Tesla Model S',
  modelNameModelX: 'Tesla Model X',
  modelNameModelSx: 'Tesla Model S / X',
  modelNameModel3y: 'Tesla Model 3 / Y',

  sectionManualCommands: 'Comenzi manuale adaptor',
  commandPlaceholder: 'ATI, ATRV, 0100',
  actionSend: 'Trimite',
  commandRequiresAdapter: 'Conecteaza un adaptor inainte de comenzi.',
  commandBlockedWhileStreaming: 'Opreste stream-ul live inainte de a trimite comenzi.',
  commandEmptyResponse: '<raspuns gol>',
  commandErrorPrefix: 'EROARE',

  errorsCurrentTitle: 'Erori curente',
  errorsStoredCount: '{count} erori stocate',
  errorsNoneStored: 'Nu exista erori stocate.',
  errorLoggedAt: 'Inregistrat la {time}',

  exitAppTitle: 'Inchidere aplicatie',
  exitAppMessage: 'Vrei sa inchizi Tescanner?',
  exitAppCancel: 'Renunta',
  exitAppConfirm: 'Inchide',

  sectionRawCan: 'Linii CAN brute recente',
  waitingTraffic: 'Se asteapta trafic.',

  dashboardLocation: 'Locatie',
  dashboardCharging: 'Incarcare',
  dashboardSessionLive: 'Sesiune activa in timp real',
  dashboardWaitingStream: 'Asteptare stream',
  dashboardBatteryTemperature: 'Temperatura baterie',
  dashboardClimateInterior: 'Clima interior',
  dashboardPowertrain: 'Propulsie',
  dashboardTelemetry: 'Telemetrie',
  dashboardSignalsCount: '{value} semnale',

  errBluetoothDenied: 'Permisiunea Bluetooth a fost refuzata.',
  errSystemNotReady: 'Sistemul nu este pregatit pentru streaming.',
  errSwitchProfileIdle: 'Schimba profilul doar in stare inactiva. Deconecteaza si opreste stream-ul.',
  errAdapterNotConnected: 'Adaptorul nu este conectat.',
  errCommandWhileStreaming: 'Opreste stream-ul live inainte de a trimite comenzi.',
  errNoPollSelection: 'Selecteaza cel putin un grup de semnale pentru streaming.',

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
    case 'Stop the live stream before sending commands.':
      return translate(locale, 'errCommandWhileStreaming');
    case 'Select at least one signal group to stream.':
      return translate(locale, 'errNoPollSelection');
    default:
      return rawError;
  }
}
