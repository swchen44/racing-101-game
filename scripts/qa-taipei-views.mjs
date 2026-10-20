import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const url = process.argv[2] || 'http://127.0.0.1:8932/';
if (!['127.0.0.1','localhost'].includes(new URL(url).hostname)) throw new Error('Local QA server required');
const session = process.env.TAIPEI_QA_SESSION || 'taipei-views';
const output = resolve(process.argv[3] || 'docs/research/evidence/taipei-candidate-3');
mkdirSync(output,{recursive:true});
const cli = (...args) => execFileSync('agent-browser',['--session',session,...args],{encoding:'utf8',timeout:120000});
const evaluate = (source) => JSON.parse(cli('eval',`(async()=>{${source}})()`));
const views = [['street',.035],['shops',.185],['market',.285],['approach',.445],['temple',.515],['commercial',.815]];
const files = ['js/main.js','js/cities/taipei.js','js/cities/scene.js','js/cities/source-materials.js','js/cities/source-library.js','js/cities/vehicles.js','js/cities/characters.js','js/effects.js'];
const receipt = { timestamp:new Date().toISOString(),codeCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
  codeSha256:Object.fromEntries(files.map(name=>[name,createHash('sha256').update(readFileSync(name)).digest('hex')])),
  seed:20261020,car:'taipei-taxi',mode:'solo',camera:'chase',viewport:[1280,577],views,captures:[] };
cli('network','route','**/*.supabase.co/**','--abort');
cli('network','route','**/api.ipify.org/**','--abort');
cli('set','viewport','1280','577');
cli('open',url);
cli('wait','--fn','!!window.__game');
for (const weather of ['day','dusk','night']) {
  evaluate(`Object.assign(__game.setup,{trackId:'taipei',carId:'taipei-taxi',mode:'solo',weather:'${weather}',ghost:false});
    window.qaReady=false;const begin=performance.now();__game.startRace().then(()=>{__game.race.paused=true;window.qaPreparationMs=performance.now()-begin;window.qaReady=true;});return true;`);
  cli('wait','--fn','window.qaReady===true');
  for (const [name,s] of views) {
    const state=evaluate(`__game.teleport(${s},0);__game.race.paused=true;__game.chaseCam.modeIndex=0;__game.chaseCam.update(1,__game.car,0);
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      return {audit:__game.sourceAudit(),render:__game.rendererInfo,camera:__game.camera.position.toArray(),preparationMs:window.qaPreparationMs};`);
    if (!state.audit.active || state.audit.missing.length) throw new Error('Source audit failed');
    const file=`${weather}-${name}.png`;
    cli('screenshot',resolve(output,file));
    receipt.captures.push({file,...state});
  }
  console.log(`Captured ${weather}`);
}
receipt.errors=cli('errors').trim();
writeFileSync(resolve(output,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
if(receipt.errors)throw new Error(receipt.errors);
// Leave this isolated session open for screenshot review/offline follow-up.
console.log(`Receipt: ${output}/receipt.json`);
