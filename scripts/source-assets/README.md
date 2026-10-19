# Taipei source recovery

Development-only extractor. Run from repository root:

```sh
npm ci --prefix scripts/source-assets
node scripts/source-assets/recover.mjs
node --test tests/source-assets.test.mjs
python3 -m http.server 8093
```

Preview `http://localhost:8093/scripts/source-assets/gallery.html`. Root development dependency `three@0.160.0` supplies the preview renderer. The game does not execute the archived app, workers or extractor. `TAIPEI_SOURCE_ROOT` may override the default read-only archived asset directory. No app boot, backend, login, network, or other-city assets are invoked. npm installs pinned development tooling only.

## Format contract

`assets/cities/taipei/manifest.json` schema 1 lists content hashes, original module/symbol/hash, measured source-space bounds, triangle counts, textures, semantic parts and limitations. All URLs are **application-root-relative**, e.g. `assets/cities/taipei/taxi.json`; resolve against the game document/base URL, not the manifest URL. Character `dependencies` must join the offline download closure, including animation and original shader files.

Model JSON `format: taipei-source-buffer-v1`:

```js
{
  schema: 1, id, format,
  coordinateSystem: 'Y-up; source units (metres); vehicles face -Z',
  meshes: [{
    name, part, pivot,
    attributes: {
      position: { itemSize: 3, type: 'Float32Array', normalized: false, array: [...] },
      normal: {...}, uv: {...}, color: {...}, // optional, original attributes retained
    },
    index: [...],
    material: { type, vertexColors, map, roughness, metalness, ... }
  }],
  textures: [{ id, url, sha256, width, height, colorSpace, flipY, premultiplyAlpha }],
  parts, skeleton, animations, parameters, limitations
}
```

A raw source-buffer format was selected over GLB to preserve custom source attributes, rig data, exact wheel generation ranges and encoded atlases. No exporter flattening, placeholder whole-atlas UVs or invented geometry occurs. The gallery demonstrates r160 consumption. JSON arrays are a development/readability tradeoff; production binary packing is not implemented here.

### Buildings and ground

- `lm`/`leaves` source `aCol` is normalized Uint8 **RGBA**, with RGB linear base color and A source emissive/figure metadata, **not transparency**. Standard-material adapters must copy only RGB to `color`, retain original `aCol`, `aMat`, `aLight`, `aInfo`, and avoid accidental vertex-alpha. Original source shaders are not yet reproduced in full.
- `art` carries exact per-tile UVs from original paint callbacks. Every building has actual Chinese text paint calls, tile rectangles and PNG data. Shared `sites-kit.Ae` face tiles are recovered too.
- `glass` remains a separate transparent material bucket. It approximates the source refraction shader with standard transmission-free glass. Source LM microtexture, night-specific shader lighting, glass refraction and detailed emissive adaptation remain runtime work.
- Ground PNGs come from exact `world.Ls` Canvas layers. Source alpha stores roughness; exported diffuse alpha is made opaque and that channel is split to a linear grayscale roughness PNG. `aLayer` is preserved. Repeat UVs must use the recorded `metresPerRepeat` when reshaping road geometry.
- Road/sidewalk/curb templates retain source ground datum, source normals and UVs. They are length 10 m; road width 2 m. Runtime route mapping is an authorized transform, not a newly authored surface.
- Street lamp matrices are copied when original `ef`/`pd` submits each instance, because the original uses mutable scratch matrices. Colors are linear RGB arrays.

### Vehicle atlas and wheels

All vehicle material buckets use `type: source-vehicle`, never plain `MeshStandardMaterial.map`. `ei()` produces a transparent **premultiplied decal overlay**; plain map multiplication makes the body black. The original `yi()` albedo equation is:

```glsl
diffuseColor.rgb *= vColor.rgb;
vec4 atl = texture2D(map, vMapUv);
diffuseColor.rgb = diffuseColor.rgb * (1.0 - atl.a) + atl.rgb;
```

Use sRGB texture with `premultiplyAlpha=true`. `preview-material.mjs` contains the tested r160 hook. Paint RGB is already baked for original first palette and source visibility seed 0.5. Material buckets preserve roughness, metalness and source light tag for original lights/sirens. Full wetness/damage/AO/lighting shaders remain excluded.

`parts.wheels[]` comes from intercepting exact original `Ko → Uo` calls. Front pair then rear pair, original local +X side then −X side. Each wheel mesh has `part: wheel-N`, original source-space positions and a `pivot`. Subtract the pivot from geometry, then mount it under a steering group at that pivot with a spinner rotating on X. Only front wheels steer around Y. `radius`, axle coordinates and physics dimensions come from source `eo` and `Ja`, not inferred mesh bounds. Body meshes remain at origin. Source forward is −Z.

### Characters and animation

Original `charWorker` generates textured LOD0 geometry, skin indices/weights, original joint positions, per-vertex UV rectangle and surface mode. Original `content.z/cr/dr` supply 27 bones, source parent indices and identity rest rotations. Local bone translations equal joint minus parent; root uses absolute joint. Parent order is not topological. The raw 48-clip ANM1 pack is decoded to `character-animations.json` with 30 Hz times, normalized local XYZW quaternions for the first 19 source bones, absolute hips positions and separate root motion. Multiply hips by character rest hips Y / 0.977. Accessory joints remain at rest unless game procedural animation is implemented.

`type: source-character` requires the original encoded atlas interpretation. Use sRGB and premultiplied upload. `uvRect` is the source resolved tile rectangle `(x,y,width,height)`; `uv` remains tile-local and may exceed 0..1. `surf.z` selects compositing:

- >2.5: hair R=luminance, G=coverage; tint by `.55+.6*R`, cut using `surf.w`.
- .5..1.5: repeating fabric, multiply sampled RGB.
- 1.5..2.5: alpha-cut detail, multiply RGB / alpha.
- otherwise: premultiplied overlay, `base*(1-alpha)+RGB`, outside-UV mask.

The raw face/hair PNG may look neon on transparent background because it is encoded material data. This is expected; the gallery hook correctly composites it over vertex colors. `character-shaders.json` preserves original full shader chunks including high-frequency detail. The tested preview hook transfers albedo and cutout semantics only; full skin microrelief, hair anisotropy, wetness and mip-gradient clamp are explicit limitations.

### Source effects and markers

`source-fx` preserves the source quad, instance attributes, original X_/Z_ shaders and type/mode metadata. Supply `iPos`, `iSize`, `iColor` per instance; smoke/hot core/pool/skid behavior comes from the source fragment shader. Do not display it as an opaque solid quad. `source-markers` includes original plane/cylinder geometry, shape tag, mission atlas, original marker shaders and cell enum. These source primitives can carry race controls without importing source gameplay.

## Reproducibility and limitations

Pinned Babel and native Canvas are in `package-lock.json`. Canvas uses installed system fonts and original source fallback font strings; atlas bytes depend on the host font installation. This run used macOS system fonts including Traditional Chinese glyphs. Geometry preserves source units, near/high detail and source procedural RNG. Reuse/redistribution licensing remains unconfirmed; this library is for the authorized local research/development scope only.

`source-marking` uses `world.Ed` line/band geometry with normalized Uint16 `aRect` and tile-local UV. Sample `aRect.xy + fract(uv)*aRect.zw`, divide sampled premultiplied RGB by alpha, multiply diffuse RGBA, preserve vertex alpha. Use transparent/depthWrite=false/polygonOffset(-2,-4). `road-markings` contains white edge, yellow center and white dash samples; `crosswalk` is the exact zebra tile. The helper in `preview-material.mjs` demonstrates the adaptation.
