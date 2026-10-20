import * as THREE from 'three';
import { ROAD_HALF_WIDTH, WALL_HALF_WIDTH, N_CHECKPOINTS } from '../track.js';
import { buildSourceCharacter } from './characters.js';
import { placements, shopIds, zones, templeEdges, commercialPlacements } from './taipei.js';

const MIN_CLEARANCE = WALL_HALF_WIDTH + 2.25;

function pose(track, s, lateral, yawOffset = 0) {
  const position = track.pointAt(s), tangent = track.tangentAt(s);
  position.x -= tangent.z * lateral;
  position.z += tangent.x * lateral;
  return { position, yaw: Math.atan2(tangent.x, tangent.z) + yawOffset };
}

// Distance uses the complete transformed source box, including props and overhangs.
function roadClearance(track, object, bounds) {
  const inverse = object.matrixWorld.clone().invert();
  const point = new THREE.Vector3();
  let minimum = Infinity;
  for (const sample of track.samples) {
    point.copy(sample.pos).applyMatrix4(inverse);
    const dx = Math.max(bounds.min[0] - point.x, 0, point.x - bounds.max[0]);
    const dz = Math.max(bounds.min[2] - point.z, 0, point.z - bounds.max[2]);
    minimum = Math.min(minimum, Math.hypot(dx, dz));
  }
  return minimum;
}

function footprint(object, bounds) {
  return [[bounds.min[0], bounds.min[2]], [bounds.max[0], bounds.min[2]],
    [bounds.max[0], bounds.max[2]], [bounds.min[0], bounds.max[2]]]
    .map(([x, z]) => new THREE.Vector3(x, 0, z).applyMatrix4(object.matrixWorld));
}

function overlaps(a, b, gap = 1.2) {
  for (const polygon of [a, b]) {
    for (let i = 0; i < 4; i++) {
      const next = polygon[(i + 1) % 4], current = polygon[i];
      const x = next.z - current.z, z = current.x - next.x, size = Math.hypot(x, z);
      const project = (points) => points.map((point) => (point.x * x + point.z * z) / size);
      const one = project(a), two = project(b);
      if (Math.max(...one) + gap <= Math.min(...two) || Math.max(...two) + gap <= Math.min(...one)) return false;
    }
  }
  return true;
}

// Replicate the exact source triangles/attributes and bend each segment onto Track.
// No template geometry or shared texture is modified.
function bendSource(root, track, segments, deform, label) {
  root.traverse((mesh) => {
    if (!mesh.geometry) return;
    const original = mesh.geometry;
    const geometry = original.clone();
    const count = original.attributes.position.count;
    for (const [name, attribute] of Object.entries(original.attributes)) {
      const array = new attribute.array.constructor(attribute.array.length * segments);
      for (let segment = 0; segment < segments; segment++) array.set(attribute.array, segment * attribute.array.length);
      geometry.setAttribute(name, new THREE.BufferAttribute(array, attribute.itemSize, attribute.normalized));
    }
    const sourceIndices = original.index ? original.index.array : Uint32Array.from({ length: count }, (_, i) => i);
    const indices = [];
    for (let segment = 0; segment < segments; segment++) {
      for (let i = 0; i < sourceIndices.length; i += 3) {
        const a = sourceIndices[i] + segment * count;
        const b = sourceIndices[i + 1] + segment * count;
        const c = sourceIndices[i + 2] + segment * count;
        indices.push(a, ...(deform.reverse ? [c, b] : [b, c]));
      }
      for (let i = 0; i < count; i++) {
        const source = original.attributes.position;
        const point = deform(source.getX(i), source.getY(i), source.getZ(i), segment, segments);
        geometry.attributes.position.setXYZ(segment * count + i, point.x, point.y, point.z);
        if (deform.uv && geometry.attributes.uv) {
          const uv = deform.uv(source.getX(i), source.getY(i), source.getZ(i), segment, segments, point);
          geometry.attributes.uv.setXY(segment * count + i, uv[0], uv[1]);
        }
      }
    }
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    mesh.geometry = geometry;
    mesh.userData.sourceMutableGeometry = true;
    mesh.userData.sourceDerivation = label;
    mesh.castShadow = false;
  });
}

export function buildSourceCity(track, lease, weather = { id: 'day' }) {
  const group = new THREE.Group();
  group.name = 'taipei-source-city';
  const definitions = new Map(lease.manifest.assets.map((asset) => [asset.id, asset]));
  const owned = [], placed = [], buildingFootprints = [], shaderMaterials = [], streetActors = [];
  let disposed = false, clock = 0;
  function add(id) {
    const object = lease.instantiate(id);
    owned.push(object);
    group.add(object);
    return object;
  }
  function discard(object) {
    owned.splice(owned.indexOf(object), 1);
    lease.releaseObject(object);
  }
  function street(id, s, lateral, yawOffset = 0, y = 0) {
    const object = add(id), transform = pose(track, s, lateral, yawOffset);
    object.position.copy(transform.position);
    object.position.y = y;
    object.rotation.y = transform.yaw;
    object.updateMatrixWorld(true);
    return object;
  }
  function building(definition, required = false) {
    const adjacentRepeat = placed.some((other) => {
      const distance = Math.abs(other.s - definition.s);
      return other.id === definition.id &&
        Math.abs(other.clearance - definition.clearance) < 15 &&
        Math.min(distance, 1 - distance) * track.length < 45;
    });
    if (adjacentRepeat && !required) return false;
    const bounds = definitions.get(definition.id)?.bounds;
    if (!bounds) throw new Error(`Missing source building bounds: ${definition.id}`);
    const lateral = definition.side * (definition.clearance - bounds.min[2]);
    const object = add(definition.id), tangent = track.tangentAt(definition.s);
    object.position.copy(pose(track, definition.s, lateral).position);
    // Preserve source ground datum, including intentionally sunken stairs.
    object.position.y = bounds.min[1] > -.07 ? Math.max(0, -bounds.min[1]) : 0;
    object.rotation.y = Math.atan2(-definition.side * tangent.z, definition.side * tangent.x);
    object.updateMatrixWorld(true);
    const polygon = footprint(object, bounds), clearance = roadClearance(track, object, bounds);
    if (clearance < MIN_CLEARANCE || buildingFootprints.some((other) => overlaps(polygon, other.polygon))) {
      discard(object);
      if (required) throw new Error(`Unsafe source hero placement: ${definition.id}`);
      return false;
    }
    const record = { ...definition, kind: 'building', lateral, roadClearance: clearance, object };
    object.userData.cityPlacement = { id: definition.id, s: definition.s, lateral, zone: zones.find((zone) => definition.s >= zone.start && definition.s < zone.end)?.id };
    placed.push(record);
    buildingFootprints.push({ polygon, record });
    return true;
  }
  try {
    // Ground templates carry source surface textures; scale the existing vertices.
    const ground = add('ground-concrete');
    const bounds = definitions.get('ground-concrete').bounds;
    const groundMap = (x, y, z) => new THREE.Vector3(
      (x - (bounds.min[0] + bounds.max[0]) / 2) * 900 / bounds.size[0],
      -.06, (z - (bounds.min[2] + bounds.max[2]) / 2) * 900 / bounds.size[2]);
    groundMap.uv = (x, y, z, segment, count, point) => [point.x / 3, point.z / 3];
    bendSource(ground, track, 1, groundMap, 'source-ground-concrete scaled to city foundation');
    const lawn = add('ground-grass'), lawnBounds = definitions.get('ground-grass').bounds;
    const lawnMap = (x, y, z) => new THREE.Vector3(
      (x - (lawnBounds.min[0] + lawnBounds.max[0]) / 2) * 175 / lawnBounds.size[0],
      -.025, (z - (lawnBounds.min[2] + lawnBounds.max[2]) / 2) * 100 / lawnBounds.size[2]);
    lawnMap.uv = (x, y, z, segment, count, point) => [point.x / 4, point.z / 4];
    bendSource(lawn, track, 1, lawnMap, 'source-ground-grass scaled to inner urban garden');
    const segments = Math.ceil(track.length / 5);
    function roadPoint(x, y, z, segment, count, lateral) {
      const s = (segment + (z + 5) / 10) / count;
      const point = track.pointAt(s), tangent = track.tangentAt(s);
      point.x -= tangent.z * lateral;
      point.z += tangent.x * lateral;
      point.y = y;
      return point;
    }
    const road = add('road-surface');
    const roadMap = (x, y, z, segment, count) => roadPoint(x, y, z, segment, count, -x * ROAD_HALF_WIDTH);
    roadMap.uv = (x, y, z, segment, count) => [x * ROAD_HALF_WIDTH / 7, (segment + (z + 5) / 10) * track.length / count / 7];
    bendSource(road, track, segments, roadMap,
      'source road cross-section widened to 15m and bent along unchanged flat Track');
    for (const side of [-1, 1]) {
      for (const id of ['curb', 'sidewalk']) {
        const root = add(id);
        const map = (x, y, z, segment, count) => roadPoint(x, y, z, segment, count,
          side * (ROAD_HALF_WIDTH + (id === 'curb' ? x - 1 : .26 + (x - 1.26) * 1.8)));
        map.reverse = side > 0;
        map.uv = (x, y, z, segment, count) => [
          (segment + (z + 5) / 10) * track.length / count / (id === 'curb' ? 2 : 2.4),
          (id === 'curb' ? x : (x - 1.26) * 1.8) / (id === 'curb' ? 2 : 2.4)];
        bendSource(root, track, segments, map, `source ${id} bent along Track; side ${side}`);
      }
    }
    for (const definition of placements) building(definition, true);
    // Distribute each district independently so later districts retain their share.
    let shopIndex = 0;
    for (const [start, end] of [[.005, .24], [.245, .455]]) {
      let accepted = 0;
      for (let s = start; s < end && accepted < 18; s += .0175) {
        for (const side of [-1, 1]) {
          const id = shopIds[shopIndex++ % shopIds.length];
          if (building({ id, s, side, clearance: side < 0 ? 11.8 : 12.5 })) accepted++;
        }
      }
    }
    for (const definition of commercialPlacements) building({ ...definition, layer: 'retail-forecourt' });
    for (const definition of templeEdges) building(definition);
    // Source paving and grass form a bounded square at road level. The broad
    // city foundation stays below these local surfaces, not an exposed horizon.
    function landscapeRibbon(id, name, start, end, near, far, height) {
      const root = add(id), box = definitions.get(id).bounds;
      root.name = name;
      const count = Math.ceil((end - start) * track.length / 5);
      const map = (x, y, z, segment, total) => {
        const fraction = (segment + (z - box.min[2]) / box.size[2]) / total;
        const s = start + fraction * (end - start);
        const lateral = near + (x - box.min[0]) / box.size[0] * (far - near);
        const point = pose(track, s, lateral).position;
        point.y = height;
        return point;
      };
      map.reverse = far > near;
      const repeat = lease.getAsset(id).parameters?.repeatMetres ?? 3;
      map.uv = (x, y, z, segment, total, point) => [point.x / repeat, point.z / repeat];
      bendSource(root, track, count, map, `${id} assembled as ${name}; same source surface, world metre UVs`);
      return root;
    }
    landscapeRibbon('ground-granite', 'commercial-inner-forecourt', .735, .990, 10.95, 18.1, .008);
    landscapeRibbon('ground-granite', 'commercial-outer-forecourt', .735, .990, -15.1, -10.95, .008);
    // A finite planted corner occupies only the real gap between the retail
    // buildings. Its four source-curb edges make the setback an intentional place.
    const cornerStart = .805, cornerEnd = .850, cornerNear = -15.51, cornerFar = -32;
    landscapeRibbon('ground-grass', 'commercial-corner-garden',
      cornerStart, cornerEnd, cornerFar, cornerNear, .009);
    for (const [name, lateral] of [['near', cornerNear], ['far', cornerFar - .26]]) {
      const edge = add('curb');
      edge.name = 'commercial-corner-' + name + '-curb';
      const count = Math.ceil((cornerEnd - cornerStart) * track.length / 5);
      const map = (x, y, z, segment, total) => {
        const s = cornerStart + (segment + (z + 5) / 10) / total * (cornerEnd - cornerStart);
        const point = pose(track, s, lateral + x - 1).position;
        point.y = y + .009;
        return point;
      };
      map.reverse = true;
      map.uv = (x, y, z, segment, total) => [
        (segment + (z + 5) / 10) / total * (cornerEnd - cornerStart) * track.length / 2, y / 2];
      bendSource(edge, track, count, map, 'source curb bounding the retail corner garden');
    }
    for (const [name, s] of [['start', cornerStart], ['end', cornerEnd]]) {
      const edge = add('curb');
      edge.name = 'commercial-corner-' + name + '-curb';
      const tangent = track.tangentAt(s), origin = track.pointAt(s);
      const map = (x, y, z) => {
        const lateral = cornerNear + (z + 5) / 10 * (cornerFar - cornerNear);
        return new THREE.Vector3(origin.x + tangent.x * (x - 1) - tangent.z * lateral,
          y + .009, origin.z + tangent.z * (x - 1) + tangent.x * lateral);
      };
      map.reverse = true;
      map.uv = (x, y, z) => [(z + 5) / 10 * (cornerNear - cornerFar) / 2, y / 2];
      bendSource(edge, track, 1, map, 'source curb capping the finite retail garden');
    }
    for (const [s, lateral] of [[.815, -23.7], [.828, -24.8], [.840, -23.7]]) {
      const tree = street('tree-camphor', s, lateral);
      const box = definitions.get('tree-camphor').bounds;
      if (roadClearance(track, tree, box) < MIN_CLEARANCE ||
        buildingFootprints.some(({ polygon }) => overlaps(footprint(tree, box), polygon, .5))) discard(tree);
      else tree.userData.commercialGardenTree = true;
    }
    landscapeRibbon('ground-grass', 'temple-inner-garden', .455, .722, 12.4, 35.2, .006);
    landscapeRibbon('ground-grass', 'temple-outer-green-edge', .445, .732, -76.5, -66, .006);
    landscapeRibbon('ground-plaza', 'temple-front-plaza', .495, .596, -16.35, -10.95, .008);
    landscapeRibbon('ground-granite', 'temple-garden-walk', .455, .722, 10.95, 12.4, .010);
    // The source curb defines both garden edges rather than inventing a wall.
    for (const lateral of [12.15, 35.2]) {
      const edge = add('curb');
      edge.name = lateral < 20 ? 'temple-garden-boundary' : 'temple-garden-back-boundary';
      const count = Math.ceil(.267 * track.length / 5);
      const map = (x, y, z, segment, total) => {
        const s = .455 + (segment + (z + 5) / 10) / total * .267;
        const point = pose(track, s, lateral + x - 1).position;
        point.y = y + .008;
        return point;
      };
      map.reverse = true;
      map.uv = (x, y, z, segment, total) => [
        (segment + (z + 5) / 10) / total * .267 * track.length / 2, y / 2];
      bendSource(edge, track, count, map, 'source curb defining temple garden boundary');
    }
    // Trees are behind the inside walking edge. No tree sits between road and
    // temple gate on the outside of the focal .505-.58 approach.
    for (let i = 0; i < 15; i++) {
      const s = .466 + i * .017;
      for (const lateral of [16.7, 30.2]) {
        const tree = street(i % 4 ? 'tree-camphor' : 'tree-banyan', s, lateral);
        const box = definitions.get(tree.name).bounds;
        if (roadClearance(track, tree, box) < MIN_CLEARANCE ||
          buildingFootprints.some(({ polygon }) => overlaps(footprint(tree, box), polygon, .5))) discard(tree);
        else tree.userData.templeGardenTree = true;
      }
    }
    // Layer foliage in front of the low outer street, behind the temple's
    // complete 47m-deep footprint. This closes the horizon without hiding its gate.
    for (let i = 0; i < 15; i++) {
      const tree = street(i % 3 ? 'tree-camphor' : 'tree-banyan', .455 + i * .018, -71.2);
      const box = definitions.get(tree.name).bounds;
      if (roadClearance(track, tree, box) < MIN_CLEARANCE ||
        buildingFootprints.some(({ polygon }) => overlaps(footprint(tree, box), polygon, .5))) discard(tree);
      else tree.userData.templePeripheryTree = true;
    }
    // Use intact round-crown source trees in real inter-building gaps to break
    // exposed side-wall silhouettes. Do not cut walls or embedded crowd meshes.
    for (const [target, side] of [[.177, 1], [.205, 1], [.332, -1], [.354, -1]]) {
      for (let trial = 0; trial < 15; trial++) {
        const delta = (trial % 2 ? 1 : -1) * Math.ceil(trial / 2) * .0008;
        const tree = street('tree-camphor', target + delta, side * 14.8);
        const box = definitions.get('tree-camphor').bounds;
        if (roadClearance(track, tree, box) < MIN_CLEARANCE ||
          buildingFootprints.some(({ polygon }) => overlaps(footprint(tree, box), polygon, .2))) discard(tree);
        else {
          tree.userData.sidewallScreen = true;
          break;
        }
      }
    }
    for (const [id, s, lateral] of [
      ['plant-money-tree', .765, 13.2], ['plant-money-tree', .812, 13.2],
      ['plant-money-tree', .858, 13.2], ['plant-money-tree', .933, 13.2],
      ['bicycle', .805, 12.8], ['bicycle', .914, -12.8],
    ]) {
      const prop = street(id, s, lateral);
      const box = definitions.get(id).bounds;
      if (roadClearance(track, prop, box) < MIN_CLEARANCE ||
        buildingFootprints.some(({ polygon }) => overlaps(footprint(prop, box), polygon, .2))) discard(prop);
    }
    // Sidewalk trees break long facades, with the temple approach kept open.
    for (let i = 0; i < 30; i++) {
      const s = (i + .45) / 30;
      if (s > .46 && s < .62) continue;
      const side = i % 2 ? 1 : -1;
      const tree = street(i % 3 ? 'tree-camphor' : 'tree-banyan', s, side * 16);
      const box = definitions.get(tree.name).bounds;
      if (roadClearance(track, tree, box) < 10.6 || buildingFootprints.some(({ polygon }) => overlaps(footprint(tree, box), polygon, .5))) discard(tree);
    }
    for (let i = 0; i < 30; i++) {
      const s = i / 30;
      if (s > .47 && s < .57) continue;
      const side = i % 2 ? 1 : -1;
      // Lamp arm is source -Z; orient it inward across the sidewalk.
      const tangent = track.tangentAt(s);
      const lamp = street('street-lamp', s, side * 10.7);
      lamp.rotation.y = Math.atan2(-side * tangent.z, side * tangent.x);
      if (weather.id !== 'day' && i % 3 === 0) {
        const light = new THREE.PointLight(0xffdfa8, weather.id === 'night' ? 7 : 3, 20, 2);
        light.position.set(0, 7.8, -3.8);
        lamp.add(light);
      }
    }
    // Parked source vehicles stay outside both the driving and wall envelope.
    for (const [id, s, lateral] of [
      ['taxi', .100, -11], ['scooter', .168, -10.5], ['scooter', .174, -10.5],
      ['scooter', .320, -11.5], ['bus', .430, -12.5], ['taxi', .830, 11.5],
    ]) {
      const object = street(id, s, lateral);
      const box = definitions.get(id).bounds;
      if (roadClearance(track, object, box) < 9 || buildingFootprints.some(({ polygon }) => overlaps(footprint(object, box), polygon, .2))) discard(object);
    }
    // Keep the same street placements, but initialize the original rest pose,
    // open eyelids and original in-place gestures through the source controller.
    for (const [id, s, lateral, clip] of [
      ['character-jie', .140, 10.5, 'idle'],
      ['character-vendor', .310, -11, 'wave'],
      ['character-ama', .590, -12, 'idle'],
    ]) {
      const actor = buildSourceCharacter(id, lease);
      streetActors.push(actor);
      const transform = pose(track, s, lateral);
      actor.mesh.position.copy(transform.position);
      actor.mesh.rotation.y = transform.yaw;
      actor.play(clip, { fade: 0, loop: true });
      actor.update(0);
      group.add(actor.mesh);
      const box = definitions.get(id).bounds;
      // Bounds stay in original source coordinates; include the adapter's
      // forward-axis rotation in the full sourceRoot world matrix.
      if (roadClearance(track, actor.sourceRoot, box) < 9 ||
        buildingFootprints.some(({ polygon }) => overlaps(footprint(actor.sourceRoot, box), polygon, .2))) {
        actor.dispose();
        streetActors.pop();
      }
    }
    for (let i = 0; i < N_CHECKPOINTS; i++) {
      const s = i / N_CHECKPOINTS;
      for (const side of [-1, 1]) {
        street('checkpoint-sign', s, side * 10.3, Math.PI);
        const marker = street('source-markers', s, side * 9.9, 0, 3.1);
        marker.traverse((mesh) => {
          if (!mesh.isInstancedMesh) return;
          mesh.geometry.attributes.iColor.setXYZW(0, 1, .88, .56, .92);
          mesh.geometry.attributes.iParam.setXYZW(0, i === 0 ? 13 : 9, 2.3, 0, .05);
          mesh.geometry.attributes.iColor.needsUpdate = true;
          mesh.geometry.attributes.iParam.needsUpdate = true;
        });
      }
    }
    // Source markings preserve their own atlas, UVs and alpha semantics.
    for (const id of ['road-markings', 'crosswalk']) {
      const marking = add(id), markingBounds = definitions.get(id).bounds;
      if (id === 'road-markings') {
        bendSource(marking, track, segments, (x, y, z, segment, count) => {
          // Move stripe centres, preserving their source 15cm / 24cm widths.
          const stripe = Math.max(-1, Math.min(1, Math.round(x)));
          const across = stripe * (ROAD_HALF_WIDTH - .5) + (x - stripe);
          return roadPoint(x, y, z, segment, count, -across);
        }, 'source atlas road markings widened and bent to the same Track centerline');
      } else {
        const transform = pose(track, 0, 0);
        marking.position.copy(transform.position);
        marking.position.y = .018;
        marking.rotation.y = transform.yaw;
        marking.scale.x = ROAD_HALF_WIDTH * 2 / markingBounds.size[0];
        marking.traverse((mesh) => {
          if (!mesh.geometry?.attributes.uv) return;
          mesh.geometry = mesh.geometry.clone();
          mesh.userData.sourceMutableGeometry = true;
          mesh.userData.sourceDerivation = 'source crosswalk widened with preserved zebra stripe pitch';
          const uv = mesh.geometry.attributes.uv;
          for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * marking.scale.x);
        });
      }
    }
    group.updateMatrixWorld(true);
    group.traverse((object) => {
      if (!object.material) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        material.userData.setSourceWeather?.(weather);
        if (material.uniforms || material.userData.setSourceTime) shaderMaterials.push(material);
        if (material.uniforms?.uNight) material.uniforms.uNight.value = weather.id === 'night' ? 1 : weather.id === 'dusk' ? .5 : 0;
      }
    });
  } catch (error) {
    for (const actor of streetActors) actor.dispose();
    for (const object of [...owned]) lease.releaseObject(object);
    throw error;
  }
  return {
    group,
    update(dt = 0, elapsed) {
      if (disposed) return;
      clock = Number.isFinite(elapsed) ? elapsed : clock + dt;
      for (const actor of streetActors) actor.update(dt);
      for (const material of shaderMaterials) {
        material.userData.setSourceTime?.(clock);
        if (material.uniforms?.uTime) material.uniforms.uTime.value = clock;
        if (material.uniforms?.uClock) material.uniforms.uClock.value = clock;
      }
    },
    audit() {
      group.updateMatrixWorld(true);
      const missingSourceIds = [], invalidTransforms = [], sourceIds = new Set();
      group.traverse((object) => {
        if (!object.geometry) return;
        if (!object.userData.sourceAssetId) missingSourceIds.push(object.name || object.uuid);
        else sourceIds.add(object.userData.sourceAssetId);
        if (!object.matrixWorld.elements.every(Number.isFinite)) invalidTransforms.push(object.name || object.uuid);
      });
      const records = placed.map(({ object, ...record }) => ({ ...record,
        roadClearance: roadClearance(track, object, definitions.get(record.id).bounds) }));
      const overlappingBuildings = [];
      for (let i = 0; i < buildingFootprints.length; i++) {
        for (let j = i + 1; j < buildingFootprints.length; j++) {
          if (overlaps(buildingFootprints[i].polygon, buildingFootprints[j].polygon, 0)) overlappingBuildings.push([i, j]);
        }
      }
      return { missingSourceIds, invalidTransforms, sourceIds: [...sourceIds], placements: records,
        unsafePlacements: records.filter((record) => record.roadClearance < MIN_CLEARANCE), overlappingBuildings };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const actor of streetActors) actor.dispose();
      for (const object of owned) lease.releaseObject(object);
      group.removeFromParent();
    },
  };
}
