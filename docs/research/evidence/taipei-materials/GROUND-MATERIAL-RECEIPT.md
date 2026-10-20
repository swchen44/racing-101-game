# Original ground shader correction

2026-10-20. Exact source declarations and offsets preserved in
`ground-shader-symbols.txt` (world-BwYfSiTY.js: Ls, Sc, wc, Tc, Ec, ds/fs/ps/ms).
Source archive unchanged. Only runtime source-materials.js and its tests change.

The old export split Ls RGBA into RGB PNG and alpha-as-gray PNG, then assigned
that alpha field to MeshStandardMaterial.roughnessMap. Original Ec does not
do this. fs[ASPHALT] is .88 at dry state. Original wc computes:

```glsl
float wetA = uWet * gWetK;
roughnessFactor = mix(roughnessFactor, 0.3, wetA);
float pud = gPuddle * smoothstep(0.2, 0.75, uWet);
roughnessFactor = mix(roughnessFactor, 0.045, pud);
```

Sc/Ec samples alpha at the surface, world-metre UV*.011+(.37,.11), and
UV*.0037+(.71,.29); their weighted sum drives gPuddle. The same macro noise
modulates RGB by .88+.15*gMacro+.1*gMacro2 even when dry. This original subtle
albedo variation is retained. Wet darkening, source dry/wet coefficients,
distance flattening, no-env fog sheen and night specular attenuation are
retained for all recovered ground layers. No replacement texture or scene
edit. Runtime ribbon UVs already divided by ds[layer]; multiply by ds to
recover metre coordinates only for macro samples. Original dynamic street
lamp light-map has no data for this new route and is explicitly excluded.

Tests: two new regressions failed before implementation; final full suite
59/59 PASS. git diff --check clean. `verify-ground-gpu.js` compiled the actual
hook on WebGL2 and read roughnessFactor as linear output:

| wet | alpha field | RGBA pixel | roughness |
| --- | --- | --- | --- |
| 0 | black | 224,224,224,255 | .88 |
| 0 | white | 224,224,224,255 | .88 |
| .1 | white | 210,210,210,255 | .822 |
| 1 | black | 77,77,77,255 | .3 |
| 1 | white | 11,11,11,255 | .045 |

Live full game: source-only day race active, missing geometry audit [], new
Ec sourceShader provenance present, roughness .88, roughnessMap null, wet 0,
night 0. No page errors. Inspected screenshot `day-ground-fixed.png`. Original
albedo macro variation remains visible; dry puddle-driven gloss is removed.
Own `source-ground` browser session closed after evidence, root sessions untouched.
