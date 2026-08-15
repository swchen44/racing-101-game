// taipei101.js — 台北101 程序化模型:基座裙樓、8 節斗形塔身、塔尖、夜間打光
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const TOWER_POS = new THREE.Vector3(0, 0, -40);

function windowTexture(cols, rows, litRatio, tint, warmRows = []) {
  // 玻璃帷幕:整齊的水平樓層帶。亮段以 4~8 段連續 run 為單位點亮 (而非逐窗擲骰),
  // 恢復 101 玻璃帷幕最具辨識度的橫向連續節奏;窗色統一玉綠、明度集中在窄區間,
  // 暖白窗只出現在 warmRows 指定的少數樓層 (觀景台/餐廳層),讀成金點而非彩色雜訊。
  const W = 256, H = 512;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#041410'; // 未亮處近黑,避免糊成均勻綠柱
  g.fillRect(0, 0, W, H);
  const ch = H / rows;          // 每樓層高度
  const segW = W / cols;        // 每樓層水平分段寬
  const warmSet = new Set(warmRows);
  for (let r = 0; r < rows; r++) {
    const lineY = Math.round(r * ch + ch * 0.18);
    // 底層連續微光帶:整條全寬低亮度,保底水平連續感 (亮 run 疊在其上)。
    // 加厚+提亮:遠景 mipmap 平均後塔身仍保有可見的玉綠底光,不再整節全黑
    g.fillStyle = `rgba(${tint[0] >> 1},${tint[1] >> 1},${tint[2] >> 1},0.55)`;
    g.fillRect(0, lineY + 1, W, 4);
    const isWarmRow = warmSet.has(r);
    // 亮段:以 4~8 段連續 run 為單位整組點亮/熄滅
    let s = 0;
    while (s < cols) {
      const len = Math.min(4 + (Math.random() * 5 | 0), cols - s);
      if (Math.random() < litRatio) {
        const x = Math.round(s * segW) + 1;
        const w = Math.round(len * segW) - 2;
        if (isWarmRow && Math.random() < 0.6) {
          // 暖白亮帶:僅限指定樓層,更亮更厚,形成 2~3 條金色水平簽名帶
          g.fillStyle = `rgba(255,${222 + Math.random() * 20 | 0},170,${0.9 + Math.random() * 0.1})`;
          g.fillRect(x, lineY - 1, w, 6);
        } else {
          // 玉綠幕牆光:明度集中在窄區間 (alpha 0.78~0.9),整體一致不閃斑。
          // 帶高 3→6px:提高每樓層亮帶覆蓋率,遠景縮圖後亮度不塌陷
          g.fillStyle = `rgba(${tint[0]},${tint[1]},${tint[2]},${0.78 + Math.random() * 0.12})`;
          g.fillRect(x, lineY, w, 6);
        }
      }
      s += len;
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
  // litRatio 0.55 + run 點亮 → 每層讀成大段連續亮帶;暖白只留 3 個指定樓層 (整體佔比 ~0.08)
  const emissiveTex = windowTexture(16, 40, 0.55, [120, 255, 200], [8, 21, 33]);
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x11362a,
    metalness: 0.85, roughness: 0.18,
    emissive: 0xd9ffe9, emissiveMap: emissiveTex, emissiveIntensity: 1.7,
    envMapIntensity: 1.8,
  });
  // 翡翠泛光殼:各節玻璃體外一層微膨脹的加法半透殼 (合併成 1 mesh / 1 draw call)。
  // 夜間遠景時每節「體」被這層低亮度翡翠光罩住 → 塔身連續可讀,不再只剩節間燈帶;
  // 亮度極低 (額定 ~0.14),遠低於 bloom threshold 0.85,不會炸 bloom
  const shellGeos = [];
  const shellMat = new THREE.MeshBasicMaterial({
    color: 0x1e8a5f, transparent: true, opacity: 0.14,
    blending: THREE.AdditiveBlending, depthWrite: false,
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
  // 如意飾:收斂尺寸與亮度,貼齊節底收腰處,讀成鑲飾而非漂浮圓圈
  const ruyiMat = new THREE.MeshStandardMaterial({
    color: 0xd9b45b, metalness: 0.85, roughness: 0.35,
    emissive: 0xffca55, emissiveIntensity: 0.6,
  });

  // ---- 裙樓基座 (倒角方塔, 3 層階梯) ----
  // 素面方盒 → 帶窗貼圖的商場裙樓:簡化窗貼圖 (8列x6行) + 每層簷口亮邊 + 底層入口暖光帶
  const podiumTex = windowTexture(8, 6, 0.5, [120, 255, 200], [4]);
  const podiumMat = new THREE.MeshStandardMaterial({
    color: 0x28343a, metalness: 0.5, roughness: 0.4,
    emissive: 0xd9ffe9, emissiveMap: podiumTex, emissiveIntensity: 0.85,
  });
  let py = 0;
  const podiumTiers = [[62, 14], [54, 10], [46, 10]];
  // 每層 tier 頂邊一圈細亮簷口 (復用節冠材質,instanced → 1 draw call)
  const tierEdges = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1), crownEdgeMat, podiumTiers.length);
  const pm4 = new THREE.Matrix4();
  const pQuat = new THREE.Quaternion();
  let tierIdx = 0;
  for (const [w, h] of podiumTiers) {
    const tier = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), podiumMat);
    tier.position.y = py + h / 2;
    tier.castShadow = true;
    group.add(tier);
    py += h;
    pm4.compose(new THREE.Vector3(0, py - 0.2, 0), pQuat, new THREE.Vector3(w + 0.5, 0.4, w + 0.5));
    tierEdges.setMatrixAt(tierIdx++, pm4);
  }
  tierEdges.instanceMatrix.needsUpdate = true;
  group.add(tierEdges);
  // 底層入口暖光帶:一圈暖色亮帶環繞基座,近鏡運鏡掃過時的地面層生氣
  const entryBand = new THREE.Mesh(
    new THREE.BoxGeometry(62.6, 2.0, 62.6),
    new THREE.MeshStandardMaterial({
      color: 0x3a2a14, metalness: 0.2, roughness: 0.6,
      emissive: 0xffc98a, emissiveIntensity: 1.6,
    }));
  entryBand.position.y = 1.6;
  group.add(entryBand);

  // ---- 塔身核心柱 (基部) ----
  const baseH = 46;
  const base = new THREE.Mesh(makeTaperBox(30, 24, baseH), glassMat);
  base.position.y = py + baseH / 2;
  base.castShadow = true;
  group.add(base);
  shellGeos.push(makeTaperBox(31.4, 25.4, baseH + 0.6).translate(0, py + baseH / 2, 0));
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
    new THREE.TorusGeometry(1.1, 0.32, 8, 16), ruyiMat, 32);
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
    // 泛光殼:上下各多 0.35m,與相鄰節的殼幾乎相接 → 節與節之間視覺連續
    shellGeos.push(makeTaperBox(SEG_BOTTOM + 1.4, SEG_TOP + 1.4, SEG_H + 0.7)
      .translate(0, y + SEG_H / 2, 0));

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

    // 每節四面的「如意」裝飾圓飾:貼齊節底收腰處 (與收腰光暈同高),讀成建築鑲飾
    const half = SEG_BOTTOM / 2 + 0.45;
    for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      m4.compose(
        new THREE.Vector3(sx * half, y + 1.6, sz * half),
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
  shellGeos.push(makeTaperBox(18.4, 13.4, 20.6).translate(0, y + 10, 0));
  y += 20;
  // 頂樓收束塔用較收斂的燈帶材質 (避免整塊實心體被 toneMapped:false 高 emissive 打爆)
  const crown2Mat = trimMat.clone();
  crown2Mat.emissiveIntensity = 1.0;
  crown2Mat.toneMapped = true;
  const crown2 = new THREE.Mesh(makeTaperBox(11, 7, 12), crown2Mat);
  crown2.position.y = y + 6;
  group.add(crown2);
  shellGeos.push(makeTaperBox(12.2, 8.2, 12.4).translate(0, y + 6, 0));
  y += 12;

  // 泛光殼合併 → 單一 mesh (1 draw call)
  group.add(new THREE.Mesh(mergeGeometries(shellGeos), shellMat));

  // ---- 塔尖 ----
  const spireMat = new THREE.MeshStandardMaterial({
    color: 0xbcd8d0, metalness: 0.95, roughness: 0.25,
    emissive: 0xaaffe0, emissiveIntensity: 2.4,
  });
  const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 2.6, 42, 8), spireMat);
  spire.position.y = y + 21;
  group.add(spire);
  // 塔尖泛光 sprite:縱向拉長的翡翠光柱,夜間遠景保證塔尖可見、剪影收頂
  const spireGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: radialGlowTexture('#7dffd0'), transparent: true, opacity: 0.32,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  }));
  spireGlow.scale.set(11, 52, 1);
  spireGlow.position.y = y + 21;
  group.add(spireGlow);
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
  grad.addColorStop(0.55, color + '33'); // 中段補一站:加法混合下尾緣不再出現可讀圓邊
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
