// cars/f1.js — 方程式 TF-01:開放式座艙單體殼、外露大輪、前後翼、細長鼻錐、Halo、高聳進氣箱
import * as THREE from 'three';
import {
  getCarEnvTexture, makeWheels, makeUnderglow, makePaint,
} from './common.js';

export function build(def = {}) {
  const car = new THREE.Group();
  const envMap = getCarEnvTexture();
  const paint = makePaint(def.paint ?? 0xe10f2f);
  const paintDark = makePaint(def.paint ?? 0xe10f2f, { metalness: 0.3, roughness: 0.5, emissiveScale: 0.35 });
  const carbon = new THREE.MeshStandardMaterial({ color: 0x111318, metalness: 0.6, roughness: 0.42, envMap, envMapIntensity: 0.7 });
  const matte = new THREE.MeshStandardMaterial({ color: 0x050607, metalness: 0.0, roughness: 1.0 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf2f5f8, metalness: 0.2, roughness: 0.45, emissive: 0xced7de, emissiveIntensity: 0.35 });

  // ---- 鼻錐:細長圓錐往前收窄、微壓扁
  const noseGeo = new THREE.CylinderGeometry(0.085, 0.27, 1.75, 10);
  noseGeo.rotateX(Math.PI / 2);          // +y端(細) → +z 車頭
  noseGeo.scale(1, 0.62, 1);
  const nose = new THREE.Mesh(noseGeo, paint);
  nose.position.set(0, 0.42, 1.72);
  nose.castShadow = true;
  car.add(nose);

  // ---- 單體殼駕駛艙:窄長 tub (座艙前緣較高形成 cockpit 圍欄)
  const tubShape = new THREE.Shape();       // x=縱向(+車頭) y=高度
  tubShape.moveTo(1.05, 0.18);
  tubShape.lineTo(1.05, 0.62);
  tubShape.quadraticCurveTo(0.72, 0.80, 0.52, 0.80);  // 座艙前圍欄
  tubShape.lineTo(-0.25, 0.74);
  tubShape.quadraticCurveTo(-0.85, 0.70, -1.05, 0.55);
  tubShape.lineTo(-1.05, 0.18);
  tubShape.closePath();
  const tubGeo = new THREE.ExtrudeGeometry(tubShape, {
    depth: 0.56, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.06, bevelSegments: 2,
  });
  tubGeo.translate(0, 0, -0.28);
  tubGeo.rotateY(-Math.PI / 2);
  const tub = new THREE.Mesh(tubGeo, paint);
  tub.castShadow = true;
  car.add(tub);

  // 座艙開口 (深色) + 車手頭盔 + 小擋風
  const cockpit = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.10, 0.78), matte);
  cockpit.position.set(0, 0.78, 0.02);
  car.add(cockpit);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), white);
  helmet.position.set(0, 0.84, -0.08);
  car.add(helmet);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.05), matte);
  visor.position.set(0, 0.86, 0.05);
  car.add(visor);

  // ---- Halo 環:水平半環 + 前中央支柱
  const haloMat = new THREE.MeshStandardMaterial({ color: 0x14171c, metalness: 0.7, roughness: 0.35 });
  const haloGeo = new THREE.TorusGeometry(0.31, 0.038, 8, 20, Math.PI * 1.7);
  haloGeo.rotateX(Math.PI / 2);
  haloGeo.rotateY(Math.PI - Math.PI * 0.15);
  const halo = new THREE.Mesh(haloGeo, haloMat);
  halo.position.set(0, 0.94, 0.10);
  car.add(halo);
  const haloPost = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.045, 0.42, 8), haloMat);
  haloPost.position.set(0, 0.76, 0.40);
  haloPost.rotation.x = 0.28;
  car.add(haloPost);

  // ---- 進氣箱 (roll hoop):頭盔後上方,前開口深色
  const airbox = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.20, 0.42, 8), paint);
  airbox.scale.set(1, 1, 0.8);
  airbox.position.set(0, 1.02, -0.52);
  airbox.rotation.x = 0.18;
  airbox.castShadow = true;
  car.add(airbox);
  const airboxInlet = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.10, 0.06, 10), matte);
  airboxInlet.rotation.x = Math.PI / 2 - 0.35;
  airboxInlet.position.set(0, 1.12, -0.34);
  car.add(airboxInlet);

  // ---- 引擎蓋脊背:自進氣箱向後收窄的鰭狀體
  const spineGeo = new THREE.CylinderGeometry(0.09, 0.22, 1.55, 8);
  spineGeo.rotateX(-Math.PI / 2);       // 細端朝 -z 車尾
  spineGeo.scale(1, 1.35, 1);
  const spine = new THREE.Mesh(spineGeo, paintDark);
  spine.position.set(0, 0.68, -1.32);
  spine.castShadow = true;
  car.add(spine);

  // ---- 側箱 sidepods:座艙兩側、前緣深色進氣口、往後下削 (coke bottle)
  for (const s of [1, -1]) {
    const podGeo = new THREE.BoxGeometry(0.52, 0.44, 1.55);
    const p = podGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const zn = (p.getZ(i) + 0.775) / 1.55;   // 0=尾 1=頭
      p.setX(i, p.getX(i) * (0.45 + 0.55 * zn));   // 車尾收窄
      if (p.getY(i) > 0) p.setY(i, p.getY(i) * (0.55 + 0.45 * zn)); // 車尾下削
    }
    p.needsUpdate = true;
    const pod = new THREE.Mesh(podGeo, paint);
    pod.position.set(s * 0.56, 0.40, -0.55);
    pod.castShadow = true;
    car.add(pod);
    const inlet = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.26, 0.07), matte);
    inlet.position.set(s * 0.56, 0.46, 0.24);
    car.add(inlet);
  }

  // ---- 地板 + 側裙前緣小翼
  const floor = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.05, 3.1), carbon);
  floor.position.set(0, 0.12, -0.35);
  car.add(floor);

  // ---- 前翼:雙層翼片 + 端板
  const fwMain = new THREE.Mesh(new THREE.BoxGeometry(1.96, 0.045, 0.58), paint);
  fwMain.position.set(0, 0.15, 2.38);
  fwMain.castShadow = true;
  car.add(fwMain);
  const fwFlap = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.035, 0.34), paintDark);
  fwFlap.position.set(0, 0.27, 2.26);
  fwFlap.rotation.x = 0.38;
  car.add(fwFlap);
  for (const s of [1, -1]) {
    const ep = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.26, 0.62), carbon);
    ep.position.set(s * 0.99, 0.24, 2.36);
    car.add(ep);
  }
  // 鼻錐與前翼的連接支柱
  for (const s of [0.12, -0.12]) {
    const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.24, 0.16), carbon);
    pylon.position.set(s, 0.26, 2.42);
    car.add(pylon);
  }

  // ---- 後翼:高置主翼 + 上翼片 + 大端板 + 中央支柱 + beam wing
  const rwMain = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.05, 0.40), paint);
  rwMain.position.set(0, 1.02, -2.22);
  rwMain.rotation.x = -0.22;
  rwMain.castShadow = true;
  car.add(rwMain);
  const rwFlap = new THREE.Mesh(new THREE.BoxGeometry(1.46, 0.04, 0.24), paintDark);
  rwFlap.position.set(0, 1.14, -2.34);
  rwFlap.rotation.x = -0.5;
  car.add(rwFlap);
  for (const s of [1, -1]) {
    const ep = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.52, 0.60), carbon);
    ep.position.set(s * 0.76, 0.92, -2.26);
    car.add(ep);
  }
  const rwPylon = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.5, 0.14), carbon);
  rwPylon.position.set(0, 0.72, -2.14);
  car.add(rwPylon);
  const beamWing = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.04, 0.26), carbon);
  beamWing.position.set(0, 0.55, -2.18);
  beamWing.rotation.x = -0.2;
  car.add(beamWing);

  // ---- 尾部擴散器 + 雨燈 (F1 rain light,煞車時增亮)
  const diffuser = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.22, 0.4), matte);
  diffuser.position.set(0, 0.22, -2.0);
  diffuser.rotation.x = 0.28;
  car.add(diffuser);
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff1a2e, emissiveIntensity: 1.6 });
  const rainLight = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.24, 0.06), tailMat);
  rainLight.position.set(0, 0.60, -2.30);
  car.add(rainLight);
  const tailMidMat = new THREE.MeshStandardMaterial({ color: 0x2a0006, emissive: 0xff1a2e, emissiveIntensity: 0.8 });
  for (const s of [0.7, -0.7]) {
    const wl = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.3), tailMidMat);
    wl.position.set(s, 0.98, -2.26);   // 後翼端板小燈
    car.add(wl);
  }

  // ---- 外露輪 + 懸吊臂 (wishbones,開輪辨識關鍵)
  const positions = [
    [0.88, 0.52, 1.66, true], [-0.88, 0.52, 1.66, true],
    [0.88, 0.52, -1.62, false], [-0.88, 0.52, -1.62, false],
  ];
  const armGeo = new THREE.BoxGeometry(0.62, 0.028, 0.09);
  for (const [x, , z] of positions) {
    const s = Math.sign(x);
    for (const [ay, az] of [[0.50, 0.16], [0.30, -0.14]]) {
      const arm = new THREE.Mesh(armGeo, carbon);
      arm.position.set(s * 0.52, ay, z + az);
      arm.rotation.y = s * (az > 0 ? -0.22 : 0.22);
      car.add(arm);
    }
  }
  const { wheels, rimMatRear, wheelRadius } = makeWheels(car, positions, { radius: 0.52, width: 0.46, spokes: 5, rimEmissive: 0x5a646f });

  // ---- 頭燈:不加 SpotLight (省光源),鼻翼兩側小型 emissive 定位燈
  const posMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xeaf4ff, emissiveIntensity: 1.8 });
  for (const s of [1, -1]) {
    const pl = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.05), posMat);
    pl.position.set(s * 0.99, 0.24, 2.62);
    car.add(pl);
  }

  const underglow = makeUnderglow(car, { color: 0xff2a3c, opacity: 0.11, w: 2.1, l: 4.8 });

  const rig = new THREE.Group();
  rig.add(car);
  return {
    mesh: rig,
    parts: {
      bodyGroup: car, wheels, rimMatRear, wheelRadius,
      tailMat, tailMidMat, brakeLight: rainLight,
      underglow, headlights: [],
    },
  };
}
