// Run with agent-browser --session source-materials eval --stdin on the gallery.
(async () => {
  const THREE = await import('/node_modules/three/build/three.module.js');
  const { createSourceMaterial } = await import('/js/cities/source-materials.js');
  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setSize(16, 16);
  renderer.toneMapping = THREE.NoToneMapping;
  const target = new THREE.WebGLRenderTarget(16, 16);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 10);
  camera.position.z = 2;
  const geometry = new THREE.PlaneGeometry(2, 2);
  const attribute = (name, value) => geometry.setAttribute(name,
    new THREE.Float32BufferAttribute(Array(4).fill(value).flat(), 4));
  attribute('aCol', [1, 1, 1, .1]);
  attribute('aMat', [.8, 0, 0, 0]);
  attribute('aLight', [.25, .125, .0625, .125]);
  attribute('aInfo', [0, 0, 0, 1]);
  const bytes = new Uint8Array(35 * 4).fill(255);
  const atlas = new THREE.DataArrayTexture(bytes, 1, 1, 35);
  atlas.needsUpdate = true;
  const material = createSourceMaterial({ sourceBucket: 'lm', surfaceMap: 'source-surfaces' },
    new Map([['source-surfaces', atlas]]));
  scene.add(new THREE.Mesh(geometry, material));
  const read = () => {
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    const pixel = new Uint8Array(4);
    renderer.readRenderTargetPixels(target, 8, 8, 1, 1, pixel);
    return Array.from(pixel);
  };
  material.userData.setSourceWeather({ id: 'day', sourceSkyH: [0, 0, 0] });
  const day = read();
  material.userData.setSourceWeather({ id: 'night', sourceSkyH: [0, 0, 0] });
  const night = read();
  bytes[3] = 0; atlas.needsUpdate = true;
  const masked = read();
  bytes[3] = 255; atlas.needsUpdate = true;
  attribute('aInfo', [0, 32, 0, 1]);
  const noWindows = read();
  attribute('aMat', [.8, 0, 0, 1]);
  const occupiedWindows = read();
  const receipt = { renderer: renderer.capabilities.isWebGL2 ? 'WebGL2' : 'WebGL1',
    shaderPrograms: renderer.info.programs.length, day, night, masked, noWindows, occupiedWindows };
  if (JSON.stringify(day) !== '[0,0,0,255]' || JSON.stringify(night) !== '[64,32,16,255]' ||
      JSON.stringify(masked) !== '[0,0,0,255]' || JSON.stringify(noWindows) !== '[0,0,0,255]' ||
      occupiedWindows[0] === 0) throw new Error(JSON.stringify(receipt));
  renderer.setRenderTarget(null);
  target.dispose(); geometry.dispose(); material.dispose(); atlas.dispose(); renderer.dispose();
  return receipt;
})()
