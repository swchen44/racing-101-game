// cars/index.js — 車型建構器註冊表 (builder id → build 函式)
// 每個 build(def) 回傳 { mesh, parts:{bodyGroup, wheels, rimMatRear?, wheelRadius,
//   tailMat?, tailMidMat?, brakeLight?, underglow?, headlights, headlightPool?} }
import { buildSourceVehicle } from '../cities/vehicles.js';
import { build as gt } from './gt.js';
import { build as f1 } from './f1.js';
import { build as evsport } from './evsport.js';
import { build as rally } from './rally.js';
import { build as pickup } from './pickup.js';
import { build as taxi } from './taxi.js';
import { build as evcity } from './evcity.js';
import { build as suv } from './suv.js';

export const CAR_BUILDERS = { gt, f1, evsport, rally, pickup, taxi, evcity, suv,
  source: (def) => buildSourceVehicle(def, def._cityLease) };

export function buildCar(def = {}, cityLease = null) {
  if (cityLease || def.sourceAssetId || def.builder === 'source') return buildSourceVehicle(def, cityLease);
  return (CAR_BUILDERS[def.builder] || CAR_BUILDERS.gt)(def);
}
