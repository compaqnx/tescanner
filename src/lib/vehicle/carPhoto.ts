import type { ImageSourcePropType } from 'react-native';
import type { HvNode } from '../systems/hvOverview';

/**
 * Optional photo of the user's own car for the HV overview screen. When set,
 * the HV components are drawn as blocks on top of the photo instead of on the
 * built-in drawn schematic.
 *
 * To enable: put the photo in assets/vehicles/ (side view, front of the car on
 * the LEFT, plain background, landscape), then set CAR_PHOTO below. Positions
 * are percentages of the photo (0-100, from its top-left corner) — the centre
 * of each component and the rectangle of the battery pack under the floor.
 */
export interface Point {
  x: number;
  y: number;
}

export interface CarPhotoConfig {
  source: ImageSourcePropType;
  /** Photo width / height. */
  aspect: number;
  /** Battery pack between the axles (rectangle, % of the photo). */
  pack: { left: number; top: number; width: number; height: number };
  /** Centre of each component block (% of the photo). */
  components: Record<HvNode['id'], Point>;
  /** Height (% of the photo) of the HV bus line drawn along the pack. */
  busY: number;
}

// Preset A — side photo of your own car (front on the LEFT); adjust to your shot:
// export const CAR_PHOTO: CarPhotoConfig | null = {
//   source: require('../../../assets/vehicles/my-car-side.jpg'),
//   aspect: 2.2,
//   pack: { left: 28, top: 70, width: 44, height: 8 },
//   components: {
//     compressor: { x: 10, y: 52 },
//     frontDu: { x: 19, y: 70 },
//     heater: { x: 38, y: 50 },
//     pcs: { x: 62, y: 50 },
//     rearDu: { x: 81, y: 70 },
//   },
//   busY: 79,
// };
//
// Preset B — the 380x267 top-down Model X diagram from the owner's manual (front
// on the RIGHT). It is Tesla's artwork: keep it out of the public repo.
// export const CAR_PHOTO: CarPhotoConfig | null = {
//   source: require('../../../assets/vehicles/hv-modelx-top.png'),
//   aspect: 380 / 267,
//   pack: { left: 22, top: 33, width: 50, height: 34 },
//   components: {
//     rearDu: { x: 16, y: 50 },
//     pcs: { x: 30, y: 66 },
//     heater: { x: 62, y: 33 },
//     frontDu: { x: 82, y: 50 },
//     compressor: { x: 92, y: 36 },
//   },
//   busY: 50,
// };
export const CAR_PHOTO: CarPhotoConfig | null = null;
