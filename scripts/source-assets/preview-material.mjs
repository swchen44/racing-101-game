// Preview adapter for the source gc atlas modes. Fine skin/hair normal and wetness
// shaders remain in character-shaders.json; this hook preserves texture semantics.
export function adaptCharacterMaterial(material, atlas) {
  material.map = null;
  material.onBeforeCompile = shader => {
    shader.uniforms.sourceAtlas = {value:atlas};
    shader.vertexShader = 'attribute vec4 uvRect; attribute vec4 surf; varying vec4 sourceRect; varying vec4 sourceSurf; varying vec2 sourceUv;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n sourceRect=uvRect; sourceSurf=surf; sourceUv=uv;');
    shader.fragmentShader = 'uniform sampler2D sourceAtlas; varying vec4 sourceRect; varying vec4 sourceSurf; varying vec2 sourceUv;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
      #include <color_fragment>
      if (sourceRect.z > 0.0) {
        float mode=sourceSurf.z;
        bool rep=(mode>.5 && mode<1.5)||mode>2.5;
        vec2 f=rep?fract(sourceUv):clamp(sourceUv,0.0,1.0);
        vec4 tx=texture2D(sourceAtlas,sourceRect.xy+f*sourceRect.zw);
        if(mode>2.5){ if(sourceSurf.w>0.0 && tx.g<sourceSurf.w)discard; diffuseColor.rgb*=.55+.6*tx.r; }
        else if(rep){ diffuseColor.rgb*=tx.rgb; }
        else {tx*=step(0.0,sourceUv.x)*step(sourceUv.x,1.0)*step(0.0,sourceUv.y)*step(sourceUv.y,1.0);
          if(mode>1.5){ if(tx.a<.5)discard; diffuseColor.rgb*=tx.rgb/max(tx.a,.001); }
          else {diffuseColor.rgb=diffuseColor.rgb*(1.0-tx.a)+tx.rgb;}
        }
      }
    `);
  };
  material.customProgramCacheKey=()=> 'taipei-source-character-gc-albedo-v1';
  return material;
}

export function adaptVehicleMaterial(material) {
  material.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', '');
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
      diffuseColor.rgb *= vColor.rgb;
      #ifdef USE_MAP
        vec4 atl = texture2D(map, vMapUv);
        diffuseColor.rgb = diffuseColor.rgb * (1.0 - atl.a) + atl.rgb;
      #endif
    `);
  };
  material.customProgramCacheKey = () => 'taipei-source-vehicle-yi-albedo-v1';
  return material;
}

export function adaptMarkingMaterial(material) {
  material.depthWrite=false;
  material.polygonOffset=true;material.polygonOffsetFactor=-2;material.polygonOffsetUnits=-4;
  material.onBeforeCompile=shader=>{
    shader.vertexShader='attribute vec4 aRect; varying vec4 sourceRect; varying vec2 sourceUv;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nsourceRect=aRect;sourceUv=uv;');
    shader.fragmentShader='varying vec4 sourceRect; varying vec2 sourceUv;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`vec2 mUv=sourceRect.xy+fract(sourceUv)*sourceRect.zw;vec4 mTex=texture2D(map,mUv);mTex.rgb/=max(mTex.a,1e-4);diffuseColor*=mTex;`);
  };
  material.customProgramCacheKey=()=> 'taipei-source-marking-oc-v1';
  return material;
}
