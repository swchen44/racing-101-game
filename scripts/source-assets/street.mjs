import {createCanvas, ImageData} from '@napi-rs/canvas';
// All geometry comes from archived procedural helpers, including lamp transforms.
export async function recoverStreet({w,actors,geometry,texture,save,source}) {
  const leaf=texture('foliage-atlas',w.get('Ks')(4).image);
  const ground=w.get('Ls');const layers=await ground(4,false),image=layers.image;
  const groundNames=['asphalt','old-asphalt','brick','paver','concrete','grass','plaza','lot','arcade','shrub','curb','granite','old-brick','grasscrete','soffit'];
  const repeats=Array.from(w.get('ds')),groundTextures=[];
  for(let i=0;i<15;i++) {
    if(![0,3,4,5,6,10,11].includes(i))continue;
    const canvas=createCanvas(image.width,image.height),bytes=new Uint8ClampedArray(image.data.slice(i*image.width*image.height*4,(i+1)*image.width*image.height*4));
    // Source alpha encodes roughness, not transparency. Preserve it separately.
    const rough=createCanvas(image.width,image.height),rbytes=new Uint8ClampedArray(bytes.length);
    for(let p=0;p<bytes.length;p+=4){rbytes[p]=rbytes[p+1]=rbytes[p+2]=bytes[p+3];rbytes[p+3]=255;bytes[p+3]=255;}
    canvas.getContext('2d').putImageData(new ImageData(bytes,image.width,image.height),0,0);
    rough.getContext('2d').putImageData(new ImageData(rbytes,image.width,image.height),0,0);
    const tex=texture('ground-'+groundNames[i],canvas,{wrap:'repeat',metresPerRepeat:repeats[i],source:source('world-BwYfSiTY.js','Ls layer '+i)});
    const rm=texture('ground-'+groundNames[i]+'-roughness',rough,{wrap:'repeat',colorSpace:'linear'});
    groundTextures[i]=[tex,rm];
  }
  const specs=[['tree-camphor','qu',['camphor'],'vegetation'],['tree-banyan','qu',['banyan'],'vegetation'],['tree-far','qu',['far'],'vegetation'],['plant-money-tree','Xu',['moneyTree'],'vegetation'],['plant-bush','Xu',['bush'],'vegetation'],['plant-clump','Xu',['clump'],'vegetation'],['pole-low','Fu',[],'street'],['pole','Pu',[],'street'],['source-box','Lu',[],'primitive'],['bicycle','Bu',[],'street'],['signal-heads','$u',[],'street']];
  for(const[id,sym,args,kind]of specs){const g=w.get(sym)(...args);save(id,kind,[geometry(g,id,{type:'standard',vertexColors:true,map:kind==='vegetation'?leaf.id:null,roughness:.8,side:kind==='vegetation'?'double':'front',alphaTest:kind==='vegetation'?.42:0})],source('world-BwYfSiTY.js',sym),{textures:kind==='vegetation'?[leaf]:[],parameters:{args},limitations:kind==='vegetation'?['Original wind animation shader is not reproduced.']:[]});}
  const Ko=w.get('Ko'),us=w.get('us'),G=w.get('G'),Bl=w.get('Bl');
  const road={axis:'z',at:0,halfWidth:1,halfTotal:3,major:true,index:0,median:0,pedestrian:false};
  for(const[id,layer,build]of [
    ['road-surface',us.ASPHALT,b=>w.get('Jl')(b,road,-5,5,-1,1,true,true)],
    ['sidewalk',us.PAVER,b=>w.get('$l')(b,road,-5,5,1+Bl,3,G,true)],
    ['curb',us.CURB,b=>{w.get('$l')(b,road,-5,5,1,1+Bl,G+.004,true);w.get('eu')(b,road,-5,5,1,0,G+.004,-1);}]
  ]){const b=new Ko(3,true);b.setLayer(layer).color(1,1,1);build(b);const g=b.build(),[tex,rm]=groundTextures[layer];save(id,'road',[geometry(g,id,{type:'standard',vertexColors:true,map:tex.id,roughnessMap:rm.id,roughness:1,side:'front'})],source('world-BwYfSiTY.js','Ko / Jl / $l / eu'),{textures:[tex,rm],parameters:{length:10,sourceRoad:road,surfaceLayer:layer,repeatMetres:repeats[layer]},limitations:['Geometry source attributes preserve world-plane UVs; runtime deformation must recompute UV distance along the route.']});b.release?.();}
  const pd=w.get('pd'),streams={};const collector=name=>({add(...args){(streams[name]??=[]).push(args.map(v=>Array.isArray(v)?v.slice():v));}}),prop=Object.create(pd.prototype);
  Object.assign(prop,{ds:1,maxView:1000,shadowR:0,lampCount:0,cyls:collector('cylinders'),boxes:collector('boxes'),shadowPoles:collector('shadowPoles'),pools:collector('pools'),poolStreaks:collector('streaks')});
  w.get('ef')({statics:{addCircle(){return null;}}},prop,0,0,G,0,8.3,3.5,12,12);
  const meshes=[];for(const[k,list]of Object.entries(streams)){if(!['cylinders','boxes'].includes(k))continue;for(let i=0;i<list.length;i++){const args=list[i],g=w.get(k==='cylinders'?'Pu':'Lu')();const matrix={elements:args[2]};g.applyMatrix4(matrix);const m=geometry(g,k+'-'+i,{type:'standard',vertexColors:false,color:args[4],roughness:.65,sourceInstanceParameters:args.slice(1)});meshes.push(m);}}
  save('street-lamp','street',meshes,source('world-BwYfSiTY.js','ef / pd.cylV / pd.cyl / pd.lamp / Pu / Lu'),{textures:[],parameters:{lampHeight:8.3,armLength:3.5,sourceStreams:streams},limitations:['Lamp light pool is exported separately as a visual primitive; dynamic source lighting is not reproduced.']});
  for(const[id,sym]of [['roadblock','nj'],['traffic-cone','rj'],['checkpoint-sign','ij']]){
    const textures=[];let map=null;if(sym==='ij'){const t=texture('checkpoint-sign-atlas',actors.get('aj')().image);textures.push(t);map=t.id;}
    save(id,'street',[geometry(actors.get(sym)(),id,{type:'standard',vertexColors:true,map,roughness:.65})],source('actors-Bh3k99X7.js',sym),{textures,limitations:[]});
  }
  for(const layer of [4,5,6,11]){const b=new Ko(3,true);b.setLayer(layer).color(1,1,1);w.get('Jl')(b,road,-5,5,-1,1,true,true);const [tex,rm]=groundTextures[layer];save('ground-'+groundNames[layer],'ground',[geometry(b.build(),'surface',{type:'standard',vertexColors:true,map:tex.id,roughnessMap:rm.id,roughness:1})],source('world-BwYfSiTY.js','Ko / Jl / Ls'),{textures:[tex,rm],parameters:{length:10,width:2,layer,repeatMetres:repeats[layer]},limitations:[]});b.release?.();}
  const marks=w.get('Gs')(4),marksTexture=texture('road-markings-atlas',marks.texture.image,{premultiplyAlpha:true,interpretation:'tile-repeat atlas; source-marking material required'});
  for(const[id,build]of [['road-markings',b=>{b.line(-1,-5,-1,5,.15,0xffffff);b.line(0,-5,0,5,.15,0xffcc00);b.band(1,-5,1,5,.24,'dash',0xffffff,.95,10);}],['crosswalk',b=>b.band(-4,0,4,0,3,'zebra',0xffffff,.95,.95,w.get('hd'),1,0)]]){
    const b=new (w.get('Ed'))(marks);build(b);save(id,'road',[...b.build()].map((g,i)=>geometry(g,id+'-'+i,{type:'source-marking',vertexColors:true,map:marksTexture.id,roughness:.62,transparent:true,depthWrite:false,side:'double'})),source('world-BwYfSiTY.js','Ed.line / Ed.band / Gs / Oc'),{textures:[marksTexture],parameters:{atlasRects:marks.rect},limitations:['Uses original atlas tile-repeat and premultiplied sample unwrapping. Source distant fade, wetness and dynamic street lighting excluded.']});
  }
  return {groundTextures,leaf};
}
