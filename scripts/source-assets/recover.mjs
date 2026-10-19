// Execute archived geometry/paint declarations only; never import app entrypoints.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createCanvas, GlobalFonts} from '@napi-rs/canvas';
import {Extractor} from './lazy-extractor.mjs';
import {recoverStreet} from './street.mjs';
import {recoverCharacters} from './characters.mjs';
import {recoverEffects} from './effects.mjs';
const sourceRoot = process.env.TAIPEI_SOURCE_ROOT || '/Users/swchen.tw/git/rea_study_gta_taipei/archive/taipei-rush-2026-10-18/files/assets';
const out = path.resolve('assets/cities/taipei');
const evidence = path.resolve('docs/research/evidence/taipei-source');
fs.mkdirSync(out, {recursive:true}); fs.mkdirSync(evidence, {recursive:true});
GlobalFonts.loadSystemFonts();
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const source = (file,symbol) => ({file,symbol,sha256:hash(fs.readFileSync(path.join(sourceRoot,file)))});
const x = new Extractor(sourceRoot);
const originalLoad = x.load.bind(x);
x.load = name => {const m=originalLoad(name);m.box.document={createElement(tag){if(tag==='canvas')return createCanvas(1,1);throw Error('DOM forbidden: '+tag);}};m.box.OffscreenCanvas=class{constructor(w,h){return createCanvas(w,h);}};return m;};
const w = x.load('world-BwYfSiTY.js');
const assets=[];
function texture(id,canvas,extra={}) {
  const bytes=canvas.toBuffer('image/png'),filename=id+'.png';fs.writeFileSync(path.join(out,filename),bytes);
  return {id,url:'assets/cities/taipei/'+filename,sha256:hash(bytes),width:canvas.width,height:canvas.height,colorSpace:'srgb',flipY:true,...extra};
}
function geometry(g,name,material) {
  const attributes={};
  for(const [key,a] of Object.entries(g.attributes)) {
    const array=[];for(let i=0;i<a.count;i++)for(let j=0;j<a.itemSize;j++)array.push(a.array[i*a.itemSize+j]);
    if(array.some(v=>!Number.isFinite(v)))throw Error(name+': nonfinite '+key);
    attributes[key]={itemSize:a.itemSize,type:a.array.constructor.name,normalized:a.normalized,array};
  }
  const count=g.attributes.position.count;
  return {name,attributes,index:g.index?Array.from(g.index.array):Array.from({length:count},(_,i)=>i),material};
}
function save(id,kind,meshes,src,extra={}) {
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(const m of meshes){const p=m.attributes.position.array;for(let i=0;i<p.length;i++){if(!Number.isFinite(p[i]))throw Error(id+' nonfinite');min[i%3]=Math.min(min[i%3],p[i]);max[i%3]=Math.max(max[i%3],p[i]);}}
  const bounds={min,max,size:max.map((n,i)=>n-min[i])};
  const doc={schema:1,format:'taipei-source-buffer-v1',id,coordinateSystem:'Y-up; source units (metres); vehicles face -Z',colorSpace:'linear vertex colors; sRGB PNG',meshes,...extra};
  const bytes=JSON.stringify(doc),filename=id+'.json';fs.writeFileSync(path.join(out,filename),bytes);
  assets.push({id,kind,url:'assets/cities/taipei/'+filename,sha256:hash(bytes),source:src,bounds,triangles:meshes.reduce((s,m)=>s+m.index.length/3,0),...extra,format:doc.format});
  console.log(id,assets.at(-1).triangles);
}
const buildings=['guling-book-street','bolero-1934','linjiang-market','cisheng-temple','donqi-ximen','regent-hotel','breezy-center','chensanding-pearl-milk','fongda-coffee','zhangxiexing-tea','linhefa-oil-rice','liting-bakery','shuanglian-sweet-soup','jinfeng-lurou','longmen-pepper-bun','goose-mama-noodles','dazhi-douhua'];
for(const id of buildings){
  const filename=fs.readdirSync(sourceRoot).find(n=>n.startsWith('site-'+id+'-'));
  const mod=x.load(filename),ns=[...mod.exports.values()].map(k=>mod.get(k)).find(n=>n?.default?.near);
  const scene=ns.default,tiles=[...(scene.art??[]),x.load('sites-kit-B_stcAgv.js').get('Ae')()],W=1024;let px=4,py=4,row=0;
  const placements=[];
  for(const t of tiles){if(px+t.w+4>W){px=4;py+=row+8;row=0;}placements.push({t,x:px,y:py});px+=t.w+8;row=Math.max(row,t.h);}
  const H=2**Math.ceil(Math.log2(py+row+8)),canvas=createCanvas(W,H),c=canvas.getContext('2d');
  c.fillStyle='#ffffff';c.fillRect(0,0,4,4);
  const rects={};let textCalls=0;
  const fillText=c.fillText.bind(c);c.fillText=(...a)=>{textCalls++;return fillText(...a);};
  for(const {t,x:px,y:py} of placements){c.save();c.beginPath();c.rect(px,py,t.w,t.h);c.clip();c.translate(px,py);t.paint(c,t.w,t.h,new (w.get('st'))(w.get('ht')(id,t.key)));c.restore();rects[t.key]={u0:px/W,v0:1-(py+t.h)/H,u1:(px+t.w)/W,v1:1-py/H};}
  const tex=texture(id+'-atlas',canvas,{textDrawCalls:textCalls,tiles:Object.keys(rects)});
  const white={u0:1/W,u1:2/W,v0:1-2/H,v1:1-1/H};
  const atlas={white,r:key=>{if(!rects[key])throw Error(id+' missing atlas key '+key);return rects[key];}};
  const meta={id,brandReal:[],lot:{w:ns.NOM_W??18,d:ns.NOM_D??13}};
  const ctx=w.get('aI')({q:'high',atlasView:atlas,mats:{glass:true}},meta,{x:0,z:0,y:0,facing:0,w:meta.lot.w,d:meta.lot.d},'near');
  for(const _ of scene.near(ctx.b)){}
  const meshes=[];
  for(const key of ['lm','leaves','art','room','glass']){const b=ctx.b[key];if(!b)continue;const g=b.build?b.build():b.toGeometry();if(!g.attributes.position.count)continue;
    meshes.push(geometry(g,key,{type:'standard',vertexColors:true,map:key==='art'?tex.id:null,roughness:key==='glass'?.12:.8,metalness:key==='glass'?.15:0,transparent:key==='glass',opacity:key==='glass'?.28:1,side:key==='leaves'?'double':'front',sourceBucket:key}));}
  save(id,'building',meshes,source(filename,[...mod.exports.values()].find(k=>mod.get(k)===ns)+'.default.near'),{textures:[tex],atlasRects:rects,parameters:{quality:'high',tier:'near',nominalDimensions:meta.lot},limitations:['Source LM procedural surface shaders adapted to vertex colors; original aSurf/aMat attributes retained. Glass uses standard transparent material; original refraction shader is not reproduced.','Source asset reuse license is unconfirmed.']});
}
// VEHICLES
const actors=x.load('actors-Bh3k99X7.js');
const vehicleAtlas=texture('vehicles-atlas',actors.get('ei')().image,{premultiplyAlpha:true,interpretation:'premultiplied decal overlay; source-vehicle material required'});
const originalWheel=actors.get('Uo');
let wheelRanges=[];
actors.box.Uo=(builder,...args)=>{const start=builder.n;originalWheel(builder,...args);wheelRanges.push({start,end:builder.n,pivot:args.slice(0,3),radius:args[3],width:args[4]});};
for(const id of ['sedan','taxi','sports','suv','police','scooter','bus']){
  wheelRanges=[];const b=actors.get('xs')(id,{wheels:true,steer:true,rider:false});
  const def=actors.get('Ja')[id],tuning=actors.get('eo')[id],palette=def.colors;
  const C=actors.get('kr').constructor,paint=new C(palette[0]);
  const hashSeed=x=>{const y=Math.sin(x)*43758.5453123;return y-Math.floor(y);};
  const variants=actors.get('Cs')[id]??{a:[0,0,0,0],b:[0,0,0,0]},seed=.5;
  const visible=g=>{const A=variants.a,B=variants.b,r=hashSeed(seed*91.7+1.3);if(g<=.5)return true;if(g<4.5){const j=Math.round(g)-1;return r>=(j?A[j-1]:0)&&r<A[j];}if(g<8.5)return hashSeed(seed*(13+g*7)+g)<B[Math.round(g)-5];if(g<9.5)return r>=A[3];const q=g-5;return hashSeed(seed*(13+q*7)+q)>=B[Math.round(q)-5];};
  const buckets=new Map();
  for(let i=0;i<b.n;i+=3){if(!visible(b.VV[i]))continue;const wi=wheelRanges.findIndex(r=>i>=r.start&&i<r.end),part=wi<0?'body':'wheel-'+wi;const light=b.D[i*4+1],rough=b.D[i*4+2],metal=b.D[i*4+3],key=[part,light,rough,metal].join(':');
    if(!buckets.has(key))buckets.set(key,{name:key,part,pivot:wi<0?[0,0,0]:wheelRanges[wi].pivot,attributes:{position:{itemSize:3,type:'Float32Array',array:[]},normal:{itemSize:3,type:'Float32Array',array:[]},color:{itemSize:3,type:'Float32Array',array:[]},uv:{itemSize:2,type:'Float32Array',array:[]},aData:{itemSize:4,type:'Float32Array',array:[]}},index:[],material:{type:'source-vehicle',vertexColors:true,map:vehicleAtlas.id,roughness:rough,metalness:metal,sourceLightTag:light,emissiveIntensity:light?1:0}});
    const m=buckets.get(key);for(let j=i;j<i+3;j++){m.attributes.position.array.push(...b.P.subarray(j*3,j*3+3));m.attributes.normal.array.push(...b.N.subarray(j*3,j*3+3));m.attributes.uv.array.push(...b.UV.subarray(j*2,j*2+2));m.attributes.aData.array.push(...b.D.subarray(j*4,j*4+4));let col=Array.from(b.C.subarray(j*3,j*3+3)),pk=b.D[j*4];if(pk>.5&&pk<1.5)col=col.map((v,k)=>v*[paint.r,paint.g,paint.b][k]);else if(pk>3.5&&pk<4.5)col=col.map((v,k)=>v*[paint.r,paint.g,paint.b][k]*.5);m.attributes.color.array.push(...col);m.index.push(m.index.length);}
  }
  const wheels=wheelRanges.map((r,i)=>({id:'wheel-'+i,pivot:r.pivot,radius:r.radius,width:r.width,steer:i<2,spinAxis:[1,0,0],steerAxis:[0,1,0],sourceVertexRange:[r.start,r.end]}));
  save(id,'vehicle',[...buckets.values()],source('actors-Bh3k99X7.js','xs / Ko / Uo'),{textures:[vehicleAtlas],parts:{body:'body',wheels},parameters:{seed,paintHex:palette[0],palette,tuning:JSON.parse(JSON.stringify(tuning)),definition:JSON.parse(JSON.stringify(def)),forward:[0,0,-1]},limitations:['Source variant visibility and first palette color baked for seed 0.5. Dynamic wetness, damage and custom vehicle shader are not reproduced.','Wheel pivots are original Uo arguments, captured during original Ko generation. Geometry positions remain source-space; runtime must subtract mesh pivot before mounting at pivot.','Source reuse license unconfirmed.']});b.release();
}
await recoverStreet({w,actors,geometry,texture,save,source});
await recoverCharacters({x,sourceRoot,out,save,source,texture,hash});
recoverEffects({actors,geometry,texture,save,source});
const sourceFiles=[...new Set(x.trace.map(t=>t.file).concat(['charWorker-CMbjchSu.js','crowdWorker-D9GZUtLl.js','anim-D2jNF5Wn.bin']))].sort().map(file=>source(file,'transitive extraction dependency'));
const version='source-v1-'+hash(assets.map(a=>a.sha256).join('')).slice(0,12);
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({schema:1,id:'taipei',version,format:'taipei-source-buffer-v1',conversionVersion:1,sourceFiles,assets,required:assets.map(a=>a.id)},null,2));
fs.writeFileSync(path.join(evidence,'extraction-trace.json'),JSON.stringify(x.trace,null,2));
