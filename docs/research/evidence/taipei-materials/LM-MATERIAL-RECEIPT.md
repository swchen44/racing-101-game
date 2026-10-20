# LM material receipt

2026-10-20. Archive is read-only. Runtime source array: 256×256×35 RGBA,
`source-v1-f633ae38aa1e`. Source shader evidence: `building-shader-symbols.txt`.

Implemented `world:Dy` current-site surface semantics: original layer sampling,
AO from `aCol.a`, roughness/metalness from `aMat.xy`, `aLight` emission masked
by original array alpha, stable PCG per-window occupancy, TEXCOL, flood uplight,
sky reflection fallback and source foliage sway. Original `content:Zg` art is
MeshBasicMaterial with light influence in vertex alpha, not opacity/emission.

Live local r160 gallery: Regent Hotel, WebGL2, 10,820 triangles, 3 draw calls,
0 page/console errors. Screenshot inspected: `regent-day-lm.png`.

`verify-lm-gpu.js` executes a no-scene-light, no-tone-map 16×16 fixture on real
WebGL2. Result (RGBA unsigned bytes):

| Fixture | Pixel |
| --- | --- |
| Day | 0,0,0,255 |
| Night source lamp | 64,32,16,255 |
| Source mask alpha zero | 0,0,0,255 |
| Window occupancy zero | 0,0,0,255 |
| Window occupancy one | 35,14,4,255 |

All fixtures use source AO .1; output alpha remains 255. Shader programs: 1.
CPU tests: fresh `node --test tests/*.test.mjs` 57/57 pass; `git diff --check`
clean. Actor RNG test now captures one random ID before checking membership.

Integration: traverse instance materials and call
`material.userData.setSourceWeather?.(weather)` and
`material.userData.setSourceTime?.(seconds)`. Uniform state is per instance.
Day/dusk/night maps to source night factor 0/.5/1; callers may pass explicit
`weather.night`, `wet`/`wetness`, `sourceWinLate`, `sourceSkyH`, `sourceSkyZ`.

Limits: original Taipei 101/New Year facade show and atmospheric fog are not
present in these sites/adaptation. Analytic sky uses game weather colors;
art uses source exterior .95/interior 1 light, with no optional candle flicker.
