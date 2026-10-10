import type { BluetoothDevice } from "./types";

export const bluetooth = {
  isSupported: false,
  isExpoGo: false,
  async scan(): Promise<BluetoothDevice[]> {
    return [];
  },
  async connect(_deviceId: string) {
    throw new Error("Bluetooth pairing needs the installed mobile app on a device.");
  },
  async disconnect() {},
  subscribe(_listener: (value: string) => void) {
    return () => {};
  },
};
