// track.js — 信義區封閉賽道:曲線定義、路面網格、護欄、路緣石、起跑線、檢查點
import * as THREE from 'three';

export const ROAD_HALF_WIDTH = 7.5;      // 路面半寬 (m)
export const WALL_HALF_WIDTH = 8.6;      // 護欄碰撞半寬
export const N_SAMPLES = 1400;           // 曲線取樣數
export const N_CHECKPOINTS = 8;

// 環繞台北101 (位於 0,-40) 的封閉賽道控制點 (x, z)
const CONTROL_POINTS = [
  [-40, -235], [70, -240], [165, -218], [224, -158], [242, -76],
  [232, 16], [252, 108], [214, 182], [124, 218], [28, 240],
  [-84, 232], [-172, 200], [-228, 128], [-244, 36], [-230, -58],
  [-238, -148], [-178, -216],
];

export class Track {
  constructor() {
    const pts = CONTROL_POINTS.map(([x, z]) => new THREE.Vector3(x, 0, z));
    this.curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal', 0.5);
    this.length = this.curve.getLength();
    this._buildSamples();
  }

  _buildSamples() {
    // 等距取樣: pos / tangent / normal(左手邊) / 累積弧長比例 s
    this.samples = [];
    for (let i = 0; i < N_SAMPLES; i++) {
      const t = i / N_SAMPLES;
      const pos = this.curve.getPointAt(t);
      const tan = this.curve.getTangentAt(t);
      tan.y = 0; tan.normalize();
      const normal = new THREE.Vector3(-tan.z, 0, tan.x); // 左法線
      this.samples.push({ pos, tan, normal, s: t });
    }
  }

  // 於 hint 附近搜尋最近取樣點 (賽車逐幀追蹤用)。hint=-1 時全域搜尋。
  nearest(pos, hint = -1) {
    let bestI = 0, bestD = Infinity;
    if (hint < 0) {
      for (let i = 0; i < N_SAMPLES; i += 4) {
        const d = pos.distanceToSquared(this.samples[i].pos);
        if (d < bestD) { bestD = d; bestI = i; }
      }
      // 細化
      for (let k = -4; k <= 4; k++) {
        const i = (bestI + k + N_SAMPLES) % N_SAMPLES;
        const d = pos.distanceToSquared(this.samples[i].pos);
        if (d < bestD) { bestD = d; bestI = i; }
      }
    } else {
      for (let k = -30; k <= 30; k++) {
        const i = (hint + k + N_SAMPLES) % N_SAMPLES;
        const d = pos.distanceToSquared(this.samples[i].pos);
        if (d < bestD) { bestD = d; bestI = i; }
      }
    }
    return bestI;
  }

  // 回傳 { index, s, lateral(左正), tangent, roadPos }
  query(pos, hint = -1) {
    const i = this.nearest(pos, hint);
    const sm = this.samples[i];
    const dx = pos.x - sm.pos.x, dz = pos.z - sm.pos.z;
    const lateral = dx * sm.normal.x + dz * sm.normal.z;
    const along = dx * sm.tan.x + dz * sm.tan.z;
    const s = (sm.s + along / this.length + 1) % 1;
    return { index: i, s, lateral, tangent: sm.tan, normal: sm.normal, roadPos: sm.pos };
  }

  pointAt(s) { return this.curve.getPointAt(((s % 1) + 1) % 1); }
  tangentAt(s) {
    const t = this.curve.getTangentAt(((s % 1) + 1) % 1); t.y = 0; return t.normalize();
  }

  // ============ 視覺網格 ============
  buildMeshes() {
    const group = new THREE.Group();
    group.add(this._roadMesh());
    group.add(this._curbMesh());
    group.add(this._sidewalkMesh());
    group.add(this._barrierMesh());
    group.add(this._startGate());
    group.add(this._checkpointPylons());
    group.add(this._laneCones());
    group.add(this._wetStreaks());
    return group;
  }

  _ribbonGeometry(halfW, y, segStep = 2, uScale = 1) {
    // 沿曲線擠出的帶狀幾何
    const n = Math.floor(N_SAMPLES / segStep);
    const positions = new Float32Array((n + 1) * 2 * 3);
    const uvs = new Float32Array((n + 1) * 2 * 2);
    const indices = [];
    let dist = 0;
    let prev = null;
    for (let i = 0; i <= n; i++) {
      const sm = this.samples[(i * segStep) % N_SAMPLES];
      if (prev) dist += sm.pos.distanceTo(prev);
      prev = sm.pos;
      const li = i * 6;
      positions[li + 0] = sm.pos.x + sm.normal.x * halfW;
      positions[li + 1] = y;
      positions[li + 2] = sm.pos.z + sm.normal.z * halfW;
      positions[li + 3] = sm.pos.x - sm.normal.x * halfW;
      positions[li + 4] = y;
      positions[li + 5] = sm.pos.z - sm.normal.z * halfW;
      const ui = i * 4;
      uvs[ui + 0] = 0; uvs[ui + 1] = dist * uScale;
      uvs[ui + 2] = 1; uvs[ui + 3] = dist * uScale;
      if (i < n) {
        const a = i * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }

  // 路面雙貼圖:albedo(柏油+標線) 與 emissive(僅標線,夜間自發光保證可讀)
  // 版面 (寬 512px = 15m,V 一次重複 = 16m,64px/m):
  //   中央雙黃實線 | 兩側 25%/75% 白色車道虛線 (3m 漆 + 5m 空) | 近路緣白實邊線
  // 兩張畫布在同一迴圈繪製標線,磨損斷點完全一致。
  _roadTextures() {
    const W = 512, H = 1024; // 一次 V 重複 = 16m (見 _roadMesh 的 uScale)
    const PPM = H / 16;      // 64 px per meter (V 方向)
    const mk = () => {
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      return c;
    };
    const ca = mk(), ce = mk();
    const ga = ca.getContext('2d'), ge = ce.getContext('2d');

    // --- albedo 基底瀝青 ---
    ga.fillStyle = '#23262d';
    ga.fillRect(0, 0, W, H);
    // 粗顆粒噪點 (骨材反光)
    for (let i = 0; i < 16000; i++) {
      const v = 24 + Math.random() * 40;
      ga.fillStyle = `rgba(${v + 6},${v + 10},${v + 18},${0.2 + Math.random() * 0.45})`;
      ga.fillRect(Math.random() * W, Math.random() * H, 2, 2);
    }
    // 大尺度斑駁 (舖裝色差,避免遠處變成均勻平面)
    for (let i = 0; i < 42; i++) {
      const x = Math.random() * W, y = Math.random() * H;
      const r = 40 + Math.random() * 110;
      const dark = Math.random() < 0.5;
      const grad = ga.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, dark ? 'rgba(8,9,12,0.16)' : 'rgba(150,168,205,0.07)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ga.fillStyle = grad;
      ga.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // 車轍:四條車道中心較暗的輪胎磨痕帶
    for (const cx of [W * 0.125, W * 0.375, W * 0.625, W * 0.875]) {
      for (const off of [-40, 40]) {
        const grad = ga.createLinearGradient(cx + off - 26, 0, cx + off + 26, 0);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(0.5, 'rgba(6,7,10,0.28)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ga.fillStyle = grad;
        ga.fillRect(cx + off - 26, 0, 52, H);
      }
    }
    // 修補裂縫
    ga.strokeStyle = 'rgba(8,8,11,0.55)';
    ga.lineWidth = 3;
    for (let i = 0; i < 10; i++) {
      ga.beginPath();
      let x = Math.random() * W, y = Math.random() * H;
      ga.moveTo(x, y);
      for (let k = 0; k < 5; k++) { x += (Math.random() - 0.5) * 70; y += Math.random() * 70; ga.lineTo(x, y); }
      ga.stroke();
    }

    // --- emissive 基底全黑 ---
    ge.fillStyle = '#000000';
    ge.fillRect(0, 0, W, H);

    const both = (fn) => { fn(ga); fn(ge); };
    // 標線畫筆:albedo 亮色 + emissive 中等灰 (似逆反光漆,經 emissiveIntensity 提亮)
    const paint = (albedoCol, emitCol, x, y, w, h) => {
      both((g) => {
        g.fillStyle = g === ga ? albedoCol : emitCol;
        g.fillRect(x, y, w, h);
      });
    };

    // 兩側白實邊線 (0.55m 內縮、寬 ~0.2m,帶磨損斷點,兩張圖共用同一次擲骰)
    const edgeIn = Math.round(0.55 / 15 * W);     // ≈ 19px
    const edgeW = 7;
    for (let y = 0; y < H; y += 32) {
      if (Math.random() < 0.05) continue; // 磨損
      const aA = 0.82 + Math.random() * 0.14;
      paint(`rgba(228,233,238,${aA})`, 'rgba(168,178,192,1)', edgeIn, y, edgeW, 32);
      paint(`rgba(228,233,238,${aA})`, 'rgba(168,178,192,1)', W - edgeIn - edgeW, y, edgeW, 32);
    }

    // 中央雙黃實線 (各寬 ~0.11m,間隔 ~0.22m,偶發磨損)
    const yw = 6, ygap = 12;
    for (let y = 0; y < H; y += 32) {
      if (Math.random() < 0.04) continue;
      const aA = 0.85 + Math.random() * 0.12;
      paint(`rgba(255,196,54,${aA})`, 'rgba(210,158,52,1)', W / 2 - ygap / 2 - yw, y, yw, 32);
      paint(`rgba(255,196,54,${aA})`, 'rgba(210,158,52,1)', W / 2 + ygap / 2, y, yw, 32);
    }

    // 車道白虛線:25% / 75% 處,3m 漆 + 5m 空 (一個 8m 週期,一次重複兩段)
    const dashLen = 3 * PPM, cycle = 8 * PPM, dw = 6;
    for (const dx of [W * 0.25, W * 0.75]) {
      for (let y0 = 0; y0 < H; y0 += cycle) {
        if (Math.random() < 0.07) continue; // 整段磨掉
        paint('rgba(232,236,241,0.92)', 'rgba(178,188,200,1)', dx - dw / 2, y0, dw, dashLen);
      }
    }

    const finish = (c) => {
      const tex = new THREE.CanvasTexture(c);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.anisotropy = 8;
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    };
    return { map: finish(ca), emissiveMap: finish(ce) };
  }

  // 程序化夜空 equirect 環境圖:天頂深藍 → 地平線暖霞,地平線上撒霓虹色塊。
  // 指派給 material.envMap 後 three 會自動轉 cubeUV(PMREM),
  // 低 roughness 路面立刻獲得方向性濕面光澤。
  _envTexture() {
    if (this._envTex) return this._envTex;
    const c = document.createElement('canvas');
    c.width = 512; c.height = 256;
    const g = c.getContext('2d');
    const sky = g.createLinearGradient(0, 0, 0, 256);
    sky.addColorStop(0.0, '#070a18');
    sky.addColorStop(0.42, '#141230');
    sky.addColorStop(0.5, '#3c2748');
    sky.addColorStop(0.56, '#151222');
    sky.addColorStop(1.0, '#05060a');
    g.fillStyle = sky;
    g.fillRect(0, 0, 512, 256);
    // 地平線暖霞帶
    const hz = g.createLinearGradient(0, 108, 0, 138);
    hz.addColorStop(0, 'rgba(255,140,80,0)');
    hz.addColorStop(0.65, 'rgba(255,150,90,0.38)');
    hz.addColorStop(1, 'rgba(255,120,70,0)');
    g.fillStyle = hz;
    g.fillRect(0, 108, 512, 30);
    // 地平線霓虹光斑 (城市燈海 → 濕路面的彩色光澤來源)
    const NEON = ['#37e0ff', '#ff43c8', '#ffb347', '#3ee6a8', '#8fb7ff', '#ffd23e'];
    for (let i = 0; i < 26; i++) {
      const col = NEON[i % NEON.length];
      g.fillStyle = col;
      g.globalAlpha = 0.16 + Math.random() * 0.3;
      g.shadowColor = col;
      g.shadowBlur = 10 + Math.random() * 16;
      const w = 8 + Math.random() * 30, h = 3 + Math.random() * 8;
      g.fillRect(Math.random() * 512, 112 + Math.random() * 18, w, h);
    }
    g.globalAlpha = 1; g.shadowBlur = 0;
    const tex = new THREE.CanvasTexture(c);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    this._envTex = tex;
    return tex;
  }

  _roadMesh() {
    const geo = this._ribbonGeometry(ROAD_HALF_WIDTH, 0.02, 2, 1 / 16);
    const { map, emissiveMap } = this._roadTextures();
    const mat = new THREE.MeshStandardMaterial({
      map,
      emissive: 0xffffff,
      emissiveMap,
      emissiveIntensity: 0.55,   // 標線自發光:夜間必定可讀,似逆反光漆
      roughness: 0.32,           // 濕潤感:低粗糙度拉出天空/霓虹光澤
      metalness: 0.22,
      envMap: this._envTexture(),
      envMapIntensity: 0.7,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    return mesh;
  }

  // 濕地拖影:沿賽道撒 instanced 加法混合拉伸光斑,
  // 模擬路燈/霓虹在濕路面上垂直拉長的倒影光條。單一 draw call。
  _streakTexture() {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 256;
    const g = c.getContext('2d');
    g.save();
    g.translate(32, 128);
    g.scale(1, 4);
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, 32);
    grad.addColorStop(0, 'rgba(255,255,255,0.95)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.42)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(0, 0, 32, 0, Math.PI * 2);
    g.fill();
    g.restore();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  _wetStreaks() {
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2); // 平躺,長軸沿本地 +Z(切線方向)
    const mat = new THREE.MeshBasicMaterial({
      map: this._streakTexture(),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.3,   // 低調:是路面上的倒影光暈,不能搶過標線
    });
    const NEON = [0x37e0ff, 0xff43c8, 0xffb347, 0x3ee6a8, 0x8fb7ff, 0xffd23e];
    const step = 11;
    const count = Math.floor(N_SAMPLES / step);
    const inst = new THREE.InstancedMesh(geo, mat, count);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const col = new THREE.Color();
    for (let k = 0; k < count; k++) {
      const sm = this.samples[(k * step) % N_SAMPLES];
      const angle = Math.atan2(sm.tan.x, sm.tan.z);
      q.setFromAxisAngle(up, angle);
      // 偏向路緣(燈源多在路側),少數落在中央(招牌/天橋反光)
      const side = Math.random() < 0.5 ? 1 : -1;
      const lat = Math.random() < 0.75
        ? side * (ROAD_HALF_WIDTH - 1.0) * (0.55 + Math.random() * 0.42)
        : (Math.random() - 0.5) * 4;
      const width = 0.55 + Math.random() * 0.85;
      const len = 4 + Math.random() * 7;
      m4.compose(
        new THREE.Vector3(
          sm.pos.x + sm.normal.x * lat,
          0.045,
          sm.pos.z + sm.normal.z * lat),
        q, new THREE.Vector3(width, 1, len));
      inst.setMatrixAt(k, m4);
      col.setHex(NEON[(Math.random() * NEON.length) | 0]);
      col.multiplyScalar(0.3 + Math.random() * 0.4);
      inst.setColorAt(k, col);
    }
    inst.renderOrder = 1;
    return inst;
  }

  _curbTexture() {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#d8323c'; g.fillRect(0, 0, 128, 64);
    g.fillStyle = '#e8e4dc'; g.fillRect(0, 64, 128, 64);
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  _curbMesh() {
    // 左右路緣紅白條紋
    const group = new THREE.Group();
    const tex = this._curbTexture();
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, metalness: 0.05 });
    for (const side of [1, -1]) {
      const inner = ROAD_HALF_WIDTH, outer = ROAD_HALF_WIDTH + 0.75;
      const n = Math.floor(N_SAMPLES / 2);
      const positions = new Float32Array((n + 1) * 2 * 3);
      const uvs = new Float32Array((n + 1) * 2 * 2);
      const indices = [];
      let dist = 0, prev = null;
      for (let i = 0; i <= n; i++) {
        const sm = this.samples[(i * 2) % N_SAMPLES];
        if (prev) dist += sm.pos.distanceTo(prev);
        prev = sm.pos;
        const li = i * 6;
        positions[li + 0] = sm.pos.x + sm.normal.x * inner * side;
        positions[li + 1] = 0.035;
        positions[li + 2] = sm.pos.z + sm.normal.z * inner * side;
        positions[li + 3] = sm.pos.x + sm.normal.x * outer * side;
        positions[li + 4] = 0.09;
        positions[li + 5] = sm.pos.z + sm.normal.z * outer * side;
        const ui = i * 4;
        uvs[ui] = 0; uvs[ui + 1] = dist / 1.2;
        uvs[ui + 2] = 1; uvs[ui + 3] = dist / 1.2;
        if (i < n) { const a = i * 2; indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      group.add(new THREE.Mesh(geo, mat));
    }
    return group;
  }

  _sidewalkMesh() {
    // 護欄外的人行道帶
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x2a2e36, roughness: 0.9, metalness: 0.0 });
    for (const side of [1, -1]) {
      const inner = WALL_HALF_WIDTH, outer = WALL_HALF_WIDTH + 6.5;
      const n = Math.floor(N_SAMPLES / 4);
      const positions = new Float32Array((n + 1) * 2 * 3);
      const indices = [];
      for (let i = 0; i <= n; i++) {
        const sm = this.samples[(i * 4) % N_SAMPLES];
        const li = i * 6;
        positions[li + 0] = sm.pos.x + sm.normal.x * inner * side;
        positions[li + 1] = 0.22;
        positions[li + 2] = sm.pos.z + sm.normal.z * inner * side;
        positions[li + 3] = sm.pos.x + sm.normal.x * outer * side;
        positions[li + 4] = 0.22;
        positions[li + 5] = sm.pos.z + sm.normal.z * outer * side;
        if (i < n) { const a = i * 2; indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    return group;
  }

  _barrierMesh() {
    // 混凝土護欄 (Jersey barrier) — instanced 沿賽道兩側
    const group = new THREE.Group();
    const step = 8; // 每 8 個取樣放一段
    const segLen = this.length / N_SAMPLES * step;
    const shape = new THREE.Shape();
    shape.moveTo(-0.28, 0); shape.lineTo(0.28, 0);
    shape.lineTo(0.16, 0.5); shape.lineTo(0.12, 0.95);
    shape.lineTo(-0.12, 0.95); shape.lineTo(-0.16, 0.5);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: segLen + 0.05, bevelEnabled: false });
    geo.rotateY(Math.PI / 2);
    geo.translate(-(segLen + 0.05) / 2, 0, 0); // 對齊段中心(沿切線方向)
    const mat = new THREE.MeshStandardMaterial({ color: 0x8a8d92, roughness: 0.85, metalness: 0.02 });
    const count = Math.floor(N_SAMPLES / step) * 2;
    const inst = new THREE.InstancedMesh(geo, mat, count);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    let idx = 0;
    for (let i = 0; i < N_SAMPLES; i += step) {
      const sm = this.samples[i];
      const angle = Math.atan2(sm.tan.x, sm.tan.z);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle + Math.PI / 2);
      for (const side of [1, -1]) {
        m4.compose(
          new THREE.Vector3(
            sm.pos.x + sm.normal.x * WALL_HALF_WIDTH * side,
            0, sm.pos.z + sm.normal.z * WALL_HALF_WIDTH * side),
          q, new THREE.Vector3(1, 1, 1));
        inst.setMatrixAt(idx++, m4);
      }
    }
    inst.castShadow = false;
    inst.receiveShadow = true;
    group.add(inst);

    // 護欄頂端反光條 (紅/白交替微發光)
    const stripGeoR = new THREE.BoxGeometry(0.1, 0.06, 0.5);
    const stripMatR = new THREE.MeshStandardMaterial({ color: 0xff3344, emissive: 0xff2233, emissiveIntensity: 1.4 });
    const stripMatW = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xccddff, emissiveIntensity: 1.0 });
    const nStrips = Math.floor(N_SAMPLES / 16);
    const instR = new THREE.InstancedMesh(stripGeoR, stripMatR, nStrips);
    const instW = new THREE.InstancedMesh(stripGeoR, stripMatW, nStrips);
    let ri = 0, wi = 0;
    for (let i = 0; i < N_SAMPLES; i += 16) {
      const sm = this.samples[i];
      const angle = Math.atan2(sm.tan.x, sm.tan.z);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle);
      const even = (i / 16) % 2 === 0;
      for (const side of [1, -1]) {
        m4.compose(
          new THREE.Vector3(
            sm.pos.x + sm.normal.x * WALL_HALF_WIDTH * side,
            0.98, sm.pos.z + sm.normal.z * WALL_HALF_WIDTH * side),
          q, new THREE.Vector3(1, 1, 1));
        if (even) { if (ri < nStrips) instR.setMatrixAt(ri++, m4); }
        else { if (wi < nStrips) instW.setMatrixAt(wi++, m4); }
      }
    }
    instR.count = ri; instW.count = wi;
    group.add(instR, instW);
    return group;
  }

  _startGate() {
    // 起跑門架:橫跨賽道的龍門 + 發光看板
    const group = new THREE.Group();
    const sm = this.samples[0];
    const angle = Math.atan2(sm.tan.x, sm.tan.z);
    group.position.copy(sm.pos);
    group.rotation.y = angle;

    const poleMat = new THREE.MeshStandardMaterial({ color: 0x22262e, roughness: 0.5, metalness: 0.7 });
    const poleGeo = new THREE.CylinderGeometry(0.35, 0.42, 11, 10);
    for (const side of [1, -1]) {
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(side * (ROAD_HALF_WIDTH + 1.6), 5.5, 0);
      group.add(pole);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry((ROAD_HALF_WIDTH + 1.8) * 2, 1.6, 1.1), poleMat);
    beam.position.y = 10.6;
    group.add(beam);

    // 看板文字
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 96;
    const g = c.getContext('2d');
    g.fillStyle = '#08131c'; g.fillRect(0, 0, 1024, 96);
    g.font = '700 58px "Chakra Petch", "Noto Sans TC", sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#3ee6a8';
    g.shadowColor = '#3ee6a8'; g.shadowBlur = 22;
    g.fillText('START ／ FINISH 起 點', 512, 50);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry((ROAD_HALF_WIDTH + 1.5) * 2, 1.5),
      new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    board.position.set(0, 10.6, 0.58);
    group.add(board);
    const board2 = board.clone();
    board2.rotation.y = Math.PI;
    board2.position.z = -0.58;
    group.add(board2);

    // 起跑線 (黑白格)
    const cc = document.createElement('canvas');
    cc.width = 256; cc.height = 64;
    const gg = cc.getContext('2d');
    for (let x = 0; x < 16; x++) for (let y = 0; y < 4; y++) {
      gg.fillStyle = (x + y) % 2 ? '#dfe3e8' : '#0c0e12';
      gg.fillRect(x * 16, y * 16, 16, 16);
    }
    const lineTex = new THREE.CanvasTexture(cc);
    lineTex.colorSpace = THREE.SRGBColorSpace;
    const line = new THREE.Mesh(
      new THREE.PlaneGeometry(ROAD_HALF_WIDTH * 2, 3.2),
      new THREE.MeshStandardMaterial({ map: lineTex, roughness: 0.5 }));
    line.rotation.x = -Math.PI / 2;
    line.position.y = 0.03;
    group.add(line);
    return group;
  }

  _checkpointPylons() {
    // 檢查點:路側成對的發光柱
    const group = new THREE.Group();
    const geo = new THREE.CylinderGeometry(0.12, 0.18, 5.2, 8);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x0d2233, emissive: 0x2ec4ff, emissiveIntensity: 2.2, roughness: 0.4,
    });
    for (let k = 1; k < N_CHECKPOINTS; k++) {
      const i = Math.floor(k / N_CHECKPOINTS * N_SAMPLES);
      const sm = this.samples[i];
      for (const side of [1, -1]) {
        const pylon = new THREE.Mesh(geo, mat);
        pylon.position.set(
          sm.pos.x + sm.normal.x * (ROAD_HALF_WIDTH + 0.4) * side,
          2.6, sm.pos.z + sm.normal.z * (ROAD_HALF_WIDTH + 0.4) * side);
        group.add(pylon);
      }
    }
    return group;
  }

  _laneCones() {
    // 彎道頂點放置交通錐做視覺提示
    const group = new THREE.Group();
    const coneGeo = new THREE.ConeGeometry(0.24, 0.62, 10);
    const coneMat = new THREE.MeshStandardMaterial({ color: 0xff7733, emissive: 0x992200, emissiveIntensity: 0.5, roughness: 0.6 });
    const baseGeo = new THREE.BoxGeometry(0.5, 0.05, 0.5);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x1c1c20, roughness: 0.9 });
    // 曲率大處
    for (let i = 0; i < N_SAMPLES; i += 6) {
      const a = this.samples[i].tan, b = this.samples[(i + 12) % N_SAMPLES].tan;
      const curvature = 1 - (a.x * b.x + a.z * b.z);
      if (curvature > 0.012 && Math.random() < 0.4) {
        const sm = this.samples[i];
        const side = (a.x * b.z - a.z * b.x) > 0 ? -1 : 1; // 外側
        const cone = new THREE.Mesh(coneGeo, coneMat);
        const base = new THREE.Mesh(baseGeo, baseMat);
        const px = sm.pos.x + sm.normal.x * (ROAD_HALF_WIDTH - 0.6) * side;
        const pz = sm.pos.z + sm.normal.z * (ROAD_HALF_WIDTH - 0.6) * side;
        cone.position.set(px, 0.34, pz);
        base.position.set(px, 0.05, pz);
        group.add(cone, base);
      }
    }
    return group;
  }
}
