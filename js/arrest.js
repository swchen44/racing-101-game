// arrest.js — 緝凶追捕:逮捕過場動畫 (驗收重點)
// 翻車 → 鏡頭拉近定格 → 警車滑停 → 警察小人下車走近 → 小偷舉手就逮
// 對外:runArrestCutscene(opts) 建立控制器存於 window.__arrest;main 的主迴圈每幀呼叫 update。
import * as THREE from 'three';
import { radialGlowTexture } from './taipei101.js';

// ---- 程序化小人 (低多邊,夜間可讀:布料略帶自發光 rim) ----
function makeFigure(bodyColor, { handsUp = false, scale = 1.35 } = {}) {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0xf0c79a, roughness: 0.6, emissive: 0x3a2a1c, emissiveIntensity: 0.5 });
  const cloth = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.55, metalness: 0.05, emissive: bodyColor, emissiveIntensity: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2f3a, roughness: 0.7, emissive: 0x10141c, emissiveIntensity: 0.5 });
  // 身體 (膠囊)
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.44, 4, 8), cloth);
  torso.position.y = 0.74; g.add(torso);
  // 頭
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), skin);
  head.position.y = 1.18; g.add(head);
  // 腿 ×2
  const legGeo = new THREE.CapsuleGeometry(0.08, 0.36, 3, 6);
  for (const sx of [-0.1, 0.1]) {
    const leg = new THREE.Mesh(legGeo, dark);
    leg.position.set(sx, 0.28, 0); g.add(leg);
  }
  // 手臂 ×2 (可舉高)
  const armGeo = new THREE.CapsuleGeometry(0.065, 0.36, 3, 6);
  const arms = [];
  for (const sx of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * 0.24, 0.98, 0);
    const arm = new THREE.Mesh(armGeo, cloth);
    arm.position.y = -0.18; pivot.add(arm);
    pivot.rotation.z = handsUp ? sx * 2.5 : sx * 0.18;
    g.add(pivot); arms.push(pivot);
  }
  g.scale.setScalar(scale);
  g.userData.arms = arms;
  g.userData.handsUp = handsUp;
  return g;
}

export function runArrestCutscene(opts) {
  const { scene, camera, chaseCam, car, chase, role, target, onDone } = opts;
  const dur = 4.6;
  let t = 0;
  const figures = [];
  const _v = new THREE.Vector3();

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
  const copFig = makeFigure(0x1c2a4a);   // 深藍制服
  const copStart = (role === 'cop')
    ? new THREE.Vector3(car.pos.x, 0, car.pos.z).addScaledVector(fwd, -0.5)
    : focus.clone().addScaledVector(fwd, 6).addScaledVector(side, 1.5);
  const copEnd = focus.clone().addScaledVector(fwd, 1.9).addScaledVector(side, 0.7);
  copFig.position.copy(copStart);
  copFig.rotation.y = focusYaw;
  copFig.visible = false;
  scene.add(copFig); figures.push(copFig);

  // 小偷小人 (舉手投降,站在殘骸旁)
  const thiefFig = makeFigure(0x6a2020, { handsUp: true });
  thiefFig.position.copy(focus.clone().addScaledVector(side, -0.9).setY(0));
  thiefFig.rotation.y = focusYaw + Math.PI; // 面向警察
  thiefFig.visible = false;
  scene.add(thiefFig); figures.push(thiefFig);

  const easeInOut = (k) => k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;

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
        // 定格後極慢環繞 + 微推近
        const orbit = (k - 0.4) * 0.42;
        const r = 4.4 - (k - 0.4) * 0.8;
        camera.position.set(
          focus.x + Math.sin(focusYaw + 0.5 + orbit) * r,
          1.35 + (k - 0.4) * 0.5,
          focus.z + Math.cos(focusYaw + 0.5 + orbit) * r);
      }
      camera.fov = THREE.MathUtils.lerp(60, 40, easeInOut(k)); // 拉近 → 望遠壓縮
      camera.updateProjectionMatrix();
      camera.lookAt(focus.x, 0.7, focus.z);

      // 警燈紅藍交閃打在地面
      const flash = Math.floor(t * 6) % 2 === 0;
      redMat.opacity = flash ? 0.5 : 0.12;
      blueMat.opacity = flash ? 0.12 : 0.5;

      // 警察小人:20%~65% 走近 + 走路擺臂
      if (k > 0.2) {
        copFig.visible = true;
        const wk = THREE.MathUtils.clamp((k - 0.2) / 0.45, 0, 1);
        copFig.position.lerpVectors(copStart, copEnd, easeInOut(wk));
        copFig.lookAt(focus.x, 0.72, focus.z);
        // 擺臂 + 上下微晃 (走路)
        const step = Math.sin(t * 9) * (wk < 1 ? 0.5 : 0);
        copFig.userData.arms[0].rotation.z = 0.18 + step;
        copFig.userData.arms[1].rotation.z = -0.18 - step;
        copFig.position.y = Math.abs(Math.sin(t * 9)) * (wk < 1 ? 0.04 : 0);
      }
      // 小偷小人:35% 起現身,舉手微微顫抖
      if (k > 0.35) {
        thiefFig.visible = true;
        const tremble = Math.sin(t * 14) * 0.06;
        thiefFig.userData.arms[0].rotation.z = 2.5 + tremble;
        thiefFig.userData.arms[1].rotation.z = -2.5 - tremble;
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
