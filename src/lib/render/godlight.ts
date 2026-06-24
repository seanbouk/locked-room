// God-light: volumetric shafts derived from the lock's real negative space.
//
// The mental model is physical, not painted. Behind the lock is a bright room.
// Every solid piece (door, plate face, pin) is an OCCLUDER. Light is simply
// wherever you can see PAST the pieces to the void behind. So the shape of the
// light falls out of the actual puzzle geometry — kerf gaps, open pin holes,
// the seam, and (at round-end) the swung-open doors — instead of being authored
// as cones per node.
//
// The caller rasterises that negative space into an "aperture" canvas (white =
// open / light, black = occluder). This module turns it into light:
//
//   1. morphological OPEN (erode → dilate): anything thinner than the kernel —
//      the fine kerf cuts — is erased to black ("too narrow and deep, the light
//      bounces and dies"); substantial openings survive at full size & blaze.
//   2. RADIAL blur: each opening is smeared OUTWARD from the disc centre (the
//      light sits behind it), so openings throw real shafts — out, not round.
//   3. warm tint, opaque black background. The <canvas> is screen-blended over
//      the SVG, so black adds nothing and the resting state looks untouched.
//
// Self-contained WebGL2. Degrades to a no-op if WebGL2 is unavailable or the
// context is lost, so the game never breaks because of the eye-candy layer.

export interface GodLightParams {
  /** Disc-centre in aperture-pixel coords (origin of the radial streak). */
  cx: number;
  cy: number;
  /** Morphological-open kernel radius, in aperture px. Gaps thinner than ~2x
   *  this are killed (kerfs). ~the kerf half-width in px. */
  erode: number;
  /** Radial blur: how many taps along the ray, and how far toward the centre
   *  to reach (fraction of the centre-distance). More reach = longer shafts. */
  blurTaps: number;
  blurReach: number;
  /** Bright sharp cores (the openings themselves) mixed over the soft shafts. */
  coreMix: number;
  /** Overall brightness (ramped by the caller as the lock opens). */
  intensity: number;
  /** 0 = each opening keeps the colour painted into the aperture (the key that
   *  revealed it); 1 = the whole field washed to white (the round-end flood). */
  whiten: number;
}

const VERT = `#version 300 es
in vec2 aPos;
uniform float uFlipY;
out vec2 vUV;
void main(){
  vec2 uv = aPos * 0.5 + 0.5;
  vUV = vec2(uv.x, mix(uv.y, 1.0 - uv.y, uFlipY));
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

// Separable morphology: min (erode) or max (dilate) along uDir. Runs per-channel
// so a coloured opening keeps its hue (the light a key reveals is its colour).
const MORPH = `#version 300 es
precision highp float;
in vec2 vUV; out vec4 o;
uniform sampler2D uTex;
uniform vec2 uDir;
uniform int uTaps;
uniform float uMode; // 0 = erode (min), 1 = dilate (max)
void main(){
  vec3 acc = texture(uTex, vUV).rgb;
  for(int i=1;i<=64;i++){
    if(i>uTaps) break;
    vec2 off = uDir*float(i);
    vec3 a = texture(uTex, vUV+off).rgb;
    vec3 b = texture(uTex, vUV-off).rgb;
    if(uMode<0.5){ acc=min(acc,min(a,b)); } else { acc=max(acc,max(a,b)); }
  }
  o = vec4(acc,1.0);
}`;

// Radial / zoom blur: a light source sits behind the centre, so each output
// pixel gathers the aperture along the segment from itself TOWARD the centre.
// An opening therefore smears outward (away from centre) into a shaft.
const RADIAL = `#version 300 es
precision highp float;
in vec2 vUV; out vec4 o;
uniform sampler2D uTex;
uniform vec2 uCenter;
uniform int uSamples;
uniform float uReach;
void main(){
  vec2 toC = uCenter - vUV;
  vec3 acc=vec3(0.0); float wsum=0.0;
  for(int i=0;i<128;i++){
    if(i>=uSamples) break;
    float t = float(i)/float(uSamples-1);
    // steep falloff: a pixel is lit mostly by openings very close to it, so a
    // shaft is bright right at its gap and fades off quickly (early thin gaps
    // don't bloom into a blinding wash).
    float w = pow(1.0 - t, 3.0);
    acc += texture(uTex, vUV + toC*(t*uReach)).rgb * w;
    wsum += w;
  }
  o = vec4(acc/max(wsum,1e-4),1.0);
}`;

const COMPOSITE = `#version 300 es
precision highp float;
in vec2 vUV; out vec4 o;
uniform sampler2D uRays;
uniform sampler2D uCore;
uniform float uIntensity;
uniform float uCoreMix;
uniform float uWhiten; // 0 = the opening's own colour, 1 = washed to white
void main(){
  vec3 rays = texture(uRays, vUV).rgb;
  vec3 core = texture(uCore, vUV).rgb;
  vec3 lit = rays + core*uCoreMix;
  // brightness is the strongest channel, so a saturated colour is as "bright" as
  // white — exposure (hence shaft length / bloom) doesn't depend on hue.
  float m = max(max(lit.r, lit.g), lit.b);
  float L = m * uIntensity;
  // Exponential roll-off: eases the dim gaps up from black without hard-clipping.
  float t = 1.0 - exp(-L * 1.4);
  // hue = the light's own colour; wash it to white as the lock seats at round-end.
  vec3 hue = lit / max(m, 1e-4);
  vec3 c = mix(hue, vec3(1.0), uWhiten) * t;
  o = vec4(c, 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    throw new Error('godlight shader: ' + gl.getShaderInfoLog(s));
  }
  return s;
}

function program(gl: WebGL2RenderingContext, frag: string): WebGLProgram {
  const p = gl.createProgram()!;
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, frag));
  gl.bindAttribLocation(p, 0, 'aPos');
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error('godlight link: ' + gl.getProgramInfoLog(p));
  }
  return p;
}

interface Target {
  fbo: WebGLFramebuffer;
  tex: WebGLTexture;
}

export class GodLight {
  private gl: WebGL2RenderingContext | null = null;
  private ok = false;
  private w = 0;
  private h = 0;
  private progMorph!: WebGLProgram;
  private progRadial!: WebGLProgram;
  private progComp!: WebGLProgram;
  private quad!: WebGLBuffer;
  private srcTex!: WebGLTexture; // the uploaded aperture
  private a!: Target;
  private b!: Target;
  private c!: Target;

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', {
      premultipliedAlpha: false,
      alpha: false,
      antialias: false,
      depth: false,
    });
    if (!gl) return;
    this.gl = gl;
    try {
      this.progMorph = program(gl, MORPH);
      this.progRadial = program(gl, RADIAL);
      this.progComp = program(gl, COMPOSITE);
      this.quad = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      this.srcTex = this.makeTex();
      this.ok = true;
    } catch (e) {
      console.warn('GodLight init failed, disabling', e);
      this.ok = false;
    }
  }

  get enabled() {
    return this.ok;
  }

  private makeTex(): WebGLTexture {
    const gl = this.gl!;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return t;
  }

  private makeTarget(): Target {
    const gl = this.gl!;
    const tex = this.makeTex();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.w, this.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return { fbo, tex };
  }

  /** Size the GL drawing buffer and the ping-pong targets. */
  resize(w: number, h: number) {
    if (!this.ok || (w === this.w && h === this.h)) return;
    const gl = this.gl!;
    this.w = Math.max(1, w);
    this.h = Math.max(1, h);
    this.canvas.width = this.w;
    this.canvas.height = this.h;
    if (this.a) {
      gl.deleteFramebuffer(this.a.fbo);
      gl.deleteTexture(this.a.tex);
      gl.deleteFramebuffer(this.b.fbo);
      gl.deleteTexture(this.b.tex);
      gl.deleteFramebuffer(this.c.fbo);
      gl.deleteTexture(this.c.tex);
    }
    this.a = this.makeTarget();
    this.b = this.makeTarget();
    this.c = this.makeTarget();
  }

  private drawQuad(prog: WebGLProgram, flipY: boolean) {
    const gl = this.gl!;
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.uniform1f(gl.getUniformLocation(prog, 'uFlipY'), flipY ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private bindInput(prog: WebGLProgram, name: string, tex: WebGLTexture, unit: number) {
    const gl = this.gl!;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(gl.getUniformLocation(prog, name), unit);
  }

  private morph(from: WebGLTexture, to: Target, mode: 0 | 1, taps: number, horizontal: boolean) {
    const gl = this.gl!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, to.fbo);
    gl.viewport(0, 0, this.w, this.h);
    gl.useProgram(this.progMorph);
    this.bindInput(this.progMorph, 'uTex', from, 0);
    gl.uniform2f(
      gl.getUniformLocation(this.progMorph, 'uDir'),
      horizontal ? 1 / this.w : 0,
      horizontal ? 0 : 1 / this.h,
    );
    gl.uniform1i(gl.getUniformLocation(this.progMorph, 'uTaps'), Math.max(1, Math.round(taps)));
    gl.uniform1f(gl.getUniformLocation(this.progMorph, 'uMode'), mode);
    this.drawQuad(this.progMorph, false);
  }

  /** Run the full pipeline for one frame. `aperture` is a same-aspect canvas:
   *  white where light passes, black under solid pieces. */
  render(aperture: HTMLCanvasElement, p: GodLightParams) {
    if (!this.ok) return;
    const gl = this.gl!;
    if (gl.isContextLost()) {
      this.ok = false;
      return;
    }
    // Upload aperture.
    gl.bindTexture(gl.TEXTURE_2D, this.srcTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, aperture);

    const taps = Math.max(1, Math.round(p.erode));
    // Morphological OPEN: erode (kill thin kerfs) then dilate (restore size).
    this.morph(this.srcTex, this.a, 0, taps, true); // erode H
    this.morph(this.a.tex, this.b, 0, taps, false); // erode V
    this.morph(this.b.tex, this.a, 1, taps, true); // dilate H
    this.morph(this.a.tex, this.c, 1, taps, false); // dilate V  -> c = opened cores

    // Radial blur the opened apertures into shafts -> b.
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.b.fbo);
    gl.viewport(0, 0, this.w, this.h);
    gl.useProgram(this.progRadial);
    this.bindInput(this.progRadial, 'uTex', this.c.tex, 0);
    gl.uniform2f(gl.getUniformLocation(this.progRadial, 'uCenter'), p.cx / this.w, p.cy / this.h);
    gl.uniform1i(gl.getUniformLocation(this.progRadial, 'uSamples'), Math.max(2, Math.round(p.blurTaps)));
    gl.uniform1f(gl.getUniformLocation(this.progRadial, 'uReach'), p.blurReach);
    this.drawQuad(this.progRadial, false);

    // Composite to the visible canvas (flip Y so texture-top = screen-top).
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.w, this.h);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.progComp);
    this.bindInput(this.progComp, 'uRays', this.b.tex, 0);
    this.bindInput(this.progComp, 'uCore', this.c.tex, 1);
    gl.uniform1f(gl.getUniformLocation(this.progComp, 'uWhiten'), p.whiten);
    gl.uniform1f(gl.getUniformLocation(this.progComp, 'uIntensity'), p.intensity);
    gl.uniform1f(gl.getUniformLocation(this.progComp, 'uCoreMix'), p.coreMix);
    this.drawQuad(this.progComp, true);
  }

  dispose() {
    const gl = this.gl;
    if (!gl) return;
    [this.a, this.b, this.c].forEach((t) => {
      if (t) {
        gl.deleteFramebuffer(t.fbo);
        gl.deleteTexture(t.tex);
      }
    });
    gl.deleteTexture(this.srcTex);
    gl.deleteBuffer(this.quad);
    this.ok = false;
  }
}
