// Executes only the self-contained archived geometry worker, with passive Canvas/message shims.
// No application modules, backend, renderer, host fs/network APIs exposed to worker.
import vm from 'node:vm';
export function extractTexturedCharacter({workerSource, desc, createCanvas, faceRes, conform=false}) {
  class CanvasShim {
    constructor(w,h) {
      const canvas=createCanvas(w,h);
      canvas.transferToImageBitmap=()=>canvas;
      return canvas;
    }
    transferToImageBitmap() { throw Error('Unreachable prototype capability marker'); }
  }
  let result;
  const context=vm.createContext({OffscreenCanvas:CanvasShim,performance:{now:()=>0},self:{postMessage(message){result=message;}}},{codeGeneration:{strings:false,wasm:false}});
  vm.runInContext(workerSource,context,{timeout:10000,filename:'archived-charWorker-CMbjchSu.js'});
  context.job={id:desc.id,desc,lod:0,textured:true,faceRes,conform};
  vm.runInContext('self.onmessage({data:job})',context,{timeout:30000});
  if(!result||result.error||result.noPaint)throw Error('Original worker: '+(result?.error??JSON.stringify(result)));
  // `sheet` is the exact painted packed atlas; preserve before serializing arrays.
  const {sheet,...mesh}=result;
  if(!sheet?.toBuffer)throw Error('Original worker returned no painted Canvas sheet');
  const png=sheet.toBuffer('image/png');
  const serializable=JSON.parse(JSON.stringify(mesh,(_key,value)=>ArrayBuffer.isView(value)?Array.from(value):value));
  return {mesh:serializable,png,width:sheet.width,height:sheet.height};
}
