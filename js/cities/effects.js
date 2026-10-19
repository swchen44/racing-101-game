import * as THREE from 'three';
import { WALL_HALF_WIDTH } from '../track.js';

// Geometry and shading are archived actors.nv/X_/Z_. Gameplay supplies only
// transforms, lifetimes and source uv smoke/glow/skid parameter types.
export class SourceEffects {
  constructor(scene, lease, weather = {}, { capacity = 1024, random = Math.random } = {}) {
    if (!Number.isInteger(capacity) || capacity < 8) throw new Error('Invalid source FX capacity');
    this.lease = lease;
    this.root = lease.instantiate('source-fx');
    try {
      this.mesh = this.root.children.find(object => object.isMesh);
      if (!this.mesh?.geometry?.isInstancedBufferGeometry || this.mesh.material.userData.sourceMaterialType !== 'source-fx') throw new Error('Missing source FX shader/geometry');
      this.capacity = capacity;
      this.random = random;
      this.clock = 0;
      this.cursor = 0;
      this.smokeTimer = 0;
      this.boostTimer = 0;
      this.particles = Array.from({ length: Math.max(4, capacity - 8) }, () => ({ life: 0 }));
      this.pools = [];
      this.carPools = [];
      this.position = new THREE.Vector3();
      for (const name of ['iPos', 'iSize', 'iColor']) {
        this.mesh.geometry.setAttribute(name, new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage));
      }
      this.mesh.geometry.instanceCount = 0;
      this.mesh.castShadow = this.mesh.receiveShadow = false;
      this.mesh.renderOrder = 2;
      this.root.name = 'taipei-source-effects';
      this.setWeather(weather);
      scene.add(this.root);
    } catch (error) {
      lease.releaseObject(this.root);
      throw error;
    }
  }

  setWeather(weather = {}) {
    this.weather = typeof weather === 'string' ? { id: weather } : weather;
    this.night = this.weather.id === 'night' ? 1 : this.weather.id === 'dusk' ? .55 : 0;
    this.mesh.material.uniforms.uNight.value = this.night;
  }

  spawn(values) {
    if (this.disposed || !this.particles.length) return;
    const particle = this.particles[this.cursor++ % this.particles.length];
    Object.assign(particle, { x: 0, y: .03, z: 0, vx: 0, vy: 0, vz: 0, rotation: 0,
      width: 1, height: 1, growth: 0, gravity: 0, drag: 0, kind: 0, extra: 0,
      color: [.1, .1, .1], alpha: 1, life: 1, ...values });
    particle.duration = particle.life;
  }

  addSkid(x, z, direction, length, y = .015, width = .3) {
    this.spawn({ x, y, z, rotation: -direction, width, height: length, kind: 9,
      extra: this.clock, color: [.025, .025, .028], alpha: .8, life: 30 });
  }

  addSmoke(x, z, vx, vz, small = false, y = .2) {
    const size = small ? .6 : .95;
    this.spawn({ x, y, z, vx: vx * .3, vy: .8 + this.random(), vz: vz * .3,
      rotation: this.random() * Math.PI * 2, width: size, height: size, growth: 1.4,
      drag: 1.2, gravity: -.8, color: [.16, .17, .18], alpha: small ? .18 : .35,
      extra: this.random(), life: .6 + this.random() * .4 });
  }

  burstSparks(x, y, z, count, vx = 0, vz = 0) {
    for (let i = 0; i < Math.min(count, 64); i++) this.spawn({ x, y, z,
      vx: vx * .55 + (this.random() - .5) * 4, vy: 1 + this.random() * 3,
      vz: vz * .55 + (this.random() - .5) * 4, width: .09, height: .09,
      gravity: 9.8, drag: .4, kind: 4, color: [1, .72, .3], alpha: 1.4,
      life: .25 + this.random() * .35 });
  }

  setPools(pools) { this.pools = pools.slice(0, 5); }

  worldAnchor(car, anchor, distance = 0) {
    const p = this.position;
    if (anchor && car.bodyGroup) {
      car.bodyGroup.updateWorldMatrix(true, false);
      p.copy(anchor);
      car.bodyGroup.localToWorld(p);
    } else p.set(car.pos.x, .5, car.pos.z);
    p.x += Math.sin(car.heading) * distance;
    p.z += Math.cos(car.heading) * distance;
    return p;
  }

  updateCar(dt, car, input = {}) {
    this.carPools.length = 0;
    if (!car) return;
    // Source rear-wheel pivots replace the legacy fixed track/axle offsets.
    const speed = Math.abs(car.speed || 0), velocity = car.vel ?? { x: 0, z: 0 };
    const sliding = (car.drifting || input.handbrake) && speed > 3;
    const mini = speed < 10 || !car.drifting;
    this.smokeTimer -= dt;
    if (sliding || (Math.abs(car.lateralVel ?? 0) > 2.1 && speed > 9)) {
      const direction = Math.hypot(velocity.x, velocity.z) > 1 ? Math.atan2(velocity.x, velocity.z) : car.heading;
      const length = THREE.MathUtils.clamp(Math.hypot(velocity.x, velocity.z) * dt * 2.2, .5, 2.2);
      car.bodyGroup?.updateWorldMatrix(true, true);
      for (const wheel of car.wheels ?? []) {
        if (wheel.steerable) continue;
        wheel.group.getWorldPosition(this.position);
        const { x, y, z } = this.position;
        this.addSkid(x, z, direction, length, y - wheel.radius + .015, Math.max(.2, wheel.radius * .8));
        if (this.smokeTimer <= 0) this.addSmoke(x, z, velocity.x, velocity.z, mini, y - wheel.radius + .2);
      }
      if (this.smokeTimer <= 0) this.smokeTimer = mini ? .07 : .035;
    }
    const halfWidth = car.collisionDimensions?.halfWidth ?? 1;
    const side = Math.sign(car.lateral || 1);
    const sx = car.pos.x + Math.cos(car.heading) * side * halfWidth;
    const sz = car.pos.z - Math.sin(car.heading) * side * halfWidth;
    if (car.collisionImpulse > .35) {
      this.burstSparks(sx, .32, sz, 10, velocity.x, velocity.z);
      car.collisionImpulse *= .4;
    }
    if (Math.abs(car.lateral ?? 0) > WALL_HALF_WIDTH - halfWidth - .15 && speed > 4 && this.random() < dt * 18) this.burstSparks(sx, .3, sz, 2, velocity.x, velocity.z);
    this.boostTimer -= dt;
    if (car.boosting && this.boostTimer <= 0) {
      const at = this.worldAnchor(car, car.cameraAnchors?.exhaustAt, -.1);
      this.spawn({ x: at.x, y: at.y, z: at.z,
        vx: velocity.x * .3 - Math.sin(car.heading) * 8, vy: .2,
        vz: velocity.z * .3 - Math.cos(car.heading) * 8,
        width: .32, height: .5, kind: 4, color: [1, .62, .3], alpha: 1.4,
        growth: .5, life: .18, drag: 1.5 });
      this.boostTimer = .025;
    }
    if (this.weather.headlights ?? (this.night > .2)) {
      const p = this.worldAnchor(car, car.cameraAnchors?.headAt, 3);
      this.carPools.push({ x: p.x, y: .03, z: p.z, rotation: -car.heading,
        width: 3.8, height: 8, color: [1, .88, .68], alpha: .12 + this.night * .18 });
      if ((input.backward || input.handbrake) && speed > .5) {
        const rear = this.worldAnchor(car, car.cameraAnchors?.tailAt, -1);
        this.carPools.push({ x: rear.x, y: .03, z: rear.z, rotation: -car.heading,
          width: 3, height: 2.5, color: [1, .03, .05], alpha: .24 });
      }
    }
  }

  update(dt, car, _cameraPosition, input = {}) {
    if (this.disposed) return;
    if (!Number.isFinite(dt) || dt < 0) throw new Error('Invalid source FX delta');
    this.clock += dt;
    for (const p of this.particles) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.kind === 9) continue;
      p.vy -= p.gravity * dt;
      const drag = Math.exp(-p.drag * dt);
      p.vx *= drag; p.vz *= drag;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.gravity > 0 && p.y < .02) { p.y = .02; p.vy *= -.4; }
      p.width += p.growth * dt; p.height += p.growth * dt;
    }
    this.updateCar(dt, car, input);
    const { iPos, iSize, iColor } = this.mesh.geometry.attributes;
    let count = 0;
    const write = (p, kind, extra, alpha) => {
      if (count >= this.capacity) return;
      iPos.setXYZW(count, p.x, p.y ?? .03, p.z, p.rotation ?? 0);
      iSize.setXYZW(count, p.width, p.height, kind, extra);
      iColor.setXYZW(count, ...p.color, alpha);
      count++;
    };
    for (const p of this.particles) if (p.life > 0) write(p, p.kind, p.extra, p.alpha * (p.kind === 9 ? 1 : p.life / p.duration));
    for (const p of [...this.pools, ...this.carPools]) write(p, 5, 1, p.alpha);
    this.mesh.geometry.instanceCount = count;
    this.mesh.visible = count > 0;
    for (const attr of [iPos, iSize, iColor]) attr.needsUpdate = true;
    this.mesh.material.uniforms.uClock.value = this.clock;
    this.mesh.material.uniforms.uTime.value = this.clock;
  }

  reset() {
    for (const p of this.particles) p.life = 0;
    this.pools.length = this.carPools.length = 0;
    this.smokeTimer = this.boostTimer = 0;
    this.mesh.geometry.instanceCount = 0;
    this.mesh.visible = false;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.lease.releaseObject(this.root);
    this.particles.length = this.pools.length = this.carPools.length = 0;
  }
}
