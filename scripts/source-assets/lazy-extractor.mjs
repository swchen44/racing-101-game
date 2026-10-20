// Read-only, lazy declaration extraction from archived ES modules. No host filesystem or network APIs exposed to target contexts.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {parse}=require('@babel/parser');
export class Extractor {
 constructor(root){this.root=path.resolve(root);this.modules=new Map();this.trace=[];}
 load(name){
  name=path.basename(name); if(this.modules.has(name))return this.modules.get(name);
  const file=path.join(this.root,name),src=fs.readFileSync(file,'utf8'),ast=parse(src,{sourceType:'module'});
  const box={Float32Array,Float64Array,Uint8Array,Uint8ClampedArray,Uint16Array,Uint32Array,Int8Array,Int16Array,Int32Array,ArrayBuffer,DataView,console:{log(){},warn(){},error(){}},performance:{now:()=>0}};
  const context=vm.createContext(box,{codeGeneration:{strings:false,wasm:false}}),exports=new Map(),decls=new Map(),imports=new Map();
  const out={name,src,box,context,exports,decls,get:(n)=>vm.runInContext(n,context,{timeout:10000}),exp:(n)=>out.get(exports.get(n)||n)};this.modules.set(name,out);
  for(const statement of ast.program.body){
   let n=statement;
   if(n.type==='ImportDeclaration'){
    for(const s of n.specifiers)imports.set(s.local.name,{file:n.source.value,name:s.imported?.name??s.imported?.value??'default'});continue;
   }
   if(n.type==='ExportNamedDeclaration'){
    for(const s of n.specifiers||[])exports.set(s.exported.name,s.local.name);
    n=n.declaration;if(!n)continue;
   }
   if(n.type==='FunctionDeclaration'||n.type==='ClassDeclaration')decls.set(n.id.name,{code:'('+src.slice(n.start,n.end)+')',start:n.start,end:n.end});
   else if(n.type==='VariableDeclaration')for(const d of n.declarations){if(d.id.type==='Identifier')decls.set(d.id.name,{code:d.init?src.slice(d.init.start,d.init.end):'undefined',start:d.start,end:d.end});}
  }
  const pending=new Set();
  const lazy=(key,fn)=>{Object.defineProperty(box,key,{configurable:true,enumerable:true,get(){if(pending.has(key))throw Error(`Circular lazy initializer ${name}:${key}`);pending.add(key);try{const val=fn();Object.defineProperty(box,key,{value:val,writable:true,configurable:true,enumerable:true});return val;}finally{pending.delete(key)}},set(val){Object.defineProperty(box,key,{value:val,writable:true,configurable:true,enumerable:true});}})};
  for(const [key,v]of imports)lazy(key,()=>this.load(v.file).exp(v.name));
  for(const [key,d]of decls)lazy(key,()=>{this.trace.push({file:name,symbol:key,start:d.start,end:d.end});return vm.runInContext('('+d.code+')',context,{timeout:15000});});
  return out;
 }
}
