export function sourceEffectPreview(THREE, data, textures) {
  const spec=data.meshes[0],cfg=spec.material;
  const g=new THREE.InstancedBufferGeometry();
  for(const[k,v]of Object.entries(spec.attributes))if(!k.startsWith('i'))g.setAttribute(k,new THREE.BufferAttribute(new Float32Array(v.array),v.itemSize));
  g.setIndex(spec.index);
  const uniforms={...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),uNight:{value:0},uTime:{value:0},uClock:{value:0},uSunDir:{value:new THREE.Vector3(0,1,0)},uMap:{value:textures[cfg.map]??null}};
  const material=new THREE.ShaderMaterial({uniforms,vertexShader:cfg.vertexShader,fragmentShader:cfg.fragmentShader,transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.CustomBlending,blendSrc:THREE.OneFactor,blendDst:THREE.OneMinusSrcAlphaFactor,fog:true});
  let mesh;
  if(cfg.type==='source-fx'){
    g.setAttribute('iPos',new THREE.InstancedBufferAttribute(new Float32Array([-1.4,1,0,0,1.4,1,0,0,0,0,1,0]),4));
    g.setAttribute('iSize',new THREE.InstancedBufferAttribute(new Float32Array([1.5,1.5,0,.5,1.5,1.5,4,0,1,2,9,0]),4));
    g.setAttribute('iColor',new THREE.InstancedBufferAttribute(new Float32Array([.7,.7,.7,.8,1,.35,.05,.9,.07,.07,.07,.8]),4));g.instanceCount=3;mesh=new THREE.Mesh(g,material);
  }else{
    g.setAttribute('iColor',new THREE.InstancedBufferAttribute(new Float32Array([.2,1,.6,.9,.2,1,.6,.9]),4));
    g.setAttribute('iParam',new THREE.InstancedBufferAttribute(new Float32Array([0,0,1,0,5,2,0,.1]),4));
    g.setAttribute('iKind',new THREE.InstancedBufferAttribute(new Float32Array([0,3]),1));
    mesh=new THREE.InstancedMesh(g,material,2);mesh.setMatrixAt(0,new THREE.Matrix4().makeScale(1.5,1,1.5));mesh.setMatrixAt(1,new THREE.Matrix4().makeTranslation(0,2,0));
  }
  mesh.frustumCulled=false;return mesh;
}
