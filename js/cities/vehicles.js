import * as THREE from 'three';

// The shipped source's speed/dimensions/gears are retained. Accel and brake are
// scaled ×3 for this game's torque curve; these are physics parameters, not meshes.
function definition(asset, name, nameEn, paint, speed, accel, brake, width, gears, grip, radius, stats) {
  return Object.freeze({
    id: 'taipei-' + asset, cityId: 'taipei', sourceAssetId: asset, builder: 'source',
    name, nameEn, class: asset === 'police' ? '警車' : '來源車輛', paint,
    desc: `台北來源${name}，保留原車身與輪組`, descEn: `Original Taipei ${nameEn.toLowerCase()} body and wheels`,
    stats: Object.freeze(stats), wheelRadius: radius,
    tune: Object.freeze({ maxSpeed: speed, maxReverse: 9, engineForce: accel * 3,
      brakeForce: brake * 3, carHalfWidth: width, gears, gripNormal: grip,
      gripDrift: asset === 'sports' ? 2.2 : 1.9, steerMax: asset === 'suv' ? .56 : .6 }),
  });
}

export const sourceCarDefinitions = Object.freeze([
  definition('sedan', '轎車', 'Sedan', 15921904, 50, 6.4, 12, .9, 5, 7.5, .33, { speed: 3, accel: 3, grip: 3, drift: 3 }),
  definition('taxi', '計程車', 'Taxi', 16171547, 170 / 3.6, 5.9, 11.5, .9, 5, 7.2, .33, { speed: 3, accel: 3, grip: 3, drift: 3 }),
  definition('sports', '跑車', 'Sports Car', 14163750, 275 / 3.6, 10.5, 15.5, .97, 6, 8.5, .34, { speed: 5, accel: 5, grip: 4, drift: 4 }),
  definition('suv', '休旅車', 'SUV', 15921904, 165 / 3.6, 5.5, 10.5, .95, 5, 6.6, .38, { speed: 3, accel: 2, grip: 3, drift: 2 }),
]);
export const sourcePoliceDefinition = definition('police', '警車', 'Police Car', 1121586, 200 / 3.6, 7.8, 13, .92, 5, 8, .34, { speed: 4, accel: 4, grip: 4, drift: 3 });

const gamePoint = ([x, y, z]) => new THREE.Vector3(-x, y, -z);
const clamp = (value) => THREE.MathUtils.clamp(Number(value) || 0, 0, 1);
const step = (threshold, value) => value >= threshold ? 1 : 0;
const fract = (value) => value - Math.floor(value);

function sourceLightIntensity(tag, state, time) {
  const { headlights: head, brake, reverse, siren, night, indicatorLeft, indicatorRight } = state;
  const blink = step(.5, fract((time + state.seed * 3.7) * 1.45));
  switch (tag) {
    case 1: return .35 + head * 3.2;
    case 2: return .12 + head * 1.4 + brake * 3.2;
    case 3: return brake * 3.6;
    case 4: return indicatorLeft * blink * 3;
    case 5: return indicatorRight * blink * 3;
    case 6: return siren * step(.5, fract(time * 2.6)) * (.55 + .45 * step(.5, fract(time * 13))) * 6;
    case 7: return siren * step(.5, fract(time * 2.6 + .5)) * (.55 + .45 * step(.5, fract(time * 13 + .3))) * 6;
    case 8: return reverse * 2.6;
    case 9: return .55 + night * 1.9;
    case 10: return .15 + night * 1.6;
    case 11: return step(.5, fract(time * 1.2 + state.seed)) * (1 + night * 2) * (.6 + .4 * siren);
    case 12: return head * .45;
    case 13: return THREE.MathUtils.smoothstep(night, .2, .8) * .75;
    case 14: return 0; // Occupied player/race vehicle.
    case 15: return siren * step(.7, fract(time * 5.2)) * 5;
    case 16: return .55 + night * 1.9;
    default: return 0;
  }
}

function lampMaterials(root) {
  const lamps = [];
  root.traverse((object) => {
    if (!object.isMesh) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      const tag = material.userData.sourceLightTag;
      if (!tag) continue;
      const intensity = { value: 0 };
      const compile = material.onBeforeCompile;
      const cacheKey = material.customProgramCacheKey.bind(material);
      material.emissive.setRGB(0, 0, 0);
      material.onBeforeCompile = (shader, renderer) => {
        compile.call(material, shader, renderer);
        shader.uniforms.sourceLampIntensity = intensity;
        shader.fragmentShader = 'uniform float sourceLampIntensity;\n' + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * sourceLampIntensity;');
      };
      material.customProgramCacheKey = () => cacheKey() + '-source-lamps-v1';
      material.userData.sourceLampIntensity = intensity;
      lamps.push({ material, tag, intensity });
    }
  });
  return lamps;
}

export function buildSourceVehicle(def, lease) {
  if (!def?.sourceAssetId || !lease?.instantiate || !lease?.getAsset) throw new Error('A source vehicle definition and city lease are required');
  const data = lease.getAsset(def.sourceAssetId);
  const wheelDefs = data.parts?.wheels;
  if (!Array.isArray(wheelDefs) || wheelDefs.length !== 4 || wheelDefs.some((wheel) => !Array.isArray(wheel.pivot) || wheel.pivot.length !== 3 || !wheel.pivot.every(Number.isFinite) || !(wheel.radius > 0))) {
    throw new Error(`Missing source wheel semantics: ${def.sourceAssetId}`);
  }
  const mesh = lease.instantiate(def.sourceAssetId);
  try {
    const sourceMeshes = [];
    mesh.traverse((object) => { if (object.isMesh) sourceMeshes.push(object); });
    const bodyGroup = new THREE.Group();
    bodyGroup.name = 'source-vehicle-body';
    const sourceBody = new THREE.Group();
    sourceBody.rotation.y = Math.PI;
    sourceBody.name = 'source-forward-to-game';
    mesh.add(bodyGroup); bodyGroup.add(sourceBody);
    const wheels = wheelDefs.map((wheel) => {
      const group = new THREE.Group(), spinner = new THREE.Group(), offset = new THREE.Group();
      group.name = wheel.id + '-steering'; spinner.name = wheel.id + '-spin';
      group.position.copy(gamePoint(wheel.pivot));
      offset.rotation.y = Math.PI;
      group.add(spinner); spinner.add(offset); bodyGroup.add(group);
      const pieces = sourceMeshes.filter((piece) => piece.userData.sourcePart === wheel.id);
      if (!pieces.length) throw new Error(`Missing source wheel geometry: ${def.sourceAssetId}/${wheel.id}`);
      for (const piece of pieces) {
        // Source positions remain immutable in vehicle space; cancel their pivot
        // using an Object3D translation before spinning around the game X axis.
        piece.position.fromArray(wheel.pivot).multiplyScalar(-1);
        offset.add(piece);
      }
      return { group, spinner, steerable: !!wheel.steer, radius: wheel.radius,
        sourcePivot: [...wheel.pivot], sourcePart: wheel.id };
    });
    for (const piece of sourceMeshes) if (!piece.userData.sourcePart?.startsWith('wheel-')) sourceBody.add(piece);
    const lamps = lampMaterials(mesh);
    const state = { headlights: 0, brake: 0, reverse: 0, siren: 0, night: 0,
      indicatorLeft: 0, indicatorRight: 0, seed: data.parameters?.seed ?? .5 };
    let clock = 0;
    const updateLights = (time = clock) => {
      clock = Number.isFinite(time) ? time : clock;
      for (const { tag, material, intensity } of lamps) {
        intensity.value = sourceLightIntensity(tag, state, clock);
        material.emissiveIntensity = intensity.value;
      }
    };
    const setLights = (values) => {
      for (const key of Object.keys(state)) if (key !== 'seed' && values[key] !== undefined) state[key] = clamp(values[key]);
      updateLights();
    };
    const sourceTuning = data.parameters?.tuning ?? {};
    const sourceDef = data.parameters?.definition ?? {};
    const cameraAnchors = Object.fromEntries(['seat', 'headAt', 'tailAt', 'exhaustAt', 'engineAt', 'sirenAt']
      .filter((key) => Array.isArray(sourceTuning[key])).map((key) => [key, gamePoint(sourceTuning[key])]));
    // Camera eye/hood offsets are explicit view composition, not substitute geometry.
    if (cameraAnchors.seat) cameraAnchors.cockpit = cameraAnchors.seat.clone().add(new THREE.Vector3(0, .65, 0));
    if (cameraAnchors.headAt) cameraAnchors.hood = cameraAnchors.headAt.clone().add(new THREE.Vector3(0, .2, -.15));
    updateLights();
    return { mesh, parts: { bodyGroup, wheels, wheelRadius: wheelDefs[0].radius,
      headlights: [], sourceAssetId: def.sourceAssetId, cameraAnchors,
      collisionDimensions: { halfWidth: sourceDef.halfW, halfLength: sourceDef.halfL, height: sourceDef.height },
      cockpitAvailable: false, sourceForward: new THREE.Vector3(0, 0, -1),
      flipPivot: new THREE.Vector3(0, (sourceDef.height ?? 1.5) / 2, 0),
      setLights, setBraking: (braking) => setLights({ brake: +!!braking }), updateLights,
      flashPolice(flash) {
        state.siren = 1;
        updateLights();
        for (const lamp of lamps) if (lamp.tag === 6 || lamp.tag === 7) {
          lamp.intensity.value = (lamp.tag === 6) === !!flash ? 6 : 0;
          lamp.material.emissiveIntensity = lamp.intensity.value;
        }
      },
    } };
  } catch (error) {
    lease.releaseObject(mesh);
    throw error;
  }
}
