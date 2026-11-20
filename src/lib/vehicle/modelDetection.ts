import type { TranslationKey } from '../i18n/localization';
import type { SignalIndex } from '../systems/readSignals';

export type TeslaModelKey = 'model3' | 'modely' | 'models' | 'modelx';

export interface DetectedTeslaModel {
  key: TeslaModelKey;
  nameKey: TranslationKey;
  source: 'fallback' | 'profile' | 'device-name' | 'signal';
}

export const TESLA_MODEL_IMAGES: Record<TeslaModelKey, number> = {
  model3: require('../../../assets/vehicles/tesla_model3.png'),
  modely: require('../../../assets/vehicles/tesla_modely.png'),
  models: require('../../../assets/vehicles/tesla_models.png'),
  modelx: require('../../../assets/vehicles/tesla_modelx.png'),
};

export function detectTeslaModel(
  connected: boolean,
  selectedProfileId: string,
  selectedDeviceName: string | null,
  signalIndex: SignalIndex,
): DetectedTeslaModel {
  if (!connected) {
    return selectedProfileId === 'modelsx_2015_2021'
      ? { key: 'models', nameKey: 'modelNameModelSx', source: 'profile' }
      : { key: 'model3', nameKey: 'modelNameModel3y', source: 'profile' };
  }

  const deviceHint = (selectedDeviceName ?? '').toLowerCase();
  if (deviceHint.includes('model x') || deviceHint.includes('tesla x')) {
    return { key: 'modelx', nameKey: 'modelNameModelX', source: 'device-name' };
  }
  if (deviceHint.includes('model s') || deviceHint.includes('tesla s')) {
    return { key: 'models', nameKey: 'modelNameModelS', source: 'device-name' };
  }
  if (deviceHint.includes('model y') || deviceHint.includes('tesla y')) {
    return { key: 'modely', nameKey: 'modelNameModelY', source: 'device-name' };
  }
  if (deviceHint.includes('model 3') || deviceHint.includes('tesla 3')) {
    return { key: 'model3', nameKey: 'modelNameModel3', source: 'device-name' };
  }

  if (selectedProfileId === 'modelsx_2015_2021') {
    const wheelSignal = signalIndex.get('DI_tireTypeConfig');
    if (wheelSignal && wheelSignal.value > 1) {
      return { key: 'modelx', nameKey: 'modelNameModelX', source: 'signal' };
    }
    return { key: 'models', nameKey: 'modelNameModelSx', source: 'profile' };
  }

  // Pack energy cannot reliably tell a Model 3 Long Range from a Model Y, so the
  // profile keeps a combined label unless the adapter name reveals the model.
  return { key: 'model3', nameKey: 'modelNameModel3y', source: 'profile' };
}
