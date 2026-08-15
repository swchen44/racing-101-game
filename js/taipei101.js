// taipei101.js — 台北101 程序化模型:基座裙樓、8 節斗形塔身、塔尖、夜間打光
import * as THREE from 'three';

export const TOWER_POS = new THREE.Vector3(0, 0, -40);

function windowTexture(cols, rows, litRatio, tint) {
  // 玻璃帷幕:清晰的水平樓層帶 (細亮線 + 寬暗帶),重現 101 夜間的橫向節奏
  const W = 256, H = 512;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#041410'; // 未亮處近黑,避免糊成均勻綠柱
  g.fillRect(0, 0, W, H);
  const ch = H / rows;          // 每樓層高度
  const segW = W / cols;        // 每樓層水平分段寬
  for (let r = 0; r < rows; r++) {
    const lineY = Math.round(r * ch + ch * 0.18);
    // 樓層帶:細亮線 (2~3px),逐段隨機亮/暗,litRatio 控制亮段比例
    for (let s = 0; s < cols; s++) {
      const x = Math.round(s * segW) + 1;
      const w = Math.round(segW) - 2;
      if (Math.random() < litRatio) {
        // 三色層次:綠玻璃幕牆泛光 vs 暖白辦公室內光 (暖窗更亮、更厚,佔 0.35)
        const warm = Math.random() < 0.35;
        if (warm) {
          g.fillStyle = `rgba(255,${218 + Math.random() * 30 | 0},168,${0.92 + Math.random() * 0.08})`;
          g.fillRect(x, lineY - 1, w, 4);
        } else {
          g.fillStyle = `rgba(${tint[0]},${tint[1]},${tint[2]},${0.7 + Math.random() * 0.3})`;
          g.fillRect(x, lineY, w, 3);
        }
      } else if (Math.random() < 0.5) {
        // 微亮的殘光段,維持樓層帶連續感但明顯偏暗
        g.fillStyle = `rgba(${tint[0] >> 2},${tint[1] >> 2},${tint[2] >> 2},0.5)`;
        g.fillRect(x, lineY + 1, w, 2);
      }
    }
    // 每 5 層一條 2px 深色樓層分隔線,強化水平節奏
    if (r % 5 === 4) {
      g.fillStyle = 'rgba(0,6,4,0.95)';
      g.fillRect(0, Math.round((r + 1) * ch) - 1, W, 2);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8; // 消除運鏡時縱向拉伸造成的條紋閃爍/糊化
  return tex;
}

export function createTaipei101() {
  const group = new THREE.Group();

  // ---- 材質:翡翠綠玻璃帷幕 ----
  // 三色層次:綠玻璃幕牆 (中亮) + 暖白辦公窗 (最亮,貼圖內建) + 節冠金光 (bloom 簽名)
  const emissiveTex = windowTexture(16, 40, 0.3, [120, 255, 200]);
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x11362a,
    metalness: 0.85, roughness: 0.18,
    emissive: 0xd9ffe9, emissiveMap: emissiveTex, emissiveIntensity: 1.2,
    envMapIntensity: 1.8,
  });
  // 節間橫向燈帶:高 emissive + toneMapped:false 讓 bloom 咬住,300m 外仍是亮環
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0x8fa8a0, metalness: 0.9, roughness: 0.3,
    emissive: 0x33ffbb, emissiveIntensity: 2.6, toneMapped: false,
  });
  // 節冠金色亮邊 (每節頂端外緣一圈,吃 bloom 後成為 101 的招牌節冠泛光)
  const crownEdgeMat = new THREE.MeshStandardMaterial({
    color: 0xffd27f, metalness: 0.6, roughness: 0.4,
    emissive: 0xffd27f, emissiveIntensity: 3.0,
  });
  // 如意飾:加大加亮,讓輪廓特徵 200m 外仍可讀
  const ruyiMat = new THREE.MeshStandardMaterial({
    color: 0xd9b45b, metalness: 0.85, roughness: 0.35,
    emissive: 0xffca55, emissiveIntensity: 0.9,
  });

  // ---- 裙樓基座 (倒角方塔, 4 層階梯) ----
  const podiumMat = new THREE.MeshStandardMaterial({
    color: 0x28343a, metalness: 0.5, roughness: 0.4,
    emissive: 0x77ddff, emissiveIntensity: 0.06,
  });
  let py = 0;
  const podiumTiers = [[62, 14], [54, 10], [46, 10]];
  for (const [w, h] of podiumTiers) {
    const tier = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), podiumMat);
    tier.position.y = py + h / 2;
    tier.castShadow = true;
    group.add(tier);
    py += h;
  }

  // ---- 塔身核心柱 (基部) ----
  const baseH = 46;
  const base = new THREE.Mesh(makeTaperBox(30, 24, baseH), glassMat);
  base.position.y = py + baseH / 2;
  base.castShadow = true;
  group.add(base);
  let y = py + baseH;

  // ---- 8 節斗形樓層 (每節上寬下窄,如意造型) ----
  // 收邊環/節冠亮邊/如意飾全部 instanced,各佔 1 個 draw call
  const SEG_H = 26.5;
  const SEG_BOTTOM = 21, SEG_TOP = 27.5;
  const trimRings = new THREE.InstancedMesh(
    new THREE.BoxGeometry(SEG_TOP + 1.4, 1.4, SEG_TOP + 1.4), trimMat, 8);
  const crownEdges = new THREE.InstancedMesh(
    new THREE.BoxGeometry(SEG_TOP + 2.2, 0.45, SEG_TOP + 2.2), crownEdgeMat, 8);
  const ruyis = new THREE.InstancedMesh(
    new THREE.TorusGeometry(1.8, 0.5, 8, 16), ruyiMat, 32);
  const m4 = new THREE.Matrix4();
  const rotZero = new THREE.Quaternion();
  const rotY90 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
  const one = new THREE.Vector3(1, 1, 1);
  let ruyiIdx = 0;
  const waistPts = []; // 每節收腰處 8 點輪廓光暈 (單一 Points → 1 draw call)
  for (let i = 0; i < 8; i++) {
    const seg = new THREE.Mesh(makeTaperBox(SEG_BOTTOM, SEG_TOP, SEG_H), glassMat);
    seg.position.y = y + SEG_H / 2;
    seg.castShadow = true;
    group.add(seg);

    // 斗形收腰處一圈 8 點小光暈:4 角 + 4 面中點,模擬 101 分節輪廓照明
    {
      const hw = SEG_BOTTOM / 2 + 0.7;
      const wy = y + 1.6;
      for (const [px, pz] of [[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
        waistPts.push(px * hw, wy, pz * hw);
      }
    }

    // 節間收邊環 + 節頂外緣金色亮邊 (節冠泛光)
    m4.compose(new THREE.Vector3(0, y + SEG_H + 0.4, 0), rotZero, one);
    trimRings.setMatrixAt(i, m4);
    m4.compose(new THREE.Vector3(0, y + SEG_H - 0.65, 0), rotZero, one);
    crownEdges.setMatrixAt(i, m4);

    // 每節四面的「如意」裝飾圓飾
    const half = SEG_TOP / 2 + 0.55;
    for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      m4.compose(
        new THREE.Vector3(sx * half, y + SEG_H - 4.0, sz * half),
        sx !== 0 ? rotY90 : rotZero, one);
      ruyis.setMatrixAt(ruyiIdx++, m4);
    }
    y += SEG_H + 0.8;
  }
  trimRings.instanceMatrix.needsUpdate = true;
  crownEdges.instanceMatrix.needsUpdate = true;
  ruyis.instanceMatrix.needsUpdate = true;
  group.add(trimRings, crownEdges, ruyis);

  // 收腰輪廓光暈:64 點共用一張 radialGlowTexture、一個材質、一個 draw call
  const waistGeo = new THREE.BufferGeometry();
  waistGeo.setAttribute('position', new THREE.Float32BufferAttribute(waistPts, 3));
  const waistHalo = new THREE.Points(waistGeo, new THREE.PointsMaterial({
    map: radialGlowTexture('#5cffbe'), color: 0xbfffe4,
    size: 10, sizeAttenuation: true,
    transparent: true, opacity: 0.55,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  }));
  group.add(waistHalo);

  // ---- 頂部收束塔樓 ----
  const crown = new THREE.Mesh(makeTaperBox(17, 12, 20), glassMat);
  crown.position.y = y + 10;
  group.add(crown);
  y += 20;
  // 頂樓收束塔用較收斂的燈帶材質 (避免整塊實心體被 toneMapped:false 高 emissive 打爆)
  const crown2Mat = trimMat.clone();
  crown2Mat.emissiveIntensity = 1.0;
  crown2Mat.toneMapped = true;
  const crown2 = new THREE.Mesh(makeTaperBox(11, 7, 12), crown2Mat);
  crown2.position.y = y + 6;
  group.add(crown2);
  y += 12;

  // ---- 塔尖 ----
  const spireMat = new THREE.MeshStandardMaterial({
    color: 0xbcd8d0, metalness: 0.95, roughness: 0.25,
    emissive: 0xaaffe0, emissiveIntensity: 1.2,
  });
  const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 2.6, 42, 8), spireMat);
  spire.position.y = y + 21;
  group.add(spire);
  y += 42;

  // 航空警示燈 (紅色, sin 呼吸閃爍 emissiveIntensity 0~6, 吃 bloom 成為地標信標)
  const beaconMat = new THREE.MeshStandardMaterial({
    color: 0x330508, emissive: 0xff2233, emissiveIntensity: 3,
  });
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(1.6, 12, 10), beaconMat);
  beacon.position.y = y + 1;
  group.add(beacon);
  const beaconGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: radialGlowTexture('#ff3344'), transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  }));
  beaconGlow.scale.setScalar(18);
  beaconGlow.position.y = y + 1;
  group.add(beaconGlow);

  // ---- 塔身泛光 (夜間彩色打光,今晚:翡翠綠) ----
  // 拆成上下兩張 sprite:下亮上暗,模擬底部打光沿塔身向上衰減
  const floodMap = radialGlowTexture('#2edb96');
  const floodGlowLow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: floodMap, transparent: true, opacity: 0.34,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  }));
  floodGlowLow.scale.set(200, 260, 1);
  floodGlowLow.position.y = 140;
  group.add(floodGlowLow);
  const floodGlowHigh = new THREE.Sprite(new THREE.SpriteMaterial({
    map: floodMap, transparent: true, opacity: 0.15,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  }));
  floodGlowHigh.scale.set(150, 260, 1);
  floodGlowHigh.position.y = 315;
  group.add(floodGlowHigh);

  // 底部上射泛光燈 (2 盞對角,取代原 4 盞,守住光源預算並負責塑形斗身體塊)
  for (const [sx, sz] of [[1, 1], [-1, -1]]) {
    const up = new THREE.SpotLight(0x2edb96, 5200, 340, 0.36, 0.65, 1.15);
    up.position.set(sx * 32, 34, sz * 32);
    const tgt = new THREE.Object3D();
    tgt.position.set(sx * 10, 260, sz * 10);
    group.add(tgt);
    up.target = tgt;
    group.add(up);
  }

  group.position.copy(TOWER_POS);
  group.userData.beacon = beacon;
  group.userData.beaconGlow = beaconGlow;

  // 每幀更新:警示燈 sin 呼吸閃爍 (emissiveIntensity 0~6)
  group.userData.update = (t) => {
    const pulse = Math.max(0, Math.sin(t * 2.4)); // 0~1 呼吸
    beacon.material.emissiveIntensity = pulse * 6;
    beaconGlow.material.opacity = 0.15 + 0.75 * pulse;
  };
  return group;
}

// 上寬下窄的斗形方柱 (台北101節身特徵)
function makeTaperBox(bottomW, topW, h) {
  const geo = new THREE.CylinderGeometry(topW * Math.SQRT1_2, bottomW * Math.SQRT1_2, h, 4, 1);
  geo.rotateY(Math.PI / 4); // 四角柱轉正
  return geo;
}

export function radialGlowTexture(color) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, color);
  grad.addColorStop(0.25, color + 'aa');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
