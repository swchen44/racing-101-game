export function recoverEffects({actors,geometry,texture,save,source}) {
  // Capture Object3D construction passively: lazy extraction intentionally omits
  // Three's unrelated top-level Object3D.default setup. Original nv still owns
  // geometry, instance attributes and ShaderMaterial creation unchanged.
  const meshConstructor=actors.get('D');
  actors.box.D=class {constructor(g,m){this.geometry=g;this.material=m;}};
  const fx=new (actors.get('nv'))(1,{value:0});
  actors.box.D=meshConstructor;
  const mat=fx.mesh.material;
  save('source-fx','effect',[geometry(fx.geo,'source-fx-quad',{type:'source-fx',vertexShader:mat.vertexShader,fragmentShader:mat.fragmentShader,transparent:true,depthWrite:false,side:'double',premultipliedAlpha:true})],source('actors-Bh3k99X7.js','nv / X_ / Z_'),{textures:[],parameters:{instanceAttributes:['iPos','iSize','iColor'],iPos:'xyz position, rotation',iSize:'width,height,type*4+mode,extra',iColor:'linear RGBA',types:{smoke:0,glow:1,decal:2},modes:{billboard:0,flatGround:1},glowExtra:{hotCore:0,pool:1,ring:2},decalExtra:'birth time for skid; negative for blob shadow',uniforms:{uNight:0,uSunDir:[0,1,0],uClock:0}},limitations:['Runtime must populate instanced source attributes and source shader. A plain solid quad is not an acceptable visual substitute.','Source has glow particles used for hot cores and sparks; no separately authored Boost flame mesh exists in this inspected effect family.']});
  const atlas=texture('source-markers-atlas',actors.get('yM')().image,{premultiplyAlpha:true,interpretation:'source mission marker atlas; 12x12 cells'}),markerMat=actors.get('wM')('source-markers');
  save('source-markers','marker',[geometry(actors.get('OM')(),'source-marker-plane-cylinder',{type:'source-marker',map:atlas.id,vertexShader:markerMat.vertexShader,fragmentShader:markerMat.fragmentShader,transparent:true,depthWrite:false,side:'double'})],source('actors-Bh3k99X7.js','OM / wM / SM / CM / yM'),{textures:[atlas],parameters:{cells:actors.get('Lj'),atlasColumns:12,shapeAttribute:'aShape:0 billboard plane,1 cylinder',sourceBadgeSize:actors.get('xM')},limitations:['Original marker animation and shape selection require instance parameters from source shader.']});
}
