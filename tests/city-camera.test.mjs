import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ChaseCamera } from '../js/camera.js';

test('source cockpit and hood cameras rotate the original vehicle anchors into game space', () => {
  const camera = new THREE.PerspectiveCamera();
  const controller = new ChaseCamera(camera);
  const car = { pos: new THREE.Vector3(10, 0, 20), heading: Math.PI / 2,
    cameraAnchors: { cockpit: new THREE.Vector3(.3, 1.45, .6), hood: new THREE.Vector3(0, .92, 2.1) } };
  controller.modeIndex = 2; controller.snapTo(car);
  assert.ok(camera.position.distanceTo(new THREE.Vector3(10.6, 1.45, 19.7)) < 1e-8);
  controller.modeIndex = 3; controller.snapTo(car);
  assert.ok(camera.position.distanceTo(new THREE.Vector3(12.1, .92, 20)) < 1e-8);
});
