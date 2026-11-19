import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import { getVehicleProfileById, VehicleProfileId } from '../config/vehicleProfiles';
import { parseDbc } from './parseDbc';
import { DbcDatabase } from './types';

const profileDbcPromises = new Map<VehicleProfileId, Promise<DbcDatabase>>();

function cloneDatabaseMessageSignals(source: DbcDatabase['messages']): DbcDatabase['messages'] {
  const result: DbcDatabase['messages'] = {};

  for (const [messageIdRaw, message] of Object.entries(source)) {
    const messageId = Number(messageIdRaw);
    result[messageId] = {
      ...message,
      signals: { ...message.signals },
    };
  }

  return result;
}

function mergeDatabases(databases: DbcDatabase[]): DbcDatabase {
  if (databases.length === 0) {
    return {
      messages: {},
      signalsByName: {},
    };
  }

  const mergedMessages = cloneDatabaseMessageSignals(databases[0].messages);

  for (let i = 1; i < databases.length; i += 1) {
    for (const [messageIdRaw, message] of Object.entries(databases[i].messages)) {
      const messageId = Number(messageIdRaw);
      const existingMessage = mergedMessages[messageId];

      if (!existingMessage) {
        mergedMessages[messageId] = {
          ...message,
          signals: { ...message.signals },
        };
        continue;
      }

      // Avoid combining unrelated definitions when two buses reuse the same CAN ID.
      if (existingMessage.name !== message.name) {
        continue;
      }

      mergedMessages[messageId] = {
        ...existingMessage,
        signals: {
          ...existingMessage.signals,
          ...message.signals,
        },
      };
    }
  }

  const signalsByName: DbcDatabase['signalsByName'] = {};
  for (const [messageIdRaw, message] of Object.entries(mergedMessages)) {
    const messageId = Number(messageIdRaw);
    for (const [signalName, signal] of Object.entries(message.signals)) {
      if (!signalsByName[signalName]) {
        signalsByName[signalName] = [];
      }

      signalsByName[signalName].push({
        messageId,
        signal,
      });
    }
  }

  return {
    messages: mergedMessages,
    signalsByName,
  };
}

async function loadDbcFromAsset(moduleAsset: number): Promise<DbcDatabase> {
  const asset = Asset.fromModule(moduleAsset);
  await asset.downloadAsync();

  const uri = asset.localUri ?? asset.uri;
  const file = new File(uri);
  const source = await file.text();

  return parseDbc(source);
}

export function loadVehicleDbc(profileId: VehicleProfileId): Promise<DbcDatabase> {
  const existingPromise = profileDbcPromises.get(profileId);
  if (existingPromise) {
    return existingPromise;
  }

  const profile = getVehicleProfileById(profileId);
  const assets = profile.dbcAssets;
  const promise = (async () => {
    const parsed = await Promise.all(assets.map((asset) => loadDbcFromAsset(asset)));
    return mergeDatabases(parsed);
  })();

  profileDbcPromises.set(profileId, promise);
  return promise;
}
