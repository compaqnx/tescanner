import {
  BleManager,
  Characteristic,
  Device,
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
  private readBuffer = '';

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
      filterNames?: string[];
      scanOptions?: ScanOptions;
    },
  ): () => void {
    const timeoutMs = options?.timeoutMs ?? DEFAULT_SCAN_TIMEOUT_MS;
    const expectedNames = (options?.filterNames ?? []).map((name) => name.toLowerCase());
    const seenIds = new Set<string>();

    let timer: ReturnType<typeof setTimeout> | null = null;

    this.manager.startDeviceScan(null, options?.scanOptions ?? null, (error, device) => {
      if (error || !device?.id) {
        return;
      }

      if (seenIds.has(device.id)) {
        return;
      }

      const deviceName = device.name ?? device.localName ?? '';
      const lowerName = deviceName.toLowerCase();
      if (expectedNames.length > 0 && !expectedNames.some((name) => lowerName.includes(name))) {
        return;
      }

      seenIds.add(device.id);
      onDeviceDiscovered({
        id: device.id,
        name: device.name ?? 'Unknown device',
        localName: device.localName,
        rssi: device.rssi,
      });
    });

    timer = setTimeout(() => {
      this.stopScan();
    }, timeoutMs);

    return () => {
      if (timer) {
        clearTimeout(timer);
      }
      this.stopScan();
    };
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

    const ready = await connected.discoverAllServicesAndCharacteristics();

    const services = await ready.services();
    const characteristics: Characteristic[] = [];

    for (const service of services) {
      const serviceCharacteristics = await service.characteristics();
      characteristics.push(...serviceCharacteristics);
    }

    this.notifyCharacteristic =
      characteristics.find((characteristic) => characteristic.isNotifiable) ||
      characteristics.find((characteristic) => characteristic.isIndicatable) ||
      null;

    this.writeCharacteristic =
      characteristics.find((characteristic) => characteristic.isWritableWithoutResponse) ||
      characteristics.find((characteristic) => characteristic.isWritableWithResponse) ||
      null;

    if (!this.writeCharacteristic || !this.notifyCharacteristic) {
      throw new Error('Could not find matching read/write BLE characteristics on adapter.');
    }

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
