import {
  BleManager,
  Characteristic,
  Device,
  ScanMode,
  State,
  type ScanOptions,
  type Subscription,
} from 'react-native-ble-plx';
import { PermissionsAndroid, Platform } from 'react-native';
import { Buffer } from 'buffer';

export interface BleDeviceInfo {
  id: string;
  name: string;
  localName?: string | null;
  rssi?: number | null;
}

export interface BleConnectionState {
  connected: boolean;
  deviceName?: string;
  deviceId?: string;
}

const DEFAULT_SCAN_TIMEOUT_MS = 12_000;

export class VLinkerBleClient {
  private readonly manager = new BleManager();
  private connectedDevice: Device | null = null;
  private writeCharacteristic: Characteristic | null = null;
  private notifyCharacteristic: Characteristic | null = null;

  private monitorSubscription: Subscription | null = null;
  private disconnectSubscription: Subscription | null = null;

  private lineListener?: (line: string) => void;
  private logger?: (message: string) => void;
  private readBuffer = '';

  /** Receives human-readable scan/connect events for the in-app console log. */
  setLogger(logger?: (message: string) => void): void {
    this.logger = logger;
  }

  private log(message: string): void {
    this.logger?.(message);
  }

  async requestPermissions(): Promise<boolean> {
    if (Platform.OS !== 'android') {
      return true;
    }

    if (Platform.Version < 31) {
      const fineLocation = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      );
      return fineLocation === PermissionsAndroid.RESULTS.GRANTED;
    }

    const result = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    ]);

    return (
      result[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === PermissionsAndroid.RESULTS.GRANTED &&
      result[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === PermissionsAndroid.RESULTS.GRANTED
    );
  }

  async waitForPoweredOn(timeoutMs = 10_000): Promise<void> {
    const currentState = await this.manager.state();
    if (currentState === State.PoweredOn) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        subscription.remove();
        reject(new Error('Bluetooth adapter did not power on in time.'));
      }, timeoutMs);

      const subscription = this.manager.onStateChange((state) => {
        if (state === State.PoweredOn) {
          clearTimeout(timeout);
          subscription.remove();
          resolve();
        }
      }, true);
    });
  }

  setLineListener(listener?: (line: string) => void): void {
    this.lineListener = listener;
  }

  startScan(
    onDeviceDiscovered: (device: BleDeviceInfo) => void,
    options?: {
      timeoutMs?: number;
      /** Names here are only used to highlight likely adapters, never to exclude devices. */
      filterNames?: string[];
      scanOptions?: ScanOptions;
      onScanComplete?: (deviceCount: number) => void;
    },
  ): () => void {
    const timeoutMs = options?.timeoutMs ?? DEFAULT_SCAN_TIMEOUT_MS;
    const preferredNames = (options?.filterNames ?? []).map((name) => name.toLowerCase());
    // Track the best name seen per device so late-arriving names (often only in the
    // scan response) get reported without spamming the UI on every advertisement.
    const reportedNames = new Map<string, string>();

    let timer: ReturnType<typeof setTimeout> | null = null;
    let completed = false;

    const complete = () => {
      if (completed) {
        return;
      }
      completed = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      this.stopScan();
      this.log(`Scan stopped — ${reportedNames.size} device(s) seen.`);
      options?.onScanComplete?.(reportedNames.size);
    };

    // allowDuplicates + low-latency so names/RSSI that arrive after the first
    // advertisement are still captured; many OBD dongles advertise no name initially.
    const scanOptions: ScanOptions =
      options?.scanOptions ?? { allowDuplicates: true, scanMode: ScanMode.LowLatency };

    this.log('Scanning for BLE devices (all devices shown)…');
    this.manager.startDeviceScan(null, scanOptions, (error, device) => {
      if (error) {
        this.log(`Scan error: ${error.message ?? String(error)}`);
        return;
      }
      if (!device?.id) {
        return;
      }

      const name = device.name ?? device.localName ?? '';
      const previous = reportedNames.get(device.id);
      const firstSight = previous === undefined;

      // Re-report only when a name first appears for a device we already listed.
      if (!firstSight && (name === '' || name === previous)) {
        return;
      }
      reportedNames.set(device.id, name !== '' ? name : (previous ?? ''));

      if (firstSight) {
        const preferred = name !== '' && preferredNames.some((hint) => name.toLowerCase().includes(hint));
        this.log(`Found ${name || '(no name)'} [${device.id}] rssi=${device.rssi ?? '?'}${preferred ? ' ★' : ''}`);
      }

      onDeviceDiscovered({
        id: device.id,
        name: name !== '' ? name : 'Unknown device',
        localName: device.localName,
        rssi: device.rssi,
      });
    });

    timer = setTimeout(complete, timeoutMs);

    return complete;
  }

  stopScan(): void {
    this.manager.stopDeviceScan();
  }

  async connect(deviceId: string): Promise<BleConnectionState> {
    await this.waitForPoweredOn();

    this.stopScan();
    await this.disconnect();

    const connected = await this.manager.connectToDevice(deviceId, {
      autoConnect: false,
      timeout: 10_000,
    });

    this.log('Link established, discovering services…');
    const ready = await connected.discoverAllServicesAndCharacteristics();

    const services = await ready.services();
    const characteristics: Characteristic[] = [];

    for (const service of services) {
      const serviceCharacteristics = await service.characteristics();
      characteristics.push(...serviceCharacteristics);
    }

    this.log(`Found ${characteristics.length} characteristic(s) in ${services.length} service(s).`);

    this.notifyCharacteristic =
      characteristics.find((characteristic) => characteristic.isNotifiable) ||
      characteristics.find((characteristic) => characteristic.isIndicatable) ||
      null;

    this.writeCharacteristic =
      characteristics.find((characteristic) => characteristic.isWritableWithoutResponse) ||
      characteristics.find((characteristic) => characteristic.isWritableWithResponse) ||
      null;

    if (!this.writeCharacteristic || !this.notifyCharacteristic) {
      this.log('No notify/write characteristics found — not an OBD serial adapter?');
      throw new Error('Could not find matching read/write BLE characteristics on adapter.');
    }

    this.log(
      `Using notify ${this.notifyCharacteristic.uuid.slice(0, 8)} / write ${this.writeCharacteristic.uuid.slice(0, 8)}.`,
    );
    this.connectedDevice = ready;
    this.attachDisconnectListener(ready);
    this.attachNotificationMonitor(ready, this.notifyCharacteristic);

    return {
      connected: true,
      deviceId: ready.id,
      deviceName: ready.name ?? ready.localName ?? 'Unknown device',
    };
  }

  private attachDisconnectListener(device: Device): void {
    this.disconnectSubscription?.remove();
    this.disconnectSubscription = device.onDisconnected((_error, disconnectedDevice) => {
      if (disconnectedDevice?.id === this.connectedDevice?.id) {
        this.log('Adapter disconnected.');
        this.connectedDevice = null;
        this.writeCharacteristic = null;
        this.notifyCharacteristic = null;
        this.monitorSubscription?.remove();
        this.monitorSubscription = null;
      }
    });
  }

  private attachNotificationMonitor(device: Device, characteristic: Characteristic): void {
    this.monitorSubscription?.remove();

    this.monitorSubscription = this.manager.monitorCharacteristicForDevice(
      device.id,
      characteristic.serviceUUID,
      characteristic.uuid,
      (error, update) => {
        if (error || !update?.value) {
          return;
        }

        const chunk = Buffer.from(update.value, 'base64').toString('utf8');
        this.pushChunk(chunk);
      },
    );
  }

  private pushChunk(chunk: string): void {
    const normalized = chunk.replace(/>/g, '\n>\n');
    this.readBuffer += normalized;

    const lines = this.readBuffer.split(/\r|\n/);
    this.readBuffer = lines.pop() ?? '';

    for (const line of lines) {
      const cleaned = line.trim();
      if (cleaned) {
        this.lineListener?.(cleaned);
      }
    }
  }

  async write(command: string): Promise<void> {
    if (!this.connectedDevice || !this.writeCharacteristic) {
      throw new Error('No BLE device is connected.');
    }

    const payload = Buffer.from(command, 'utf8').toString('base64');

    if (this.writeCharacteristic.isWritableWithoutResponse) {
      await this.manager.writeCharacteristicWithoutResponseForDevice(
        this.connectedDevice.id,
        this.writeCharacteristic.serviceUUID,
        this.writeCharacteristic.uuid,
        payload,
      );
      return;
    }

    await this.manager.writeCharacteristicWithResponseForDevice(
      this.connectedDevice.id,
      this.writeCharacteristic.serviceUUID,
      this.writeCharacteristic.uuid,
      payload,
    );
  }

  async disconnect(): Promise<void> {
    this.monitorSubscription?.remove();
    this.monitorSubscription = null;

    this.disconnectSubscription?.remove();
    this.disconnectSubscription = null;

    if (this.connectedDevice) {
      try {
        await this.manager.cancelDeviceConnection(this.connectedDevice.id);
      } catch {
        // Ignore disconnection errors when already disconnected.
      }
    }

    this.connectedDevice = null;
    this.writeCharacteristic = null;
    this.notifyCharacteristic = null;
    this.readBuffer = '';
  }

  async destroy(): Promise<void> {
    await this.disconnect();
    this.manager.destroy();
  }

  getConnectionState(): BleConnectionState {
    if (!this.connectedDevice) {
      return { connected: false };
    }

    return {
      connected: true,
      deviceId: this.connectedDevice.id,
      deviceName: this.connectedDevice.name ?? this.connectedDevice.localName ?? 'Unknown device',
    };
  }
}
