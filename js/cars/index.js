// cars/index.js — 車型建構器註冊表 (builder id → build 函式)
// 每個 build(def) 回傳 { mesh, parts:{bodyGroup, wheels, rimMatRear?, wheelRadius,
//   tailMat?, tailMidMat?, brakeLight?, underglow?, headlights, headlightPool?} }
import { build as gt } from './gt.js';
import { build as f1 } from './f1.js';
import { build as evsport } from './evsport.js';
import { build as rally } from './rally.js';
import { build as pickup } from './pickup.js';
import { build as taxi } from './taxi.js';
import { build as evcity } from './evcity.js';
import { build as suv } from './suv.js';

export const CAR_BUILDERS = { gt, f1, evsport, rally, pickup, taxi, evcity, suv };
