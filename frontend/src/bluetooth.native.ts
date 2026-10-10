import Constants from "expo-constants";
import type { BluetoothDevice } from "./types";

// @sfourdrinier/react-native-ble-plx is a native module that is NOT bundled
// into the public Expo Go runtime. If a user opens the Connect tab inside
// Expo Go, importing it eagerly crashes the screen with:
//   "TurboModuleRegistry.getEnforcing(...): 'BlePlx' could not be found."
//
// We therefore gate the import on execution environment and wrap it in a
// try/catch so the tab remains usable (Wi-Fi + Demo + Camera demo still
// work) and the user gets a friendly explanation instead of a red screen.

const UART_SERVICE = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const UART_RX = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";

const isExpoGo =
  Constants.appOwnership === "expo" || Constants.executionEnvironment === "storeClient";

let manager: any = null;
let loadError: string | null = null;

if (!isExpoGo) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("@sfourdrinier/react-native-ble-plx");
    manager = new mod.BleManager();
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Bluetooth module failed to load";
  }
}

let connectedDevice: any = null;
let monitor: { remove: () => void } | null = null;

function ensureManager() {
  if (isExpoGo) {
    throw new Error(
      "Bluetooth isn't available in Expo Go. Generate a development or production build (Publish → Deploy → Generate build) to pair with the glove. In the meantime, you can use Wi-Fi, Demo Mode, or the Camera.",
    );
  }
  if (!manager) {
    throw new Error(
      loadError || "Bluetooth hardware is unavailable on this device.",
    );
  }
  return manager;
}

export const bluetooth = {
  isSupported: !isExpoGo && !!manager,
  isExpoGo,
  async scan(): Promise<BluetoothDevice[]> {
    const bleManager = ensureManager();
    return new Promise((resolve, reject) => {
      const devices = new Map<string, BluetoothDevice>();
      const timer = setTimeout(() => {
        bleManager.stopDeviceScan();
        resolve(Array.from(devices.values()));
      }, 5000);
      bleManager.startDeviceScan(null, { allowDuplicates: false }, (error: any, device: any) => {
        if (error) {
          clearTimeout(timer);
          bleManager.stopDeviceScan();
          reject(error);
          return;
        }
        if (device?.id && (device.name || device.localName)) {
          devices.set(device.id, {
            id: device.id,
            name: device.name ?? device.localName ?? "Gesture glove",
            rssi: device.rssi,
          });
        }
      });
    });
  },
  async connect(deviceId: string) {
    const bleManager = ensureManager();
    connectedDevice = await bleManager.connectToDevice(deviceId, { timeout: 10000 });
    await connectedDevice.discoverAllServicesAndCharacteristics();
  },
  async disconnect() {
    monitor?.remove();
    monitor = null;
    if (connectedDevice && manager) {
      await manager.cancelDeviceConnection(connectedDevice.id);
    }
    connectedDevice = null;
  },
  subscribe(listener: (value: string) => void) {
    if (!connectedDevice) return () => {};
    monitor = connectedDevice.monitorCharacteristicForService(
      UART_SERVICE,
      UART_RX,
      (error: any, characteristic: any) => {
        if (!error && characteristic?.value) {
          try {
            const decoded = globalThis.atob(characteristic.value);
            decoded
              .split(/[\r\n]+/)
              .map((value) => value.trim())
              .filter(Boolean)
              .forEach(listener);
          } catch {
            listener(characteristic.value);
          }
        }
      },
    );
    return () => monitor?.remove();
  },
};
