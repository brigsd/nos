/**
 * gl/pixi-filters.ts
 *
 * Two small hand-written WebGL filters for the PixiJS side of the R3
 * comparison - this is the category of effect the whole prototype exists
 * to test, since Canvas2D has no per-pixel shader stage to reach for.
 *
 * Both reuse PixiJS's own default filter vertex stage (verbatim, copied
 * from node_modules/pixi.js filters/defaults/defaultFilter.vert - it just
 * projects the filter quad and passes through vTextureCoord) so only the
 * fragment shader is bespoke.
 *
 *  - Water shimmer: post-process UV distortion + a moving specular band,
 *    applied to a Container holding only the water tiles. Classic
 *    heat-haze-style filter; not something Canvas2D can do without a
 *    per-frame putImageData pass (i.e. reading pixels back to the CPU).
 *  - CRT/scanline: subtle full-frame scanline darkening + vignette,
 *    applied once to the whole stage.
 */
import { Filter, GlProgram } from 'pixi.js';

const DEFAULT_FILTER_VERTEX = /* glsl */ `
in vec2 aPosition;
out vec2 vTextureCoord;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

vec4 filterVertexPosition(void)
{
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;

    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;

    return vec4(position, 0.0, 1.0);
}

vec2 filterTextureCoord(void)
{
    return aPosition * (uOutputFrame.zw * uInputSize.zw);
}

void main(void)
{
    gl_Position = filterVertexPosition();
    vTextureCoord = filterTextureCoord();
}
`;

const WATER_SHIMMER_FRAGMENT = /* glsl */ `
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform float uTime;

void main(void)
{
    vec2 uv = vTextureCoord;

    // Two overlapping sine waves so the distortion never repeats on a
    // simple period - reads as gentle water motion, not a metronome.
    float waveX = sin(uv.y * 46.0 + uTime * 2.1) * 0.0035
                + sin(uv.y * 13.0 - uTime * 0.7) * 0.0022;
    float waveY = sin(uv.x * 31.0 - uTime * 1.4) * 0.0022;

    vec4 color = texture(uTexture, uv + vec2(waveX, waveY));

    // A soft diagonal specular band drifting across the water over time.
    float band = sin((uv.x + uv.y) * 18.0 - uTime * 1.6);
    float highlight = smoothstep(0.86, 1.0, band) * 0.22;
    color.rgb += highlight;

    finalColor = color;
}
`;

const CRT_FRAGMENT = /* glsl */ `
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform vec2 uResolution;

void main(void)
{
    vec4 color = texture(uTexture, vTextureCoord);

    float scan = sin(vTextureCoord.y * uResolution.y * 3.14159265);
    color.rgb *= mix(0.90, 1.0, scan * 0.5 + 0.5);

    vec2 centered = vTextureCoord - 0.5;
    float vignette = smoothstep(0.75, 0.32, dot(centered, centered));
    color.rgb *= mix(0.72, 1.0, vignette);

    finalColor = color;
}
`;

export function createWaterShimmerFilter(): Filter {
  return new Filter({
    glProgram: new GlProgram({
      vertex: DEFAULT_FILTER_VERTEX,
      fragment: WATER_SHIMMER_FRAGMENT,
      name: 'water-shimmer-filter',
    }),
    resources: {
      timeUniforms: {
        uTime: { value: 0, type: 'f32' },
      },
    },
  });
}

export function setShimmerTime(filter: Filter, seconds: number): void {
  (filter.resources.timeUniforms as { uniforms: { uTime: number } }).uniforms.uTime = seconds;
}

export function createCrtFilter(width: number, height: number): Filter {
  return new Filter({
    glProgram: new GlProgram({
      vertex: DEFAULT_FILTER_VERTEX,
      fragment: CRT_FRAGMENT,
      name: 'crt-filter',
    }),
    resources: {
      crtUniforms: {
        uResolution: { value: [width, height], type: 'vec2<f32>' },
      },
    },
  });
}

export function setCrtResolution(filter: Filter, width: number, height: number): void {
  (filter.resources.crtUniforms as { uniforms: { uResolution: number[] } }).uniforms.uResolution = [width, height];
}
