import { DEFAULT_VEHICLE_PROFILE_ID, getVehicleProfileById } from './vehicleProfiles';

export interface WatchSignal {
  signalName: string;
  label: string;
}

const defaultProfile = getVehicleProfileById(DEFAULT_VEHICLE_PROFILE_ID);

export const DEFAULT_WATCH_SIGNALS: WatchSignal[] = defaultProfile.aliases.map((alias) => ({
  signalName: alias.canonicalName,
  label: alias.label,
}));
