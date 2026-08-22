// arrest.js — 緝凶追捕:逮捕過場動畫 (驗收重點)
// 翻車 → 鏡頭拉近定格 → 警車滑停 → 警察小人下車走近 → 小偷舉手就逮
// 對外:runArrestCutscene(opts) 建立控制器存於 window.__arrest;main 的主迴圈每幀呼叫 update。
import * as THREE from 'three';
import { radialGlowTexture } from './taipei101.js';

// ---- 程序化人物 (低多邊,約 5.5 頭身卡通比例;夜間可讀:布料低 emissive + 反光帶) ----
// 骨架階層:g → body(腰部樞紐,可前傾/側傾/上下彈) → 軀幹/頸/頭/雙臂(肩→肘→手)
//                g → 雙腿(髖→膝→腳)。userData 存各關節樞紐供動畫驅動。
function makeFigure(kind, { scale = 1.06 } = {}) {
  const isCop = kind === 'cop';
  const g = new THREE.Group();

  // ---- 配色 ----
  const SKIN = 0xe6b489;
  const navy  = 0x243154;   // 警察深藍制服
  const hood  = 0x5c2731;   // 小偷暗紅連帽衫
  const clothCol = isCop ? navy : hood;
  const pantsCol = isCop ? 0x151a29 : 0x2c313d;
  const shoeCol  = 0x121218;
  const hairCol  = isCop ? 0x2c1d13 : 0x181310;

  const skin  = new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.72, emissive: 0x281808, emissiveIntensity: 0.32 });
  const cloth = new THREE.MeshStandardMaterial({ color: clothCol, roughness: 0.62, metalness: 0.04, emissive: clothCol, emissiveIntensity: 0.26 });
  const pants = new THREE.MeshStandardMaterial({ color: pantsCol, roughness: 0.72, emissive: pantsCol, emissiveIntensity: 0.2 });
  const shoe  = new THREE.MeshStandardMaterial({ color: shoeCol, roughness: 0.5, metalness: 0.2, emissive: 0x05060b, emissiveIntensity: 0.35 });
  const hair  = new THREE.MeshStandardMaterial({ color: hairCol, roughness: 0.85, emissive: 0x090604, emissiveIntensity: 0.28 });
  const dark  = new THREE.MeshStandardMaterial({ color: 0x0d0f16, roughness: 0.55, metalness: 0.15 });
  // 警察配件金色(徽章/警徽);小偷=淺色帽繩
  const accent = new THREE.MeshStandardMaterial({ color: isCop ? 0xe8c33a : 0xc2cad6, roughness: 0.4, metalness: 0.45, emissive: isCop ? 0x6a5210 : 0x363c46, emissiveIntensity: 0.6 });
  // 夜間可讀:警察=反光安全帶;小偷=帽繩微光。冷藍青色 rim。
  const rim   = new THREE.MeshStandardMaterial({ color: 0xa6ecff, roughness: 0.35, emissive: 0x3a7f9a, emissiveIntensity: 1.0 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0e, roughness: 0.4, emissive: 0x05050a, emissiveIntensity: 0.4 });

  const capsule = (r, l, m) => new THREE.Mesh(new THREE.CapsuleGeometry(r, l, 4, 8), m);
  const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  const cyl = (rt, rb, h, m, rs = 12) => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, rs), m);
  const sph = (r, m, ws = 12, hs = 10, ...rest) => new THREE.Mesh(new THREE.SphereGeometry(r, ws, hs, ...rest), m);

  // ---- 比例常數 ----
  const HIP = 0.9;          // 髖/腰部世界高
  const SH = 0.42;          // 肩(相對 body)
  const HEADY = 0.66;       // 頭中心(相對 body) → 世界 1.56,約 5.5 頭身

  // body:腰部樞紐(前傾/側傾/彈跳)
  const body = new THREE.Group();
  body.position.y = HIP;
  g.add(body);

  // ---- 軀幹 ----
  const torso = capsule(0.17, 0.34, cloth);
  torso.position.y = 0.22; body.add(torso);          // 髖→肩之間
  const pelvis = box(0.30, 0.16, 0.20, pants);
  pelvis.position.y = 0.04; body.add(pelvis);
  const chest = box(0.40, 0.16, 0.22, cloth);        // 肩線加寬
  chest.position.y = SH - 0.02; body.add(chest);
  // 肩部圓角
  for (const sx of [-1, 1]) {
    const shoulderPad = sph(0.10, cloth);
    shoulderPad.position.set(sx * 0.19, SH, 0); body.add(shoulderPad);
  }

  if (isCop) {
    // 反光安全帶(斜背)+ 腰帶 + 胸前警徽 + 肩章
    const sash = box(0.06, 0.44, 0.235, rim);
    sash.rotation.z = 0.5; sash.position.y = 0.24; body.add(sash);
    const belt = box(0.34, 0.05, 0.23, dark);
    belt.position.y = 0.02; body.add(belt);
    const buckle = box(0.05, 0.05, 0.02, accent);
    buckle.position.set(0, 0.02, 0.12); body.add(buckle);
    const badge = box(0.05, 0.06, 0.02, accent);
    badge.position.set(-0.1, 0.32, 0.11); body.add(badge);
    for (const sx of [-1, 1]) {                       // 肩章
      const ep = box(0.11, 0.03, 0.1, accent);
      ep.position.set(sx * 0.19, SH + 0.06, 0); body.add(ep);
    }
  } else {
    // 連帽衫:胸前口袋橫線 + 兩條帽繩(微光)
    const pocket = box(0.24, 0.02, 0.02, dark);
    pocket.position.set(0, 0.12, 0.15); body.add(pocket);
    for (const sx of [-1, 1]) {
      const str = capsule(0.012, 0.14, accent);
      str.position.set(sx * 0.05, 0.32, 0.13); body.add(str);
    }
  }

  // ---- 頸 ----
  const neck = cyl(0.06, 0.07, 0.08, skin);
  neck.position.y = 0.5; body.add(neck);

  // ---- 頭(可點頭) ----
  const headPivot = new THREE.Group();
  headPivot.position.y = HEADY; body.add(headPivot);
  const head = sph(0.145, skin, 14, 12);
  head.scale.set(1, 1.08, 0.98); headPivot.add(head);
  // 臉:雙眼 + 眉 + 鼻
  for (const sx of [-1, 1]) {
    const eye = box(0.028, 0.03, 0.02, eyeMat);
    eye.position.set(sx * 0.055, 0.02, 0.132); headPivot.add(eye);
    const brow = box(0.05, 0.014, 0.02, hair);
    brow.position.set(sx * 0.055, 0.06, 0.128); headPivot.add(brow);
  }
  const nose = box(0.03, 0.04, 0.03, skin);
  nose.position.set(0, -0.015, 0.145); headPivot.add(nose);

  if (isCop) {
    // 警帽(平頂大盤帽):帽冠 + 帽墻 + 帽舌 + 帽徽 + 後腦短髮
    const crown = cyl(0.15, 0.16, 0.1, cloth, 16);
    crown.position.y = 0.14; headPivot.add(crown);
    const top = cyl(0.155, 0.155, 0.02, cloth, 16);
    top.position.y = 0.19; headPivot.add(top);
    const band = cyl(0.162, 0.162, 0.035, dark, 16);
    band.position.y = 0.09; headPivot.add(band);
    const capBadge = box(0.045, 0.045, 0.02, accent);
    capBadge.position.set(0, 0.1, 0.155); headPivot.add(capBadge);
    const brim = box(0.26, 0.025, 0.13, dark);         // 帽舌
    brim.position.set(0, 0.075, 0.135); brim.rotation.x = 0.18; headPivot.add(brim);
    // 後腦/鬢角短髮
    const backHair = sph(0.15, hair, 12, 10, 0, Math.PI * 2, Math.PI * 0.42, Math.PI * 0.35);
    backHair.position.set(0, 0.01, -0.02); headPivot.add(backHair);
  } else {
    // 連帽:上半球罩住後腦(前開讓臉露出)+ 前額瀏海
    const hd = sph(0.2, cloth, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.6);
    hd.scale.set(1.05, 1.1, 1.15); hd.position.set(0, 0.0, -0.04); headPivot.add(hd);
    const hoodRim = new THREE.Mesh(new THREE.TorusGeometry(0.155, 0.03, 8, 16, Math.PI * 1.15), cloth);
    hoodRim.rotation.set(Math.PI * 0.5, 0, Math.PI * 0.5 - 0.35); hoodRim.position.set(0, 0.03, 0.08); headPivot.add(hoodRim);
    const fringe = box(0.22, 0.06, 0.06, hair);
    fringe.position.set(0, 0.11, 0.1); headPivot.add(fringe);
    // 頸後帽兜垂布
    const drape = box(0.26, 0.14, 0.06, cloth);
    drape.position.set(0, -0.02, -0.16); body.add(drape); // 用 body 相對(頸後)
    drape.position.y = 0.44;
  }

  // ---- 手臂(肩→肘→手) ----
  function makeArm(sx) {
    const shoulder = new THREE.Group();
    shoulder.position.set(sx * 0.2, SH, 0);
    const upper = capsule(0.06, 0.16, cloth); upper.position.y = -0.12; shoulder.add(upper);
    const elbow = new THREE.Group(); elbow.position.y = -0.25; shoulder.add(elbow);
    const fore = capsule(0.052, 0.15, cloth); fore.position.y = -0.11; elbow.add(fore);
    const wrist = cyl(0.05, 0.05, 0.03, skin); wrist.position.y = -0.22; elbow.add(wrist);
    const hand = box(0.075, 0.1, 0.055, skin); hand.position.y = -0.27; elbow.add(hand);
    const thumb = box(0.028, 0.05, 0.03, skin); thumb.position.set(sx * 0.045, -0.25, 0.01); elbow.add(thumb);
    shoulder.rotation.z = sx * 0.08;
    body.add(shoulder);
    return { shoulder, elbow, hand };
  }
  const armL = makeArm(-1);
  const armR = makeArm(1);

  // ---- 腿(髖→膝→腳)掛在 g,腳踩地 ----
  function makeLeg(sx) {
    const hip = new THREE.Group();
    hip.position.set(sx * 0.11, HIP, 0);
    const thigh = capsule(0.083, 0.2, pants); thigh.position.y = -0.19; hip.add(thigh);
    const knee = new THREE.Group(); knee.position.y = -0.42; hip.add(knee);
    const shin = capsule(0.07, 0.2, pants); shin.position.y = -0.17; knee.add(shin);
    const ankle = cyl(0.06, 0.06, 0.03, shoe); ankle.position.y = -0.36; knee.add(ankle);
    const foot = box(0.1, 0.08, 0.26, shoe); foot.position.set(0, -0.4, 0.06); knee.add(foot);
    const toe = box(0.1, 0.05, 0.06, shoe); toe.position.set(0, -0.41, 0.19); knee.add(toe);
    g.add(hip);
    return { hip, knee };
  }
  const legL = makeLeg(-1);
  const legR = makeLeg(1);

  g.scale.setScalar(scale);
  g.userData = { kind, body, headPivot, armL, armR, legL, legR };
  return g;
}

export function runArrestCutscene(opts) {
  const { scene, camera, chaseCam, car, chase, role, target, onDone } = opts;
  const dur = 4.6; // 過場總長 (定稿)
  let t = 0;
  const figures = [];

  // 焦點:cop 角色 = 翻車小偷位置;thief 角色 = 玩家車位置
  const focus = new THREE.Vector3();
  if (role === 'cop' && target) focus.copy(target.pos);
  else focus.set(car.pos.x, 0, car.pos.z);
  const focusYaw = role === 'cop' && target ? target.yaw : car.heading;

  // 相機起點 = 目前追逐機位;終點 = 低角度電影機位 (焦點側前方,更近更戲劇)
  const camStart = camera.position.clone();
  const side = new THREE.Vector3(Math.cos(focusYaw), 0, -Math.sin(focusYaw)); // 焦點右側
  const fwd = new THREE.Vector3(Math.sin(focusYaw), 0, Math.cos(focusYaw));
  const camEnd = focus.clone()
    .addScaledVector(fwd, 3.4)      // 焦點前方 (拉近)
    .addScaledVector(side, 2.3)     // 偏一側 → 3/4 構圖
    .setY(1.35);                    // 低角度

  // ---- 地面聚光:暖白圓池 + 紅藍警燈閃斑,把逮捕現場從夜色中托出 ----
  const spot = new THREE.Group();
  spot.position.set(focus.x, 0.05, focus.z);
  const poolMat = new THREE.MeshBasicMaterial({
    map: radialGlowTexture('#ffe9c8'), color: 0xffe9c8, transparent: true, opacity: 0.5,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  });
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(11, 11), poolMat);
  pool.rotation.x = -Math.PI / 2; spot.add(pool);
  const redMat = new THREE.MeshBasicMaterial({
    map: radialGlowTexture('#ff3355'), color: 0xff3355, transparent: true, opacity: 0.4,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  });
  const blueMat = new THREE.MeshBasicMaterial({
    map: radialGlowTexture('#3366ff'), color: 0x3366ff, transparent: true, opacity: 0.4,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  });
  const redPatch = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), redMat);
  redPatch.rotation.x = -Math.PI / 2; redPatch.position.set(-2.5, 0.02, 0); spot.add(redPatch);
  const bluePatch = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), blueMat);
  bluePatch.rotation.x = -Math.PI / 2; bluePatch.position.set(2.5, 0.02, 0); spot.add(bluePatch);
  scene.add(spot);

  // 警察小人 (cop 角色從玩家警車走出;thief 角色由 AI 警車走出,這裡簡化為在焦點旁生成)
  const copFig = makeFigure('cop');
  const copStart = (role === 'cop')
    ? new THREE.Vector3(car.pos.x, 0, car.pos.z).addScaledVector(fwd, -0.5)
    : focus.clone().addScaledVector(fwd, 6).addScaledVector(side, 1.5);
  const copEnd = focus.clone().addScaledVector(fwd, 1.95).addScaledVector(side, 0.7);
  copFig.position.copy(copStart);
  copFig.rotation.y = focusYaw;
  copFig.visible = false;
  scene.add(copFig); figures.push(copFig);

  // 小偷小人 (舉手投降,站在殘骸旁),面向來的警察
  const thiefFig = makeFigure('thief');
  thiefFig.position.copy(focus.clone().addScaledVector(side, -0.9).setY(0));
  thiefFig.lookAt(focus.x + fwd.x * 4, thiefFig.position.y, focus.z + fwd.z * 4);
  thiefFig.visible = false;
  scene.add(thiefFig); figures.push(thiefFig);

  const easeInOut = (k) => k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
  const clamp01 = (x) => Math.min(1, Math.max(0, x));
  const lerp = THREE.MathUtils.lerp;
  const _v = new THREE.Vector3();

  // 站立靜止姿(每幀從零計算,避免累積漂移)
  function resetPose(f) {
    const u = f.userData;
    u.body.rotation.set(0, 0, 0); u.body.position.y = 0.9;
    u.headPivot.rotation.set(0, 0, 0);
    for (const a of [u.armL, u.armR]) { a.shoulder.rotation.x = 0; a.elbow.rotation.x = 0; }
    u.armL.shoulder.rotation.z = -0.08; u.armR.shoulder.rotation.z = 0.08;
    for (const l of [u.legL, u.legR]) { l.hip.rotation.x = 0; l.knee.rotation.x = 0; }
  }

  const ctrl = {
    active: true,
    update(dt) {
      t += Math.min(0.05, dt);   // 夾住單幀:掉幀時過場不會瞬間跳完
      const k = Math.min(1, t / dur);

      // 相機:前 40% 拉近到定格機位,之後緩慢環繞焦點 (電影感)
      if (k < 0.4) {
        const kk = easeInOut(k / 0.4);
        camera.position.lerpVectors(camStart, camEnd, kk);
      } else {
        const orbit = (k - 0.4) * 0.42;
        const r = 4.4 - (k - 0.4) * 0.8;
        camera.position.set(
          focus.x + Math.sin(focusYaw + 0.5 + orbit) * r,
          1.35 + (k - 0.4) * 0.5,
          focus.z + Math.cos(focusYaw + 0.5 + orbit) * r);
      }
      camera.fov = THREE.MathUtils.lerp(60, 40, easeInOut(k));
      camera.updateProjectionMatrix();
      camera.lookAt(focus.x, 0.75, focus.z);

      // 警燈紅藍交閃打在地面
      const flash = Math.floor(t * 6) % 2 === 0;
      redMat.opacity = flash ? 0.5 : 0.12;
      blueMat.opacity = flash ? 0.12 : 0.5;

      // ===== 警察:走近 → 到位 → 指令手勢 =====
      resetPose(copFig);
      const cu = copFig.userData;
      const walkT = clamp01((k - 0.15) / 0.42);        // 走路進度
      const arrived = clamp01((k - 0.55) / 0.08);       // 到位收尾
      const gesture = clamp01((k - 0.63) / 0.15);       // 舉手指令
      if (k > 0.15) {
        copFig.visible = true;
        copFig.position.lerpVectors(copStart, copEnd, easeInOut(walkT));
        _v.set(focus.x, 0.72, focus.z); copFig.lookAt(_v);

        const moving = (1 - arrived);
        const ph = t * 8.5;
        // 對側步態:左腿 / 右臂 同相
        const legAmp = 0.62 * moving, armAmp = 0.5 * moving;
        cu.legL.hip.rotation.x = Math.sin(ph) * legAmp;
        cu.legR.hip.rotation.x = Math.sin(ph + Math.PI) * legAmp;
        cu.legL.knee.rotation.x = (0.5 + 0.5 * Math.sin(ph - 1.2)) * 0.95 * moving + 0.04;
        cu.legR.knee.rotation.x = (0.5 + 0.5 * Math.sin(ph + Math.PI - 1.2)) * 0.95 * moving + 0.04;
        cu.armL.shoulder.rotation.x = Math.sin(ph + Math.PI) * armAmp;
        cu.armR.shoulder.rotation.x = Math.sin(ph) * armAmp;
        cu.armL.elbow.rotation.x = 0.35 + 0.15 * moving;
        cu.armR.elbow.rotation.x = 0.35 + 0.15 * moving;
        // 軀幹隨步伐:上下彈 + 側傾 + 微前傾
        cu.body.position.y = 0.9 + Math.abs(Math.sin(ph)) * 0.03 * moving;
        cu.body.rotation.z = Math.sin(ph) * 0.05 * moving;
        cu.body.rotation.x = 0.06 * moving;

        // 到位後:鏡頭側(左)臂舉起、手肘外張成「不許動 / STOP」手掌(從警察背後也看得到剪影);右手扶腰帶
        if (gesture > 0) {
          const gz = easeInOut(gesture);
          cu.armL.shoulder.rotation.x = lerp(cu.armL.shoulder.rotation.x, -1.15, gz);
          cu.armL.shoulder.rotation.z = lerp(-0.08, -0.6, gz);   // 外張讓手臂離開身體剪影
          cu.armL.elbow.rotation.x = lerp(0.35, -1.15, gz);      // 前臂立起 → 舉掌
          cu.armR.shoulder.rotation.x = lerp(cu.armR.shoulder.rotation.x, -0.12, gz);
          cu.armR.elbow.rotation.x = lerp(0.35, 1.5, gz);        // 右手收到腰帶
          cu.headPivot.rotation.x = lerp(0, 0.08, gz);           // 微低頭盯著嫌犯
        }
      }

      // ===== 小偷:現身 → 雙手高舉顫抖 → 畏怯後縮下蹲低頭 =====
      resetPose(thiefFig);
      const tu = thiefFig.userData;
      if (k > 0.28) {
        thiefFig.visible = true;
        const raise = clamp01((k - 0.32) / 0.22);
        const rz = easeInOut(raise);
        const tremble = Math.sin(t * 17) * 0.05 * raise;
        // 雙手高舉(前上方,鏡頭看得到手)+ 顫抖
        tu.armL.shoulder.rotation.x = lerp(0, -2.75, rz) + tremble;
        tu.armR.shoulder.rotation.x = lerp(0, -2.75, rz) - tremble;
        tu.armL.shoulder.rotation.z = lerp(-0.08, -0.32, rz);
        tu.armR.shoulder.rotation.z = lerp(0.08, 0.32, rz);
        tu.armL.elbow.rotation.x = lerp(0.35, 0.12, rz);
        tu.armR.elbow.rotation.x = lerp(0.35, 0.12, rz);
        // 畏怯:身體後仰 + 屈膝下蹲(髖前傾+膝彎讓腰下沉)+ 低頭
        tu.body.rotation.x = lerp(0, -0.16, rz);
        tu.legL.hip.rotation.x = 0.28 * rz; tu.legR.hip.rotation.x = 0.28 * rz;
        tu.legL.knee.rotation.x = 0.5 * rz; tu.legR.knee.rotation.x = 0.5 * rz;
        tu.body.position.y = 0.9 - 0.02 * rz;
        tu.headPivot.rotation.x = lerp(0, 0.32, rz) + Math.sin(t * 13) * 0.03 * raise;
      }

      if (k >= 1) {
        ctrl.active = false;
        ctrl.dispose();
        onDone && onDone();
      }
    },
    dispose() {
      for (const f of figures) {
        scene.remove(f);
        f.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose?.(); });
      }
      scene.remove(spot);
      spot.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose?.(); });
      if (window.__arrest === ctrl) delete window.__arrest;
    },
  };
  window.__arrest = ctrl;
  return ctrl;
}
