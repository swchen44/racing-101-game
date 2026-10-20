// Run against a local server only. Uses an isolated agent-browser session and
// blocks remote scores/ads. Checkpoint teleports validate lifecycle, not driving.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const url = process.argv[2] || 'http://127.0.0.1:8932/';
if (!['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) throw new Error('Local QA server required');
const session = process.env.TAIPEI_QA_SESSION || 'taipei-lifecycle';
const output = resolve('docs/research/evidence/taipei-lifecycle');
mkdirSync(output, { recursive: true });
const cli = (...args) => execFileSync('agent-browser', ['--session', session, ...args], { encoding: 'utf8', timeout: 120000 });
const evaluate = (source) => JSON.parse(cli('eval', `(async()=>{${source}})()`));
const frames = 'const frames = async(n=3)=>{for(let i=0;i<n;i++)await new Promise(requestAnimationFrame);};';
const receipt = { timestamp: new Date().toISOString(), url, checks: [], limitations: ['Checkpoint traversal uses teleport; not a driving or FPS acceptance test.'] };
function check(name, value) {
  receipt.checks.push({ name, ...value });
  writeFileSync(resolve(output, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
  if (!value.pass) throw new Error(`${name}: ${JSON.stringify(value)}`);
  console.log(`PASS ${name}`);
}

cli('network', 'route', '**/*.supabase.co/**', '--abort');
cli('network', 'route', '**/api.ipify.org/**', '--abort');
cli('open', url);
cli('wait', '--fn', '!!window.__game');
check('runtime', evaluate('return {pass:!!window.__game, viewport:[innerWidth,innerHeight], userAgent:navigator.userAgent};'));
for (const trackId of ['taipei', 'xinyi', 'wangan', 'mountain', 'gp']) {
  // Keep each evaluation short: a timed-out async evaluation can outlive the
  // CLI request. Do not overlap a pending race mutation with a retry.
  evaluate(`const g=__game;
    localStorage.removeItem('mc101_best_${trackId}_solo');
    localStorage.removeItem('mc101_ghost_${trackId}_solo');
    Object.assign(g.setup,{trackId:'${trackId}',carId:'${trackId === 'taipei' ? 'taipei-taxi' : 'gt'}',mode:'solo',weather:'day',ghost:false,name:'local-qa'});
    window.qaStart=g.startRace().then(()=>{g.race.state='racing';g.race.paused=false;window.qaReady=true;});
    return {started:true};`);
  cli('wait','--fn','window.qaReady===true');
  evaluate('window.qaReady=false;return true;');
  const steps=[];
  for(let lap=0;lap<2;lap++) for(let cp=1;cp<=8;cp++) {
    steps.push(evaluate(`${frames}const g=__game;g.teleport(${(cp%8)/8+.001},0);await frames(3);return {lap:g.race.lap,next:g.race.nextCheckpoint,state:g.race.state};`));
  }
  const result=evaluate(`const g=__game,rec=JSON.parse(localStorage.getItem('mc101_ghost_${trackId}_solo'));
    return {finished:g.race.state==='finished'&&document.querySelector('#results').classList.contains('on'),
      ghost:rec&&{schema:rec.schema||1,samples:rec.samples.length,routeRevision:rec.routeRevision},audit:g.sourceAudit()};`);
  const restarted=evaluate(`${frames}const g=__game;g.setup.ghost=true;await g.restartRace();g.race.paused=true;await frames();return g.race.state==='countdown'&&!document.querySelector('#results').classList.contains('on');`);
  check(`${trackId} finish and ghost`,{...result,steps,restart:restarted,
    pass:result.finished&&restarted&&!!result.ghost&&(trackId!=='taipei'||(result.audit.active&&!result.audit.missing.length&&result.ghost.schema===2))});
}

for (const [mode, role] of [['solo','cop'], ['gp','cop'], ['police','cop'], ['chase','cop'], ['chase','thief']]) {
  check(`taipei ${mode}/${role} restart`, evaluate(`${frames}
    const g=__game; Object.assign(g.setup,{trackId:'taipei',carId:'taipei-sports',mode:'${mode}',role:'${role}',weather:'night',ghost:true});
    await g.startRace(); g.race.state='racing'; g.race.paused=false; await frames(15);
    const audit=g.sourceAudit(), player=g.car.def.id;
    await g.restartRace(); await frames(3); g.race.paused=true;
    return {pass:audit.active&&!audit.missing.length&&g.race.state==='countdown', player,audit,render:g.rendererInfo};
  `));
}
check('source cameras and mirror', evaluate(`${frames}
  const g=__game;g.race.paused=true;g.teleport(.035,0);const cameras=[];
  for(let i=0;i<4;i++){g.chaseCam.modeIndex=i;g.chaseCam.snapTo(g.car);await frames();cameras.push({name:g.chaseCam.mode.name,position:g.camera.position.toArray(),finite:g.camera.position.toArray().every(Number.isFinite)});}
  g.chaseCam.modeIndex=0;g.chaseCam.snapTo(g.car);document.querySelector('#btn-mirror').click();await frames();
  const mirror=document.querySelector('#mirror-frame').classList.contains('on');document.querySelector('#btn-mirror').click();
  return {pass:cameras.every(c=>c.finite)&&mirror,cameras,mirror,audit:g.sourceAudit()};
`));
for (const role of ['cop','thief']) {
  check(`source arrest ${role}`, evaluate(`${frames}
    const g=__game; Object.assign(g.setup,{mode:'chase',role:'${role}',weather:'night'});await g.startRace();g.race.state='racing';g.race.paused=false;
    const trigger=g.debugArrest();const start=performance.now();let audit=null;
    while(performance.now()-start<12000){await frames();if(window.__arrest?.active)audit=g.sourceAudit();if(document.querySelector('#results').classList.contains('on'))break;}
    return {pass:!!audit&&!audit.missing.length&&document.querySelector('#results').classList.contains('on'),trigger,audit,state:g.race.state,elapsed:performance.now()-start};
  `));
}
const errors=cli('errors').trim();
check('browser errors', { pass: !errors, errors });
evaluate(`const g=__game;Object.assign(g.setup,{trackId:'taipei',mode:'chase',role:'cop'});
  window.qaReady=false;g.startRace().then(()=>{g.race.state='racing';g.race.paused=false;g.debugArrest();window.qaReady=true;});return true;`);
cli('wait','--fn','window.qaReady && !!window.__arrest?.active');
check('restart during arrest restores HUD',evaluate(`${frames}
  const g=__game,wasCutscene=document.body.classList.contains('cutscene');
  await g.restartRace();g.race.paused=true;await frames();
  return {pass:wasCutscene&&!document.body.classList.contains('cutscene')&&g.race.state==='countdown',wasCutscene,state:g.race.state,audit:g.sourceAudit()};
`));
console.log(`Receipt: ${output}/receipt.json`);
cli('close');
