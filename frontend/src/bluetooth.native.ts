import { BleManager, type Device } from "@sfourdrinier/react-native-ble-plx";
import type { BluetoothDevice } from "./types";

const UART_SERVICE = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const UART_RX = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";
const manager = new BleManager();
let connectedDevice: Device | null = null;
let monitor: { remove: () => void } | null = null;

export const bluetooth = {
  isSupported: true,
  async scan(): Promise<BluetoothDevice[]> {
    return new Promise((resolve, reject) => {
      const devices = new Map<string, BluetoothDevice>();
      const timer = setTimeout(() => {
        manager.stopDeviceScan();
        resolve(Array.from(devices.values()));
      }, 5000);
      manager.startDeviceScan(null, { allowDuplicates: false }, (error, device) => {
        if (error) {
          clearTimeout(timer);
          manager.stopDeviceScan();
          reject(error);
          return;
        }
        if (device?.id && (device.name || device.localName)) {
          devices.set(device.id, { id: device.id, name: device.name ?? device.localName ?? "Gesture glove", rssi: device.rssi });
        }
      });
    });
  },
  async connect(deviceId: string) {
    connectedDevice = await manager.connectToDevice(deviceId, { timeout: 10000 });
    await connectedDevice.discoverAllServicesAndCharacteristics();
  },
  async disconnect() {
    monitor?.remove();
    monitor = null;
    if (connectedDevice) await manager.cancelDeviceConnection(connectedDevice.id);
    connectedDevice = null;
  },
  subscribe(listener: (value: string) => void) {
    if (!connectedDevice) return () => {};
    monitor = connectedDevice.monitorCharacteristicForService(UART_SERVICE, UART_RX, (error, characteristic) => {
      if (!error && characteristic?.value) {
        try {
          const decoded = globalThis.atob(characteristic.value);
          decoded.split(/[\r\n]+/).map((value) => value.trim()).filter(Boolean).forEach(listener);
        } catch {
          listener(characteristic.value);
        }
      }
    });
    return () => monitor?.remove();
  },
};