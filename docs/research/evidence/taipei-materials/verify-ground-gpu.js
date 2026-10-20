// Run in a local gallery browser with agent-browser eval --stdin.
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
  const map = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  const bytes = new Uint8Array([0, 0, 0, 255]);
  const mask = new THREE.DataTexture(bytes, 1, 1);
  map.needsUpdate = mask.needsUpdate = true;
  const material = createSourceMaterial({ vertexColors: false, map: 'ground-asphalt', roughnessMap: 'ground-asphalt-roughness' },
    new Map([['ground-asphalt', map], ['ground-asphalt-roughness', mask]]));
  const sourceHook = material.onBeforeCompile;
  material.onBeforeCompile = shader => {
    sourceHook(shader);
    // Read the actual compiled roughness path, independent of scene lights.
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>',
      'outgoingLight = vec3(roughnessFactor);\n#include <opaque_fragment>');
  };
  scene.add(new THREE.Mesh(geometry, material));
  const read = (wet, alpha) => {
    bytes[0] = bytes[1] = bytes[2] = alpha; mask.needsUpdate = true;
    material.userData.setSourceWeather({ id: 'day', wet });
    renderer.setRenderTarget(target); renderer.render(scene, camera);
    const pixel = new Uint8Array(4);
    renderer.readRenderTargetPixels(target, 8, 8, 1, 1, pixel);
    return Array.from(pixel);
  };
  const receipt = { renderer: renderer.capabilities.isWebGL2 ? 'WebGL2' : 'WebGL1',
    dryMaskBlack: read(0, 0), dryMaskWhite: read(0, 255),
    dampMaskWhite: read(.1, 255), wetMaskBlack: read(1, 0), wetMaskWhite: read(1, 255) };
  for (const [key, expected] of [['dryMaskBlack', 224], ['dryMaskWhite', 224], ['dampMaskWhite', 210], ['wetMaskBlack', 77], ['wetMaskWhite', 11]]) {
    if (Math.abs(receipt[key][0] - expected) > 1 || receipt[key][3] !== 255) throw new Error(JSON.stringify(receipt));
  }
  renderer.setRenderTarget(null); target.dispose(); geometry.dispose();
  material.dispose(); map.dispose(); mask.dispose(); renderer.dispose();
  return receipt;
})()
