import * as THREE from 'three';

// Atlas semantics from the archived content:gc and vehicles:yi generators.
// r160 lighting is retained; these hooks decode the original premultiplied artwork.
function characterAtlas(material, atlas) {
  material.map = null;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.sourceAtlas = { value: atlas };
    shader.vertexShader = 'attribute vec4 uvRect; attribute vec4 surf; varying vec4 sourceRect; varying vec4 sourceSurf; varying vec2 sourceUv;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nsourceRect=uvRect; sourceSurf=surf; sourceUv=uv;');
    shader.fragmentShader = 'uniform sampler2D sourceAtlas; varying vec4 sourceRect; varying vec4 sourceSurf; varying vec2 sourceUv;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
      #include <color_fragment>
      if (sourceRect.z > 0.0) {
        float mode = sourceSurf.z;
        bool repeatTile = (mode > .5 && mode < 1.5) || mode > 2.5;
        vec2 f = repeatTile ? fract(sourceUv) : clamp(sourceUv, 0.0, 1.0);
        vec4 tx = texture2D(sourceAtlas, sourceRect.xy + f * sourceRect.zw);
        if (mode > 2.5) {
          if (sourceSurf.w > 0.0 && tx.g < sourceSurf.w) discard;
          diffuseColor.rgb *= .55 + .6 * tx.r;
        } else if (repeatTile) {
          diffuseColor.rgb *= tx.rgb;
        } else {
          tx *= step(0.0, sourceUv.x) * step(sourceUv.x, 1.0) * step(0.0, sourceUv.y) * step(sourceUv.y, 1.0);
          if (mode > 1.5) {
            if (tx.a < .5) discard;
            diffuseColor.rgb *= tx.rgb / max(tx.a, .001);
          } else {
            diffuseColor.rgb = diffuseColor.rgb * (1.0 - tx.a) + tx.rgb;
          }
        }
      }
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(sourceSurf.y, .04, 1.0);');
  };
  material.customProgramCacheKey = () => 'taipei-character-gc-r160-v1';
}

function vehicleAtlas(material) {
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', '');
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
      #include <color_fragment>
      #ifdef USE_MAP
        vec4 atl = texture2D(map, vMapUv);
        diffuseColor.rgb = diffuseColor.rgb * (1.0 - atl.a) + atl.rgb;
      #endif
    `);
  };
  material.customProgramCacheKey = () => 'taipei-vehicle-yi-r160-v1';
}

function markingAtlas(material) {
  material.depthWrite = false;
  material.polygonOffset = true;
  material.polygonOffsetFactor = -2;
  material.polygonOffsetUnits = -4;
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = 'attribute vec4 aRect; varying vec4 sourceRect; varying vec2 sourceUv;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nsourceRect=aRect; sourceUv=uv;');
    shader.fragmentShader = 'varying vec4 sourceRect; varying vec2 sourceUv;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
      vec2 mUv = sourceRect.xy + fract(sourceUv) * sourceRect.zw;
      vec4 mTex = texture2D(map, mUv);
      mTex.rgb /= max(mTex.a, 1e-4);
      diffuseColor *= mTex;
    `);
  };
  material.customProgramCacheKey = () => 'taipei-marking-oc-r160-v1';
}

// Archived world:iy.vert / Dy / hy / gy / yy / by / xy / Cy / wy.
// aCol.a is AO. Emission is aLight.rgb × (aLight.a × 8), masked by the
// original 35-layer Uv/Jv/Kv array. Current sites use flags 0, TEXCOL, WINDOWS,
// SWAY; tower/New Year display paths and original atmospheric fog are excluded.
const LM_VERTEX = `
attribute vec4 aCol;
attribute vec4 aMat;
attribute vec4 aLight;
attribute vec4 aInfo;
varying vec4 vCol;
varying vec4 vMatP;
varying vec4 vLight;
flat varying vec4 vInfo;
varying vec2 vUv2;
varying vec3 vWPos;
uniform float uTime;
`;
const LM_BEGIN = `
#include <begin_vertex>
vCol = aCol;
vMatP = aMat;
vLight = aLight;
vInfo = aInfo;
vUv2 = uv;
{
  int lmFv = int(aInfo.y + 0.5);
  vec4 lmW = modelMatrix * vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    lmW = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
  #endif
  if ((lmFv & 64) != 0) {
    float k = aMat.w * 1.6;
    float ph = lmW.x * 0.11 + lmW.z * 0.07;
    transformed.x += (sin(uTime * 1.25 + ph) + 0.5 * sin(uTime * 2.7 + ph * 2.3)) * 0.18 * k;
    transformed.z += cos(uTime * 1.05 + ph * 1.3) * 0.14 * k;
  }
  vWPos = lmW.xyz;
}
`;
const LM_FRAGMENT = `
uniform highp sampler2DArray uAtlas;
uniform float uNight;
uniform float uTime;
uniform float uWet;
uniform float uWinLate;
uniform vec3 uFloodColor;
uniform vec3 uSkyH;
uniform vec3 uSkyZ;
varying vec4 vCol;
varying vec4 vMatP;
varying vec4 vLight;
flat varying vec4 vInfo;
varying vec2 vUv2;
varying vec3 vWPos;
// Original pcg3d hash. Do not replace with a low-precision sine hash: it lights
// adjacent source window cells in correlated blocks at large coordinates.
float lmHash3(ivec3 p) {
  uvec3 v = uvec3(p + 262144) * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return float((v.x ^ v.y ^ v.z) >> 8u) * (1.0 / 16777216.0);
}
`;
const LM_ALBEDO = `
int lmF = int(vInfo.y + 0.5);
int lmF2 = int(vInfo.z + 0.5);
int lmW = int(vInfo.w + 0.5);
float lmLayer = vInfo.x;
vec2 lmUv = vUv2;
if ((lmF & 4) != 0) lmUv.x += uTime * 0.035;
if ((lmF2 & 1) != 0) lmUv.y += floor(uTime / 7.0) * 0.25;
vec2 lmDx = dFdx(vUv2), lmDy = dFdy(vUv2);
vec4 lmTex = textureGrad(uAtlas, vec3(lmUv, lmLayer), lmDx, lmDy);
vec3 lmAlbedo = lmTex.rgb * vCol.rgb;
diffuseColor.rgb *= lmAlbedo * (1.0 - 0.25 * uWet);
if ((lmW & 32) != 0 && lmTex.a < 0.42) discard;
`;
const LM_EMISSION = `
{
  vec3 lmEm = vLight.rgb * (vLight.a * 8.0);
  if ((lmF & 8) != 0) lmEm *= lmTex.rgb * 1.25;
  lmEm *= lmTex.a;
  if ((lmF & 32) != 0) {
    vec3 nW = inverseTransformDirection(normal, viewMatrix);
    ivec2 fq = ivec2(floor(nW.xz * 3.0 + 0.5));
    int face = fq.x * 7 + fq.y + int(floor(vWPos.y / 400.0)) * 49;
    float frac = vMatP.w * (((lmW & 64) != 0) ? uWinLate : 1.0);
    float lmCeil = 0.72 + 0.42 * smoothstep(0.15, 0.95, fract(lmUv.y));
    vec2 cell = floor(lmUv / vec2(max(1.0, float(lmW & 15)), 1.0));
    ivec3 ci = ivec3(int(cell.x), int(cell.y), face);
    float h0 = lmHash3(ci);
    float h = lmHash3(ci + ivec3(0, 0, int(floor(uTime / 180.0 + h0)) * 97));
    float lit = step(h, frac);
    float v = fract(h * 13.7);
    vec3 tint = mix(vec3(1.0, 0.78, 0.5), vec3(0.85, 0.92, 1.0), step(0.78, fract(h * 7.3)));
    lmEm *= lit * (0.28 + 0.42 * v) * lmCeil * tint;
  }
  float lmK = uNight;
  if ((lmF & 16) != 0) lmK = max(uNight, 0.7);
  if ((lmF & 2) != 0) { lmK = max(uNight, 0.8); lmEm *= step(0.6, fract(uTime * 0.75 + vMatP.w)); }
  lmEm *= lmK;
  // Original baked uplight profile + widening 6 m fixture cones, capped at
  // 0.45 × albedo. No emissive light is invented for aMat.z == 0.
  if (vMatP.z > 0.002 && uNight > 0.001) {
    vec3 nWf = inverseTransformDirection(normal, viewMatrix);
    float hb = max(0.0, vWPos.y - float(max((lmF2 >> 1) - 1, 0)) * 2.0);
    float fs = abs(nWf.x) > abs(nWf.z) ? vWPos.z : vWPos.x;
    float fd = abs(fract(fs / 6.0) - 0.5) * 6.0;
    float fw = 0.45 + hb * 0.24;
    float cone = min(1.0, (1.0 - smoothstep(fw * 0.4, fw, fd)) + (1.0 - smoothstep(fw * 0.4, fw, 6.0 - fd)));
    float hot = 1.0 + 1.6 * exp(-hb * 0.25);
    float side = 1.0 - 0.72 * max(0.0, nWf.y);
    float fk = vMatP.z * (0.2 + 0.8 * cone) * hot * side * 0.26;
    lmEm += lmAlbedo * uFloodColor * min(fk, 0.45) * uNight;
  }
  vec3 nWb = inverseTransformDirection(normal, viewMatrix);
  lmEm += lmAlbedo * uSkyH * 0.16 * max(0.0, -nWb.y) * (1.0 - 0.9 * uNight) * vCol.a;
  if (vMatP.y > 0.2) {
    vec3 vd = normalize(vViewPosition);
    vec3 rw = inverseTransformDirection(reflect(-vd, normal), viewMatrix);
    float fres = pow(1.0 - clamp(dot(normal, vd), 0.0, 1.0), 4.0);
    vec3 sky = mix(uSkyH, uSkyZ, smoothstep(-0.05, 0.6, rw.y));
    sky = mix(sky, uSkyH * 0.55, step(rw.y, -0.02));
    float k = vMatP.y * (1.0 - vMatP.x) * (0.35 + 0.65 * fres);
    lmEm += sky * k * mix(vec3(1.0), lmAlbedo * 1.6, clamp(vMatP.y * 1.4 - 0.3, 0.0, 1.0)) * (1.0 - 0.85 * uNight);
  }
  totalEmissiveRadiance = lmEm;
}
#include <emissivemap_fragment>
`;

function buildingState(material, extra = {}) {
  const uniforms = { uNight: { value: 0 }, uTime: { value: 0 }, uWet: { value: 0 },
    uWinLate: { value: 1 }, uFloodColor: { value: new THREE.Color(1, .72, .44) },
    uSkyH: { value: new THREE.Color(12109526) }, uSkyZ: { value: new THREE.Color(7311288) }, ...extra };
  const color = (target, value) => {
    if (Array.isArray(value)) target.fromArray(value);
    else if (value?.isColor) target.copy(value);
    else if (typeof value === 'number' || typeof value === 'string') target.set(value);
  };
  material.userData.sourceUniforms = uniforms;
  material.userData.setSourceWeather = (weather = {}) => {
    if (typeof weather === 'string') weather = { id: weather };
    const night = Number.isFinite(weather.night) ? weather.night : ({ day: 0, dusk: .5, night: 1 }[weather.id] ?? 0);
    uniforms.uNight.value = THREE.MathUtils.clamp(night, 0, 1);
    uniforms.uWet.value = THREE.MathUtils.clamp(weather.wet ?? weather.wetness ?? 0, 0, 1);
    uniforms.uWinLate.value = THREE.MathUtils.clamp(weather.sourceWinLate ?? 1, 0, 1);
    color(uniforms.uSkyH.value, weather.sourceSkyH ?? weather.sky?.horizonColor ?? weather.lighting?.fogColor);
    color(uniforms.uSkyZ.value, weather.sourceSkyZ ?? weather.sky?.skyZenith ?? weather.lighting?.hemiColor);
  };
  material.userData.setSourceTime = (time) => { if (Number.isFinite(time)) uniforms.uTime.value = time; };
  return uniforms;
}

function landmarkSurface(material, surfaceMap) {
  material.vertexColors = false;
  material.emissive.setRGB(0, 0, 0);
  const uniforms = buildingState(material, { uAtlas: { value: surfaceMap } });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\n' + LM_VERTEX).replace('#include <begin_vertex>', LM_BEGIN);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + LM_FRAGMENT)
      .replace('#include <map_fragment>', LM_ALBEDO)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vMatP.x;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vMatP.y;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        vec3 lmUpV = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
        float lmUp = dot(normal, lmUpV);
        roughnessFactor = mix(roughnessFactor, roughnessFactor * 0.28, uWet * smoothstep(0.55, 0.95, lmUp));`)
      .replace('#include <emissivemap_fragment>', LM_EMISSION)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
        reflectedLight.indirectDiffuse *= vCol.a;
        reflectedLight.directDiffuse *= mix(1.0, vCol.a, 0.45);
        reflectedLight.indirectSpecular *= mix(1.0, vCol.a, 0.6);`);
  };
  material.customProgramCacheKey = () => 'taipei-world-dy-r160-v1';
  material.userData.sourceShader = { file: 'world-BwYfSiTY.js', symbols: 'iy.vert / Dy / hy / gy / yy / by / xy / Cy / wy',
    limitations: ['Current site flags only; Taipei 101/New Year facade show and original atmospheric fog are excluded.',
      'Original analytic sky fallback is used; sky colors come from the active game weather.'] };
}

function authoredArt(def, map) {
  // world:LP creates sites-ext through content:Zg with uLight .95. The original
  // is MeshBasicMaterial: authored/baked colors and per-vertex light influence
  // must not become a fully lit facade or opacity mask.
  const material = new THREE.MeshBasicMaterial({ map, vertexColors: true,
    transparent: def.transparent ?? false, opacity: def.opacity ?? 1,
    depthWrite: def.depthWrite ?? true, side: def.side === 'double' ? THREE.DoubleSide : THREE.FrontSide });
  const uniforms = buildingState(material, { uLight: { value: new THREE.Color(def.sourceBucket === 'room' ? 1 : .95, def.sourceBucket === 'room' ? 1 : .95, def.sourceBucket === 'room' ? 1 : .95) } });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uLight;')
      .replace('#include <color_fragment>', `
        #if defined( USE_COLOR_ALPHA )
          float em = vColor.a;
          diffuseColor.rgb *= vColor.rgb * mix(uLight, vec3(1.0), em);
        #elif defined( USE_COLOR )
          diffuseColor.rgb *= vColor.rgb * uLight;
        #endif`)
      .replace('#include <opaque_fragment>', 'diffuseColor.a = opacity;\n#include <opaque_fragment>');
  };
  material.customProgramCacheKey = () => 'taipei-content-zg-r160-v1';
  material.userData.sourceMaterialType = 'source-authored-art';
  material.userData.sourceShader = { file: 'content-CycI_KHI.js', symbols: 'Zg / kU',
    limitations: ['Original source exterior light .95, interior light 1; optional candle flicker is not enabled by these source sites.'] };
  return material;
}

export function createSourceMaterial(def = {}, textures) {
  const texture = (id) => {
    if (!id) return null;
    if (!textures.has(id)) throw new Error(`Missing source texture: ${id}`);
    return textures.get(id);
  };
  const map = texture(def.map);
  if (def.sourceBucket === 'art' || def.sourceBucket === 'room') return authoredArt(def, map);
  const surfaceMap = def.surfaceMap ? texture(def.surfaceMap) : null;
  if (def.type === 'source-fx' || def.type === 'source-marker') {
    const material = new THREE.ShaderMaterial({
      vertexShader: def.vertexShader,
      fragmentShader: def.fragmentShader,
      uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
        uMap: { value: map }, uNight: { value: 0 }, uClock: { value: 0 }, uTime: { value: 0 },
        uSunDir: { value: new THREE.Vector3(-.6, 1, -.45).normalize() } },
      transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      premultipliedAlpha: true,
    });
    material.userData.sourceMaterialType = def.type;
    return material;
  }
  const material = new THREE.MeshStandardMaterial({
    vertexColors: def.vertexColors ?? true,
    map,
    roughnessMap: texture(def.roughnessMap),
    roughness: def.roughness ?? .8,
    metalness: def.metalness ?? 0,
    transparent: def.transparent ?? false,
    depthWrite: def.depthWrite ?? true,
    opacity: def.opacity ?? 1,
    alphaTest: def.alphaTest ?? 0,
    side: def.side === 'double' ? THREE.DoubleSide : THREE.FrontSide,
  });
  if (Array.isArray(def.color)) material.color.fromArray(def.color);
  if (def.emissiveIntensity) {
    material.emissive.setRGB(1, 1, 1);
    material.emissiveIntensity = def.emissiveIntensity;
  }
  material.userData.sourceLightTag = def.sourceLightTag ?? 0;
  material.userData.sourceMaterialType = def.type ?? 'standard';
  if (def.type === 'source-character') characterAtlas(material, map);
  if (def.type === 'source-vehicle') vehicleAtlas(material);
  if (def.type === 'source-marking') markingAtlas(material);
  if (def.sourceBucket === 'lm' || def.sourceBucket === 'leaves') {
    if (!surfaceMap) { material.dispose(); throw new Error('Missing source surface atlas'); }
    landmarkSurface(material, surfaceMap);
  }
  return material;
}
