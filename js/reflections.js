// reflections.js — 濕路面即時平面反射
// 原理:沿 y=0 鏡像主相機,只渲染「發光體」layer (霓虹招牌/大樓亮窗/101/路燈/車燈)
// 到低解析度 RT (黑底、黑霧),再由 track.js 的路面材質以投影 UV 混入:
// 菲涅耳 (掠射角強)、垂直拉絲模糊 (雨夜倒影拖長)、世界座標漣漪擾動。
// 效能:512×256 RT、layer 過濾後 draw call 極少、反射 pass 不重算 shadow map。
import * as THREE from 'three';

export const REFLECT_LAYER = 3;

// 與 track.js 路面 shader 共享的 uniforms (module 單例,值在 Reflections 內更新)
export const reflectionUniforms = {
  uReflectTex: { value: null },
  uReflectMatrix: { value: new THREE.Matrix4() },
  uReflectStrength: { value: 1.15 },
  uReflectTexel: { value: new THREE.Vector2(1 / 1024, 1 / 512) },
};

// 判斷一個 Mesh 是否屬於「發光體」(值得倒映在濕路面上)
function isGlowMesh(obj) {
  if (!obj.isMesh) return false;                       // Sprite/Points/Line 全跳過 (粒子/光暈)
  const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
  for (const m of mats) {
    if (!m) continue;
    if (m.blending === THREE.AdditiveBlending) continue; // 光暈面片/光池:加法混合易重複計光
    // 自發光材質:大樓亮窗、101 燈帶、檢查點柱、車尾燈、警燈
    if (m.emissive && m.emissiveIntensity >= 0.45
      && (m.emissiveMap || (m.emissive.r + m.emissive.g + m.emissive.b) > 0.15)) return true;
    // 不受色調映射的亮面 MeshBasic:霓虹招牌、看板、路燈頭、店面
    if (m.isMeshBasicMaterial && (m.toneMapped === false || m.map)) return true;
  }
  return false;
}

export class Reflections {
  // RT 1024×512:512×256 時起跑區高密度霓虹會糊成「彩色抹痕」,倍增解析度
  // 後 4-tap 拉絲間距 (texel 單位) 同步變細,倒影銳利一級
  constructor(renderer, scene, camera, { width = 1024, height = 512 } = {}) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.enabled = true;

    this.rt = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
    });
    reflectionUniforms.uReflectTex.value = this.rt.texture;
    reflectionUniforms.uReflectTexel.value.set(1 / width, 1 / height);

    this.virtualCam = new THREE.PerspectiveCamera();
    this.virtualCam.layers.set(REFLECT_LAYER);
    this.virtualCam.matrixAutoUpdate = false;

    // 反射 pass 專用黑霧:遠處霓虹自然衰減成黑 (加法混入路面時 = 無反射)
    this._fogBlack = new THREE.FogExp2(0x000000, scene.fog?.density ?? 0.0028);
    this._clearColor = new THREE.Color();

    this._m4 = new THREE.Matrix4();
    this._vPos = new THREE.Vector3();
    this._vLook = new THREE.Vector3();
    this._vUp = new THREE.Vector3();
    this._rot = new THREE.Matrix4();
  }

  // 世界重建 (換賽道/換車/生成 AI 車) 後呼叫:掃描場景,把發光體標進 REFLECT_LAYER
  markScene(root = this.scene) {
    let n = 0;
    root.traverse((obj) => {
      if (isGlowMesh(obj)) { obj.layers.enable(REFLECT_LAYER); n++; }
    });
    return n;
  }

  // 每幀 (主渲染前) 呼叫:鏡像相機 → 渲染發光體到 RT → 更新投影矩陣 uniform
  update() {
    if (!this.enabled) return;
    const { renderer, scene, camera, virtualCam } = this;

    camera.updateMatrixWorld();
    // 鏡像位置/朝向/up (沿 y=0:y 取負)
    camera.getWorldPosition(this._vPos);
    if (this._vPos.y < 0.05) return; // 相機貼地/穿地時跳過
    this._rot.extractRotation(camera.matrixWorld);
    this._vLook.set(0, 0, -1).applyMatrix4(this._rot).add(this._vPos);
    this._vUp.set(0, 1, 0).applyMatrix4(this._rot);
    this._vPos.y *= -1;
    this._vLook.y *= -1;
    this._vUp.y *= -1;
    virtualCam.position.copy(this._vPos);
    virtualCam.up.copy(this._vUp);
    virtualCam.lookAt(this._vLook);
    virtualCam.updateMatrix();
    virtualCam.updateMatrixWorld(true);
    virtualCam.projectionMatrix.copy(camera.projectionMatrix);
    virtualCam.projectionMatrixInverse.copy(camera.projectionMatrixInverse);

    // NDC → [0,1] 投影取樣矩陣
    reflectionUniforms.uReflectMatrix.value.set(
      0.5, 0, 0, 0.5,
      0, 0.5, 0, 0.5,
      0, 0, 0.5, 0.5,
      0, 0, 0, 1,
    ).multiply(virtualCam.projectionMatrix)
      .multiply(this._m4.copy(virtualCam.matrixWorld).invert());

    // 渲染:黑底 + 黑霧、只畫 REFLECT_LAYER、不重算 shadow map
    const oldFog = scene.fog;
    const oldBg = scene.background;
    const oldTarget = renderer.getRenderTarget();
    const oldShadowAuto = renderer.shadowMap.autoUpdate;
    renderer.getClearColor(this._clearColor);
    const oldAlpha = renderer.getClearAlpha();

    scene.fog = this._fogBlack;
    scene.background = null;
    renderer.shadowMap.autoUpdate = false;
    renderer.setClearColor(0x000000, 1);
    renderer.setRenderTarget(this.rt);
    renderer.clear();
    renderer.render(scene, virtualCam);

    renderer.setRenderTarget(oldTarget);
    renderer.setClearColor(this._clearColor, oldAlpha);
    renderer.shadowMap.autoUpdate = oldShadowAuto;
    scene.fog = oldFog;
    scene.background = oldBg;
  }
}
