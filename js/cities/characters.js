import * as THREE from 'three';

const CHARACTER_IDS = Object.freeze({
  cop: 'character-police', police: 'character-police', officer: 'character-police',
  thief: 'character-jie', suspect: 'character-jie', jie: 'character-jie',
  pedestrian: 'character-ama', ama: 'character-ama', vendor: 'character-vendor',
});
// Source has no handcuff/surrender clip. The original cheer arms-up action is
// explicitly reused for that event; arrest uses the original pointing gesture.
export const sourceCharacterActions = Object.freeze({
  idle: 'idle', walk: 'walk', run: 'run', stop: 'stop_walk', arrest: 'point',
  surrender: 'cheer', raiseHands: 'cheer', wave: 'wave', cheer: 'cheer',
});

function clipsFrom(data, rig) {
  if (data?.format !== 'taipei-source-animation-v1' || !Array.isArray(data.clips)) throw new Error('Missing source animation library');
  const scale = rig.animationScale ?? rig.jointPositions[1] / .977;
  return data.clips.map((clip) => {
    const tracks = [];
    for (const [index, name] of data.boneNames.entries()) {
      if (!rig.jointNames.includes(name)) throw new Error(`Missing source animation bone: ${name}`);
      const values = new Float32Array(clip.times.length * 4);
      for (let frame = 0; frame < clip.times.length; frame++) {
        const offset = (frame * data.boneNames.length + index) * 4;
        values.set(clip.quaternions.slice(offset, offset + 4), frame * 4);
      }
      tracks.push(new THREE.QuaternionKeyframeTrack(name + '.quaternion', clip.times, values));
    }
    tracks.push(new THREE.VectorKeyframeTrack('hips.position', clip.times, clip.hips.map((value) => value * scale)));
    const result = new THREE.AnimationClip(clip.name, clip.duration, tracks);
    result.userData = { loop: clip.loop, source: data.source };
    return result;
  });
}

export function buildSourceCharacter(kind, lease) {
  const id = CHARACTER_IDS[kind] ?? (kind?.startsWith('character-') ? kind : null);
  if (!id || !lease?.getAsset || !lease?.instantiate) throw new Error(`Unknown source character: ${kind}`);
  const data = lease.getAsset(id);
  const dependency = data.dependencies?.find((entry) => entry.format === 'taipei-source-animation-v1' || entry.url.endsWith('/character-animations.json'));
  const animationData = dependency && lease.getDependency(dependency.url);
  const clips = clipsFrom(animationData, data.skeleton);
  const sourceRoot = lease.instantiate(id);
  const root = new THREE.Group();
  root.name = 'source-actor-' + kind;
  root.userData = { sourceAssetId: id, sourceManaged: true };
  sourceRoot.rotation.y = Math.PI; // Source forward -Z → game actor forward +Z.
  root.add(sourceRoot);
  const skeleton = sourceRoot.children.find((child) => child.isSkinnedMesh)?.skeleton;
  if (!skeleton) { lease.releaseObject(sourceRoot); throw new Error(`Missing source skeleton: ${id}`); }
  const bones = Object.fromEntries(skeleton.bones.map((bone) => [bone.name, bone]));
  for (const [i, bone] of skeleton.bones.entries()) if (data.skeleton.restLocalRotations?.[i]) bone.quaternion.fromArray(data.skeleton.restLocalRotations[i]);
  // Source's eye lids are separate meshes/bones; resting open uses this scale.
  for (const name of ['lidL', 'lidR']) if (bones[name]) bones[name].scale.y = .001;
  const mixer = new THREE.AnimationMixer(sourceRoot);
  const actions = new Map(clips.map((clip) => [clip.name, mixer.clipAction(clip)]));
  let active = null, disposed = false;
  const requireLive = () => { if (disposed) throw new Error('Source character is disposed'); };
  const controller = {
    mesh: root, root, sourceRoot, skeleton, bones, mixer,
    clipNames: clips.map((clip) => clip.name),
    get currentClip() { return active?.getClip().name ?? null; },
    play(name, { fade = .15, loop, speed = 1 } = {}) {
      requireLive();
      const clipName = sourceCharacterActions[name] ?? name;
      const action = actions.get(clipName);
      if (!action) throw new Error(`Missing source animation: ${clipName}`);
      if (!Number.isFinite(speed) || speed < 0 || !Number.isFinite(fade) || fade < 0) throw new Error('Invalid source animation timing');
      if (action === active) return controller;
      const previous = active;
      const repeats = loop ?? action.getClip().userData.loop;
      action.reset().setLoop(repeats ? THREE.LoopRepeat : THREE.LoopOnce, repeats ? Infinity : 1);
      action.clampWhenFinished = !repeats;
      action.timeScale = speed;
      action.play();
      if (previous) {
        if (fade) action.crossFadeFrom(previous, fade, false);
        else previous.stop();
      }
      active = action;
      mixer.update(0);
      return controller;
    },
    update(dt) {
      requireLive();
      if (!Number.isFinite(dt) || dt < 0) throw new Error('Invalid source animation delta');
      mixer.update(dt);
      root.updateMatrixWorld(true);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      mixer.stopAllAction();
      mixer.uncacheRoot(sourceRoot);
      lease.releaseObject(sourceRoot);
      root.removeFromParent();
    },
  };
  root.userData.releaseSource = () => controller.dispose();
  // Existing cutscene code can access the original rig without constructing
  // replacement figures; event-driven callers should prefer play/update.
  root.userData.sourceCharacter = controller;
  controller.play('idle', { fade: 0 });
  return controller;
}
