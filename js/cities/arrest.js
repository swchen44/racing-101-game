import * as THREE from 'three';
import { buildSourceCharacter } from './characters.js';
import { SourceEffects } from './effects.js';

const ease = k => k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
const clamp = k => THREE.MathUtils.clamp(k, 0, 1);

// Same 4.6-second event and camera choreography; only archived source actors,
// animation clips and the source soft-pool shader contribute visible geometry.
export function runSourceArrestCutscene({ scene, camera, car, role, target, cityLease, weather = {}, onDone }) {
  let cop, suspect, effects;
  try {
    cop = buildSourceCharacter('cop', cityLease);
    suspect = buildSourceCharacter('suspect', cityLease);
    effects = new SourceEffects(scene, cityLease, weather, { capacity: 16 });
    cop.play('idle'); suspect.play('idle');
    cop.mesh.visible = suspect.mesh.visible = false;
    scene.add(cop.mesh, suspect.mesh);
  } catch (error) {
    cop?.dispose(); suspect?.dispose(); effects?.dispose();
    throw error;
  }
  const focus = role === 'cop' && target ? target.pos.clone() : new THREE.Vector3(car.pos.x, 0, car.pos.z);
  const yaw = role === 'cop' && target ? target.yaw : car.heading;
  const side = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  const cameraStart = camera.position.clone();
  const cameraEnd = focus.clone().addScaledVector(forward, 3.4).addScaledVector(side, 2.3).setY(1.35);
  const copStart = role === 'cop' ? car.pos.clone().addScaledVector(forward, -.5) : focus.clone().addScaledVector(forward, 6).addScaledVector(side, 1.5);
  const copEnd = focus.clone().addScaledVector(forward, 1.95).addScaledVector(side, .7);
  suspect.mesh.position.copy(focus).addScaledVector(side, -.9);
  suspect.mesh.rotation.y = yaw;
  let time = 0, raiseTime = 0;
  const controller = {
    active: true, cop, suspect, effects,
    update(dt) {
      if (!controller.active) return;
      if (!Number.isFinite(dt) || dt < 0) throw new Error('Invalid source arrest delta');
      const step = Math.min(.05, dt);
      time += step;
      const k = Math.min(1, time / 4.6);
      if (k < .4) camera.position.lerpVectors(cameraStart, cameraEnd, ease(k / .4));
      else {
        const orbit = (k - .4) * .42, radius = 4.4 - (k - .4) * .8;
        camera.position.set(focus.x + Math.sin(yaw + .5 + orbit) * radius,
          1.35 + (k - .4) * .5, focus.z + Math.cos(yaw + .5 + orbit) * radius);
      }
      camera.fov = THREE.MathUtils.lerp(60, 40, ease(k));
      camera.updateProjectionMatrix();
      camera.lookAt(focus.x, .75, focus.z);
      cop.mesh.visible = k > .15;
      cop.mesh.position.lerpVectors(copStart, copEnd, ease(clamp((k - .15) / .42)));
      cop.mesh.lookAt(focus.x, cop.mesh.position.y, focus.z);
      cop.play(k < .15 ? 'idle' : k < .55 ? 'walk' : k < .63 ? 'stop' : 'arrest');
      suspect.mesh.visible = k > .28;
      // Original cheer is the explicit source arms-up substitute; no invented clip.
      suspect.play(k < .32 ? 'idle' : 'surrender', { loop: false });
      cop.update(step);
      // Hold the authored cheer pose at 0.8s; the full clip lowers the hands
      // again at 1.7s, before this cutscene ends. Do not synthesize bone poses.
      const suspectStep = k < .32 ? step : Math.min(step, Math.max(0, .8 - raiseTime));
      if (k >= .32) raiseTime += suspectStep;
      suspect.update(suspectStep);
      const flash = Math.floor(time * 6) % 2 === 0;
      effects.setPools([
        { x: focus.x, z: focus.z, width: 11, height: 11, color: [1, .82, .59], alpha: .5 },
        { x: focus.x - 2.5, z: focus.z, width: 6, height: 6, color: [1, .03, .09], alpha: flash ? .5 : .12 },
        { x: focus.x + 2.5, z: focus.z, width: 6, height: 6, color: [.03, .16, 1], alpha: flash ? .12 : .5 },
      ]);
      effects.update(step);
      if (k >= 1) { controller.dispose(); onDone?.(); }
    },
    dispose() {
      if (!controller.active) return;
      controller.active = false;
      cop.dispose(); suspect.dispose(); effects.dispose();
      if (typeof window !== 'undefined' && window.__arrest === controller) window.__arrest = null;
    },
  };
  if (typeof window !== 'undefined') window.__arrest = controller;
  return controller;
}
