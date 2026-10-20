// Paste/evaluate this IIFE in an isolated local QA page after starting Taipei
// solo. It sends the game's keyboard inputs; no teleports during the drive.
(() => {
  const g = window.__game;
  if (!g || g.setup.trackId !== 'taipei' || g.setup.mode !== 'solo') throw new Error('Start Taipei solo first');
  if (window.qaDriving) throw new Error('A drive is already active');
  g.teleport(.001, 0);
  g.race.state = 'racing'; g.race.paused = false;
  const keys = new Map();
  const key = (code, down) => {
    if (keys.get(code) === down) return;
    keys.set(code, down);
    window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code }));
  };
  const canvas = document.querySelector('#game'), gl = canvas.getContext('webgl2');
  const extension = gl.getExtension('WEBGL_debug_renderer_info');
  const start = performance.now(), intervals = [], samples = [];
  let previous = start, lastSample = start, boosted = false, maxLateral = 0;
  window.qaDriveResult = null; window.qaDriving = true;
  const environment = {
    browser: navigator.userAgent, renderer: gl.getParameter(extension.UNMASKED_RENDERER_WEBGL),
    viewport: [innerWidth, innerHeight], drawingBuffer: [canvas.width, canvas.height], devicePixelRatio,
    weather: g.setup.weather, car: g.car.def.id, manifest: g.sourceAudit().manifest,
    note: 'Keyboard autopilot, 2 second warmup, adaptive game resolution; no in-drive teleport.',
  };
  function frame(now) {
    const elapsed = (now - start) / 1000, delta = now - previous; previous = now;
    if (elapsed > 2) intervals.push(delta);
    const q = g.track.query(g.car.pos, g.car.trackHint);
    maxLateral = Math.max(maxLateral, Math.abs(q.lateral));
    const ahead = g.track.pointAt(q.s + (12 + g.car.speedKmh / 6) / g.track.length);
    const target = Math.atan2(ahead.x - g.car.pos.x, ahead.z - g.car.pos.z);
    let angle = target - g.car.heading;
    while (angle > Math.PI) angle -= Math.PI * 2;
    while (angle < -Math.PI) angle += Math.PI * 2;
    key('KeyA', angle > .025); key('KeyD', angle < -.025);
    key('KeyW', g.car.speedKmh < (Math.abs(angle) > .25 ? 65 : 90));
    if (!boosted && elapsed > 5 && Math.abs(angle) < .04 && g.car.speedKmh > 60) {
      key('ShiftLeft', true); boosted = true;
    } else key('ShiftLeft', false);
    if (now - lastSample > 250) {
      samples.push({ time: elapsed, s: q.s, lap: g.race.lap, speedKmh: g.car.speedKmh,
        lateral: q.lateral, boosting: g.car.boosting, ...g.rendererInfo });
      lastSample = now;
    }
    if (g.race.state === 'finished' || elapsed >= 150) {
      for (const code of keys.keys()) key(code, false);
      g.race.paused = true; window.qaDriving = false;
      const sorted = [...intervals].sort((a,b) => a-b);
      const p = (fraction) => sorted[Math.min(sorted.length-1, Math.floor(sorted.length*fraction))];
      window.qaDriveResult = { environment, finished: g.race.state === 'finished', elapsed,
        lapTimes: [...g.race.lapTimes], boosted, maxLateral, audit: g.sourceAudit(), samples,
        frameTimeMs: { frames: intervals.length, mean: intervals.reduce((a,b)=>a+b,0)/intervals.length,
          p50: p(.5), p95: p(.95), p99: p(.99), max: Math.max(...intervals) },
      };
      return;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  return { started: true, environment };
})()
