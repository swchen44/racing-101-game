import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import {extractTexturedCharacter} from './textured-character.mjs';
export async function recoverCharacters({x,sourceRoot,out,save,source,texture,hash}) {
  const presetSource=fs.readFileSync(path.join(sourceRoot,'crowdWorker-D9GZUtLl.js'),'utf8');
  const begin=presetSource.indexOf('let Y={porcelain:'),end=presetSource.indexOf('function _s(e)',begin);
  if(begin<0||end<begin)throw Error('Changed preset bounds');
  const presets=vm.runInNewContext(presetSource.slice(begin,end)+';gs',{}, {timeout:1000});
  const content=x.load('content-CycI_KHI.js');
  const names=Object.keys(content.get('z')),parents=Array.from(content.get('cr'));
  if(names.length!==27||parents.length!==27)throw Error('Changed source rig');
  const workerSource=fs.readFileSync(path.join(sourceRoot,'charWorker-CMbjchSu.js'),'utf8');
  const raw=fs.readFileSync(path.join(sourceRoot,'anim-D2jNF5Wn.bin'));
  if(raw.subarray(0,4).toString()!=='ANM1')throw Error('Changed source animation');
  const header=JSON.parse(raw.subarray(8,8+raw.readUInt32LE(4))),start=Math.ceil((8+raw.readUInt32LE(4))/4)*4;
  const clips=header.clips.map(c=>{const times=[],quaternions=[],hips=[],rootMotion=[];for(let f=0;f<c.n;f++){times.push(f/header.fps);const off=start+(c.offset+f*header.per)*2;for(let j=0;j<header.nk;j++){const q=Array.from({length:4},(_,k)=>raw.readInt16LE(off+(j*4+k)*2));const n=Math.hypot(...q);quaternions.push(...q.map(v=>v/n));}hips.push(...[76,77,78].map(i=>raw.readInt16LE(off+i*2)*.0001));rootMotion.push(raw.readInt16LE(off+79*2)*.001,raw.readInt16LE(off+80*2)*.001,raw.readInt16LE(off+81*2)/32767*4*Math.PI);}return {name:c.name,loop:c.loop,frameCount:c.n,duration:(c.loop?c.n:Math.max(1,c.n-1))/header.fps,times,quaternions,hips,rootMotion};});
  const anim={schema:1,format:'taipei-source-animation-v1',fps:header.fps,boneNames:names.slice(0,19),parents:parents.slice(0,19),quaternionOrder:'XYZW',hipsPosition:'absolute local position; scale by character hips rest Y / 0.977',rootMotion:'separate x,z,yaw; do not apply twice',clips,source:source('anim-D2jNF5Wn.bin','ANM1 / clips-B2HjU5ur.js')};
  const bytes=JSON.stringify(anim);fs.writeFileSync(path.join(out,'character-animations.json'),bytes);
  const animations={url:'assets/cities/taipei/character-animations.json',sha256:hash(bytes),clipNames:clips.map(c=>c.name),format:anim.format};
  const shaderNames=['mc','hc','gc','bc','yc','_c','vc','xc'];
  const shaders={source:source('content-CycI_KHI.js','wc / Ec / '+shaderNames.join(' / ')),chunks:Object.fromEntries(shaderNames.map(n=>[n,content.get(n)]))};
  fs.writeFileSync(path.join(out,'character-shaders.json'),JSON.stringify(shaders,null,2));
  for(const id of ['jie','police','ama','vendor']) {
    const desc=presets.find(d=>d.id===id);if(!desc)throw Error('No character '+id);
    const {mesh:b,png,width,height}=extractTexturedCharacter({workerSource,desc,createCanvas,faceRes:id==='jie'?512:384});
    const c=createCanvas(width,height);c.getContext('2d').drawImage(await loadImage(png),0,0);
    const tex=texture('character-'+id+'-atlas',c,{premultiplyAlpha:true,interpretation:'encoded source atlas; requires source-character material, never plain diffuse map'});
    const rect=[];for(let i=0;i<b.rect.length;i+=4){const k=-b.rect[i]-1;if(k<0){rect.push(0,0,0,0);continue;}const tile=b.tiles[k],px=b.xy[k*2]+tile.gutter,py=b.xy[k*2+1]+tile.gutter;rect.push(px/width,1-(py+tile.h)/height,tile.w/width,tile.h/height);}
    const attr=(array,itemSize,type='Float32Array')=>({array,itemSize,type,normalized:false});
    const attributes={position:attr(b.pos,3),normal:attr(b.nor,3),color:attr(b.col,3),uv:attr(b.uv,2),uvRect:attr(rect,4),surf:attr(b.surf,4),skinIndex:attr(b.si,4,'Uint16Array'),skinWeight:attr(b.sw,4)};
    const meshes=[{name:'body',attributes,index:b.idx.slice(0,b.n0),material:{type:'source-character',vertexColors:true,map:tex.id,roughness:.65,side:'double'}},{name:'lens',attributes,index:b.idx.slice(b.n0),material:{type:'source-character',vertexColors:true,map:tex.id,roughness:.08,transparent:true,opacity:.35,side:'double'}}].filter(m=>m.index.length);
    const skeleton={jointNames:names,parents,jointPositions:b.joints,restLocalRotations:names.map(()=>[0,0,0,1]),skinInfluencesPerVertex:4,animationScale:b.joints[1]/.977,source:source('content-CycI_KHI.js','z / cr / dr')};
    save('character-'+id,'character',meshes,source('charWorker-CMbjchSu.js','self.onmessage / rs'),{textures:[tex],skeleton,animations,descriptor:desc,parameters:{lod:0,textured:true,faceRes:id==='jie'?512:384,conform:false,atlasTiles:b.tiles},dependencies:[{url:'assets/cities/taipei/character-shaders.json',sha256:hash(JSON.stringify(shaders,null,2))},animations],limitations:['Source atlas is encoded data. Adapter must preserve premultiplied skin compositing, hair R luminance/G coverage and tiled fabric modes.','Raw source animation excludes gameplay IK, gaze, facial controls and blend trees. Eight accessory joints have no raw clip channels.','Conform disabled as source offline geometry setting; bind pose is source rest pose, not an invented T-pose.','Source reuse license unconfirmed.']});
  }
}
