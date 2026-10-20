import * as THREE from 'three';
import { createSourceMaterial } from './source-materials.js';

const ARRAY_TYPES = { Float32Array, Uint8Array, Uint16Array, Uint32Array, Int8Array, Int16Array, Int32Array };

function geometryFrom(mesh, id) {
  const geometry = mesh.material?.type === 'source-fx' ? new THREE.InstancedBufferGeometry() : new THREE.BufferGeometry();
  try {
    for (const [name, value] of Object.entries(mesh.attributes)) {
      const Type = ARRAY_TYPES[value.type];
      if (!Type || !Number.isInteger(value.itemSize) || value.itemSize < 1 || value.array.length % value.itemSize) {
        throw new Error(`Invalid source attribute: ${id}/${name}`);
      }
      if (!value.array.every(Number.isFinite)) throw new Error(`Non-finite source attribute: ${id}/${name}`);
      const Attribute = name.startsWith('i') && mesh.material?.type === 'source-fx' ? THREE.InstancedBufferAttribute : THREE.BufferAttribute;
      geometry.setAttribute(name, new Attribute(new Type(value.array), value.itemSize, value.normalized ?? false));
    }
    const position = geometry.getAttribute('position');
    if (!position || position.itemSize !== 3) throw new Error(`Missing source positions: ${id}`);
    for (const attribute of Object.values(geometry.attributes)) {
      if (!attribute.isInstancedBufferAttribute && attribute.count !== position.count) throw new Error(`Source attribute count mismatch: ${id}`);
    }
    // aCol.a carries source AO, not opacity or emission. Keep it; expose RGB for plain material paths.
    if (!geometry.hasAttribute('color') && geometry.hasAttribute('aCol')) {
      const source = geometry.getAttribute('aCol');
      const colors = new Float32Array(source.count * 3);
      for (let i = 0; i < source.count; i++) colors.set([source.getX(i), source.getY(i), source.getZ(i)], i * 3);
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    }
    if (mesh.index) {
      if (mesh.index.length % 3 || !mesh.index.every((i) => Number.isInteger(i) && i >= 0 && i < position.count)) {
        throw new Error(`Invalid source triangle indices: ${id}`);
      }
      geometry.setIndex(mesh.index);
    }
    if (!geometry.hasAttribute('normal')) geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  } catch (error) {
    geometry.dispose();
    throw error;
  }
}

function bindSkeleton(root, definition) {
  const { jointNames, jointPositions, parents } = definition;
  const bones = jointNames.map((name, i) => {
    const bone = new THREE.Bone();
    bone.name = name;
    bone.position.fromArray(jointPositions, i * 3);
    if (parents[i] >= 0) bone.position.sub(new THREE.Vector3().fromArray(jointPositions, parents[i] * 3));
    return bone;
  });
  bones.forEach((bone, i) => (parents[i] < 0 ? root : bones[parents[i]]).add(bone));
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  skeleton.calculateInverses();
  return skeleton;
}

// Owns shared geometry/textures; callers own only transforms and instance materials.
export function createSourceLibrary(manifest, documents, textures, dependencies = new Map()) {
  const templates = new Map();
  const instances = new Set();
  let disposed = false;
  try {
    for (const asset of manifest.assets) {
      const document = documents.get(asset.id);
      if (!document) throw new Error(`Missing source asset document: ${asset.id}`);
      const meshes = [];
      templates.set(asset.id, { asset, document, meshes });
      for (const mesh of document.meshes ?? []) {
        const geometry = geometryFrom(mesh, asset.id);
        meshes.push({ geometry, definition: mesh });
        // Validate texture references before this library can become ready.
        const material = createSourceMaterial(mesh.material, textures);
        material.dispose();
      }
    }
  } catch (error) {
    for (const { meshes } of templates.values()) for (const { geometry } of meshes) geometry.dispose();
    throw error;
  }

  function releaseObject(root) {
    if (!instances.delete(root)) return;
    const skeletons = new Set();
    root.traverse((object) => {
      if (object.skeleton) skeletons.add(object.skeleton);
      if (object.userData.sourceMutableGeometry) object.geometry.dispose();
      if (object.isInstancedMesh) object.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) material?.dispose();
    });
    for (const skeleton of skeletons) skeleton.dispose();
    root.removeFromParent();
  }

  return {
    manifest, instances, dependencies,
    getAsset(id) {
      if (disposed) throw new Error('Source library is disposed');
      const template = templates.get(id);
      if (!template) throw new Error(`Missing source asset: ${id}`);
      return template.document;
    },
    instantiate(id) {
      if (disposed) throw new Error('Source library is disposed');
      const template = templates.get(id);
      if (!template) throw new Error(`Missing source asset: ${id}`);
      const root = new THREE.Group();
      root.name = id;
      root.userData.sourceAssetId = id;
      root.userData.sourceManaged = true;
      root.userData.releaseSource = () => releaseObject(root);
      instances.add(root);
      try {
        const skeleton = template.document.skeleton ? bindSkeleton(root, template.document.skeleton) : null;
        for (const { geometry, definition } of template.meshes) {
          const material = createSourceMaterial(definition.material, textures);
          const type = definition.material?.type;
          const mutable = type === 'source-fx' || type === 'source-marker';
          const instanceGeometry = mutable ? geometry.clone() : geometry;
          let mesh;
          if (type === 'source-marker') {
            instanceGeometry.setAttribute('iColor', new THREE.InstancedBufferAttribute(new Float32Array([1, 1, 1, 0]), 4));
            instanceGeometry.setAttribute('iParam', new THREE.InstancedBufferAttribute(new Float32Array([5, 4, 0, 0]), 4));
            instanceGeometry.setAttribute('iKind', new THREE.InstancedBufferAttribute(new Float32Array([3]), 1));
            mesh = new THREE.InstancedMesh(instanceGeometry, material, 1);
            mesh.setMatrixAt(0, new THREE.Matrix4());
          } else {
            mesh = skeleton ? new THREE.SkinnedMesh(instanceGeometry, material) : new THREE.Mesh(instanceGeometry, material);
          }
          if (type === 'source-fx') instanceGeometry.instanceCount = 1;
          if (mutable) mesh.frustumCulled = false;
          mesh.name = definition.name;
          mesh.userData = { sourceAssetId: id, source: template.asset.source, sourceManaged: true,
            sourcePart: definition.part, sourcePivot: definition.pivot, sourceMutableGeometry: mutable };
          // These shaders hide/reposition primitive vertices and composite light.
          // A default MeshDepthMaterial would cast their entire raw quad/cylinder.
          const shaderEffect = type === 'source-fx' || type === 'source-marker';
          mesh.castShadow = !shaderEffect;
          mesh.receiveShadow = !shaderEffect;
          root.add(mesh);
          if (skeleton) mesh.bind(skeleton);
        }
        return root;
      } catch (error) {
        releaseObject(root);
        throw error;
      }
    },
    releaseObject,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const root of [...instances]) releaseObject(root);
      for (const { meshes } of templates.values()) for (const { geometry } of meshes) geometry.dispose();
      for (const texture of new Set(textures.values())) {
        texture.dispose();
        texture.image?.close?.();
      }
      templates.clear();
    },
  };
}
