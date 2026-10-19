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

export function createSourceMaterial(def = {}, textures) {
  const texture = (id) => {
    if (!id) return null;
    if (!textures.has(id)) throw new Error(`Missing source texture: ${id}`);
    return textures.get(id);
  };
  const map = texture(def.map);
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
  return material;
}
