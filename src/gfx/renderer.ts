import { CW, CH } from '../constants';
import { type Color, type RGBA, parseColor } from './color';
import { CAP, glyph, measure } from './pixelFont';

// Batched WebGL2 2D renderer. Everything (shapes + pixel-font text) is
// vertex-colored triangles drawn into a CW×CH offscreen framebuffer (CW varies
// with the screen aspect), then
// upscaled to the screen with nearest filtering by a present pass (hook for
// post-processing).

const SPRITE_VS = `#version 300 es
layout(location=0) in vec2 a_pos;
layout(location=1) in vec4 a_color;
uniform vec2 u_res;
out vec4 v_color;
void main() {
  vec2 c = a_pos / u_res * 2.0 - 1.0;
  gl_Position = vec4(c.x, -c.y, 0.0, 1.0);
  v_color = a_color;
}`;

const SPRITE_FS = `#version 300 es
precision mediump float;
in vec4 v_color;
out vec4 o;
void main() {
  o = v_color;
}`;

const PRESENT_VS = `#version 300 es
out vec2 v_uv;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  v_uv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const PRESENT_FS = `#version 300 es
precision mediump float;
in vec2 v_uv;
uniform sampler2D u_frame;
out vec4 o;
void main() {
  o = texture(u_frame, v_uv);
}`;

// Darkness overlay (cave biome): darkens everything outside a soft circle of
// light. Drawn as a full-screen triangle into the frame, before the HUD.
const DARK_FS = `#version 300 es
precision mediump float;
in vec2 v_uv;
uniform vec2 u_size;
uniform vec3 u_light;
uniform float u_amount;
out vec4 o;
void main() {
  vec2 p = vec2(v_uv.x * u_size.x, (1.0 - v_uv.y) * u_size.y);
  float d = distance(p, u_light.xy);
  float a = u_amount * smoothstep(u_light.z * 0.35, u_light.z, d);
  o = vec4(0.02, 0.01, 0.05, a);
}`;

const FLOATS = 6; // x, y, r, g, b, a
const MAX_VERTS = 6 * 8192;

export type Align = 'left' | 'center' | 'right';
export type Baseline = 'top' | 'middle' | 'bottom';
// maxWidth: shrink the scale (down to 1) until the text fits.
export interface TextOpts { scale?: number; align?: Align; baseline?: Baseline; shadow?: Color | null; maxWidth?: number; }
export type GradientStop = readonly [number, Color];

const TEXT_SHADOW = 'rgba(0,0,0,0.65)';

function compile(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const prog = gl.createProgram()!;
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]] as const) {
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) ?? 'shader error');
    gl.attachShader(prog, sh);
  }
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? 'link error');
  return prog;
}

export class Renderer {
  tx = 0;
  ty = 0;
  alpha = 1;
  lost = false;

  private gl: WebGL2RenderingContext;
  private spriteProg!: WebGLProgram;
  private presentProg!: WebGLProgram;
  private darkProg!: WebGLProgram;
  private uRes!: WebGLUniformLocation | null;
  private vao!: WebGLVertexArrayObject;
  private emptyVao!: WebGLVertexArrayObject;
  private vbo!: WebGLBuffer;
  private fbo!: WebGLFramebuffer;
  private frameTex!: WebGLTexture;
  private frameW = 0;
  private verts = new Float32Array(MAX_VERTS * FLOATS);
  private count = 0;
  private stack: { tx: number; ty: number; alpha: number }[] = [];

  constructor(readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false });
    if (!gl) throw new Error('WebGL2 unavailable');
    this.gl = gl;
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); this.lost = true; });
    canvas.addEventListener('webglcontextrestored', () => { this.init(); this.lost = false; });
    this.init();
  }

  private init() {
    const gl = this.gl;
    this.spriteProg = compile(gl, SPRITE_VS, SPRITE_FS);
    this.presentProg = compile(gl, PRESENT_VS, PRESENT_FS);
    this.darkProg = compile(gl, PRESENT_VS, DARK_FS);
    this.uRes = gl.getUniformLocation(this.spriteProg, 'u_res');

    this.vbo = gl.createBuffer()!;
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.verts.byteLength, gl.DYNAMIC_DRAW);
    const stride = FLOATS * 4;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, stride, 8);
    gl.bindVertexArray(null);
    this.emptyVao = gl.createVertexArray()!;

    this.frameTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.frameTex);
    this.allocFrame();
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.frameTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    this.count = 0;
  }

  // (Re)size the offscreen frame to the current logical size (CW changes on resize/rotation).
  private allocFrame() {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.frameTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, CW, CH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    this.frameW = CW;
  }

  // ----- frame -----
  begin() {
    const gl = this.gl;
    if (this.frameW !== CW) this.allocFrame();
    this.count = 0;
    this.tx = 0; this.ty = 0; this.alpha = 1;
    this.stack.length = 0;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, CW, CH);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }

  end() {
    const gl = this.gl;
    this.flush();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.disable(gl.BLEND);
    gl.useProgram(this.presentProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.frameTex);
    gl.bindVertexArray(this.emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  private flush() {
    if (this.count === 0) return;
    const gl = this.gl;
    gl.useProgram(this.spriteProg);
    gl.uniform2f(this.uRes, CW, CH);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.verts, 0, this.count * FLOATS);
    gl.drawArrays(gl.TRIANGLES, 0, this.count);
    gl.bindVertexArray(null);
    this.count = 0;
  }

  // ----- transform state (translation + alpha only) -----
  save() { this.stack.push({ tx: this.tx, ty: this.ty, alpha: this.alpha }); }
  restore() {
    const s = this.stack.pop();
    if (s) { this.tx = s.tx; this.ty = s.ty; this.alpha = s.alpha; }
  }
  translate(x: number, y: number) { this.tx += x; this.ty += y; }

  // ----- vertex emission -----
  private reserve(n: number) { if (this.count + n > MAX_VERTS) this.flush(); }

  private vert(x: number, y: number, c: RGBA, a: number) {
    const o = this.count++ * FLOATS, d = this.verts;
    d[o] = x + this.tx; d[o + 1] = y + this.ty;
    d[o + 2] = c[0]; d[o + 3] = c[1]; d[o + 4] = c[2]; d[o + 5] = c[3] * a;
  }

  private quad(x: number, y: number, w: number, h: number, top: RGBA, bot: RGBA, a: number) {
    this.reserve(6);
    const x1 = x + w, y1 = y + h;
    this.vert(x, y, top, a);
    this.vert(x1, y, top, a);
    this.vert(x, y1, bot, a);
    this.vert(x1, y, top, a);
    this.vert(x1, y1, bot, a);
    this.vert(x, y1, bot, a);
  }

  // ----- shapes -----
  rect(x: number, y: number, w: number, h: number, color: Color, alpha = 1) {
    if (w <= 0 || h <= 0) return;
    const c = parseColor(color);
    const a = this.alpha * alpha;
    if (c[3] * a <= 0) return;
    this.quad(x, y, w, h, c, c, a);
  }

  // 1px border drawn inside the rect.
  strokeRect(x: number, y: number, w: number, h: number, color: Color) {
    this.rect(x, y, w, 1, color);
    this.rect(x, y + h - 1, w, 1, color);
    this.rect(x, y + 1, 1, h - 2, color);
    this.rect(x + w - 1, y + 1, 1, h - 2, color);
  }

  // Vertical linear gradient across [y, y+h].
  gradientV(x: number, y: number, w: number, h: number, stops: readonly GradientStop[]) {
    for (let i = 0; i < stops.length - 1; i++) {
      const [o0, c0] = stops[i], [o1, c1] = stops[i + 1];
      this.quad(x, y + h * o0, w, h * (o1 - o0), parseColor(c0), parseColor(c1), this.alpha);
    }
  }

  // Horizontal linear gradient across [x, x+w]; `alpha` scales every stop.
  gradientH(x: number, y: number, w: number, h: number, stops: readonly GradientStop[], alpha = 1) {
    const a = this.alpha * alpha;
    for (let i = 0; i < stops.length - 1; i++) {
      const [o0, s0] = stops[i], [o1, s1] = stops[i + 1];
      const c0 = parseColor(s0), c1 = parseColor(s1);
      const x0 = x + w * o0, x1 = x + w * o1, y1 = y + h;
      this.reserve(6);
      this.vert(x0, y, c0, a); this.vert(x1, y, c1, a); this.vert(x0, y1, c0, a);
      this.vert(x1, y, c1, a); this.vert(x1, y1, c1, a); this.vert(x0, y1, c0, a);
    }
  }

  // Darken the frame drawn so far outside a light circle at (cx, cy).
  darkness(cx: number, cy: number, radius: number, amount: number) {
    if (amount <= 0) return;
    const gl = this.gl;
    this.flush();
    gl.useProgram(this.darkProg);
    gl.uniform2f(gl.getUniformLocation(this.darkProg, 'u_size'), CW, CH);
    gl.uniform3f(gl.getUniformLocation(this.darkProg, 'u_light'), cx + this.tx, cy + this.ty, radius);
    gl.uniform1f(gl.getUniformLocation(this.darkProg, 'u_amount'), amount);
    gl.bindVertexArray(this.emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  tri(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, color: Color) {
    const c = parseColor(color);
    this.reserve(3);
    this.vert(x1, y1, c, this.alpha);
    this.vert(x2, y2, c, this.alpha);
    this.vert(x3, y3, c, this.alpha);
  }

  // Filled circle or sector, angles as in Canvas2D (y down, clockwise).
  circle(cx: number, cy: number, r: number, color: Color, start = 0, end = Math.PI * 2) {
    this.ring(cx, cy, 0, r, parseColor(color), parseColor(color), start, end);
  }

  // Radial gradient disc; stops map 0..1 to center..r.
  radial(cx: number, cy: number, r: number, stops: readonly GradientStop[]) {
    for (let i = 0; i < stops.length - 1; i++) {
      const [o0, c0] = stops[i], [o1, c1] = stops[i + 1];
      this.ring(cx, cy, r * o0, r * o1, parseColor(c0), parseColor(c1));
    }
  }

  private ring(cx: number, cy: number, r0: number, r1: number, c0: RGBA, c1: RGBA,
    start = 0, end = Math.PI * 2) {
    const segs = Math.max(6, Math.min(48, Math.ceil(r1 * (end - start) / 3)));
    const a = this.alpha;
    this.reserve(segs * 6);
    for (let i = 0; i < segs; i++) {
      const t0 = start + (end - start) * (i / segs), t1 = start + (end - start) * ((i + 1) / segs);
      const cs0 = Math.cos(t0), sn0 = Math.sin(t0), cs1 = Math.cos(t1), sn1 = Math.sin(t1);
      this.vert(cx + cs0 * r1, cy + sn0 * r1, c1, a);
      this.vert(cx + cs1 * r1, cy + sn1 * r1, c1, a);
      this.vert(cx + cs0 * r0, cy + sn0 * r0, c0, a);
      if (r0 > 0) {
        this.vert(cx + cs1 * r1, cy + sn1 * r1, c1, a);
        this.vert(cx + cs1 * r0, cy + sn1 * r0, c0, a);
        this.vert(cx + cs0 * r0, cy + sn0 * r0, c0, a);
      }
    }
  }

  line(x1: number, y1: number, x2: number, y2: number, width: number, color: Color) {
    const c = parseColor(color);
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len * width / 2, ny = dx / len * width / 2;
    this.reserve(6);
    const a = this.alpha;
    this.vert(x1 + nx, y1 + ny, c, a);
    this.vert(x2 + nx, y2 + ny, c, a);
    this.vert(x1 - nx, y1 - ny, c, a);
    this.vert(x2 + nx, y2 + ny, c, a);
    this.vert(x2 - nx, y2 - ny, c, a);
    this.vert(x1 - nx, y1 - ny, c, a);
  }

  // Pixel-font text. `scale` = logical pixels per font pixel. Baseline 'top'
  // is the cap top; accents extend above it. Optional 1-font-pixel drop shadow.
  text(str: string, x: number, y: number, color: Color, opts: TextOpts = {}) {
    if (!str) return;
    const { align = 'left', baseline = 'top', shadow = TEXT_SHADOW, maxWidth } = opts;
    let scale = opts.scale ?? 1;
    const base = measure(str);
    if (maxWidth) while (scale > 1 && base * scale > maxWidth) scale--;
    let dx = x, dy = y;
    const w = base * scale;
    if (align === 'center') dx -= w / 2;
    else if (align === 'right') dx -= w;
    if (baseline === 'middle') dy -= CAP * scale / 2;
    else if (baseline === 'bottom') dy -= CAP * scale;
    dx = Math.round(dx); dy = Math.round(dy);
    if (shadow) this.glyphs(str, dx + scale, dy + scale, scale, parseColor(shadow));
    this.glyphs(str, dx, dy, scale, parseColor(color));
  }

  private glyphs(str: string, x: number, y: number, s: number, c: RGBA) {
    const a = this.alpha;
    if (c[3] * a <= 0) return;
    for (const ch of str) {
      const g = glyph(ch);
      for (const [gx, gy, len] of g.runs) this.quad(x + gx * s, y + gy * s, len * s, s, c, c, a);
      x += (g.w + 1) * s;
    }
  }
}

export let R: Renderer;

export function initRenderer(canvas: HTMLCanvasElement): Renderer {
  R = new Renderer(canvas);
  return R;
}
