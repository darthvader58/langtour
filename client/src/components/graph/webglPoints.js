// WebGL galaxy renderer. Flat anti-aliased circles + lines.
//
// Edges and nodes render together into a single offscreen FBO with premultiplied
// blending so overlapping elements accumulate. The FBO is then composited through
// a filmic tone map at uniform opacity — hovering dims the entire layer evenly.
// Accent edges and highlighted nodes draw directly on top.
//
// The FBO is rendered at 2× resolution and downsampled for anti-aliasing.

const VS = `
attribute vec3 a_wPos;
attribute vec4 a_color;
uniform mat3  u_rot;
uniform vec3  u_target;
uniform float u_dist;
uniform float u_fov;
uniform vec2  u_resolution;
uniform float u_pointSize;
uniform float u_pointSizeMul;
uniform float u_fogNear;
uniform float u_fogFar;
varying vec4  v_color;
varying float v_fog;
void main() {
  vec3 vp = u_rot * (a_wPos - u_target);
  float depth = vp.z + u_dist;
  if (depth <= 0.02) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
  vec2 screen = vec2(u_resolution.x * 0.5, u_resolution.y * 0.5)
              + vec2(vp.x, -vp.y) * (u_fov / depth);
  vec2 clip = vec2(screen.x / u_resolution.x * 2.0 - 1.0,
                   1.0 - screen.y / u_resolution.y * 2.0);
  gl_Position = vec4(clip, 0.0, 1.0);
  gl_PointSize = clamp(u_pointSize * u_pointSizeMul * u_fov / depth, 1.0, 48.0);
  v_fog = 1.0 - clamp((depth - u_fogNear) / max(u_fogFar - u_fogNear, 0.001), 0.0, 1.0);
  v_color = a_color;
}
`
const FS = `
#extension GL_OES_standard_derivatives : enable
precision mediump float;
varying vec4  v_color;
varying float v_fog;
uniform float u_pointOpacity;
void main() {
  vec2 d = gl_PointCoord - vec2(0.5);
  float r = length(d) * 2.0;
  float w = fwidth(r);
  float circle = 1.0 - smoothstep(1.0 - w, 1.0 + w, r);
  float a = circle * v_color.a * v_fog * u_pointOpacity;
  if (a <= 0.0) discard;
  gl_FragColor = vec4(v_color.rgb * a, a);
}
`

const VS_LINES = `
attribute vec3  a_wPos;
attribute vec4  a_color;
attribute float a_sim;
attribute float a_isAccent;
uniform mat3  u_rot;
uniform vec3  u_target;
uniform float u_dist;
uniform float u_fov;
uniform vec2  u_resolution;
uniform float u_fogNear;
uniform float u_fogFar;
uniform float u_simCutoff;
uniform float u_accentAlpha;
varying vec4  v_color;
void main() {
  vec3 vp = u_rot * (a_wPos - u_target);
  float depth = vp.z + u_dist;
  if (depth <= 0.02) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); v_color = vec4(0.0); return; }
  vec2 screen = vec2(u_resolution.x * 0.5, u_resolution.y * 0.5)
              + vec2(vp.x, -vp.y) * (u_fov / depth);
  vec2 clip = vec2(screen.x / u_resolution.x * 2.0 - 1.0,
                   1.0 - screen.y / u_resolution.y * 2.0);
  gl_Position = vec4(clip, 0.0, 1.0);
  float fog = 1.0 - clamp((depth - u_fogNear) / max(u_fogFar - u_fogNear, 0.001), 0.0, 1.0);
  float alpha = a_color.a;
  if (u_simCutoff > -0.5 && a_sim > u_simCutoff) alpha = 0.0;
  alpha *= a_isAccent > 0.5 ? u_accentAlpha : 1.0;
  v_color = vec4(a_color.rgb, alpha * fog);
}
`
const FS_LINES = `
precision mediump float;
varying vec4 v_color;
void main() {
  if (v_color.a <= 0.0) discard;
  gl_FragColor = vec4(v_color.rgb * v_color.a, v_color.a);
}
`

const VS_QUAD = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
  v_uv = a_pos * 0.5 + 0.5;
}
`
const FS_TONEMAP = `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_tex;
uniform float u_opacity;
void main() {
  vec4 c = texture2D(u_tex, v_uv);
  vec3 tonemapped = c.rgb / (c.rgb + 0.6);
  gl_FragColor = vec4(tonemapped * u_opacity, c.a * u_opacity);
}
`

function compileShader(gl, type, source) {
  const sh = gl.createShader(type)
  gl.shaderSource(sh, source)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh)
    gl.deleteShader(sh)
    throw new Error('shader compile: ' + log)
  }
  return sh
}
function buildProgram(gl, vsSource, fsSource) {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSource)
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSource)
  const prog = gl.createProgram()
  gl.attachShader(prog, vs); gl.attachShader(prog, fs)
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error('link: ' + gl.getProgramInfoLog(prog))
  }
  return { prog, vs, fs }
}

export function createPointsRenderer(canvas) {
  const gl = canvas.getContext('webgl', { antialias: true, premultipliedAlpha: true })
  if (!gl) return null
  const uintIndexExt = gl.getExtension('OES_element_index_uint')
  gl.getExtension('OES_standard_derivatives')

  const pts = buildProgram(gl, VS, FS)
  const pLocs = {
    a_wPos: gl.getAttribLocation(pts.prog, 'a_wPos'),
    a_color: gl.getAttribLocation(pts.prog, 'a_color'),
    u_rot: gl.getUniformLocation(pts.prog, 'u_rot'),
    u_target: gl.getUniformLocation(pts.prog, 'u_target'),
    u_dist: gl.getUniformLocation(pts.prog, 'u_dist'),
    u_fov: gl.getUniformLocation(pts.prog, 'u_fov'),
    u_resolution: gl.getUniformLocation(pts.prog, 'u_resolution'),
    u_pointSize: gl.getUniformLocation(pts.prog, 'u_pointSize'),
    u_pointSizeMul: gl.getUniformLocation(pts.prog, 'u_pointSizeMul'),
    u_pointOpacity: gl.getUniformLocation(pts.prog, 'u_pointOpacity'),
    u_fogNear: gl.getUniformLocation(pts.prog, 'u_fogNear'),
    u_fogFar: gl.getUniformLocation(pts.prog, 'u_fogFar'),
  }
  const posBuf = gl.createBuffer(), colBuf = gl.createBuffer(), idxBuf = gl.createBuffer()
  let numPoints = 0, numIndices = 0, indexedMode = false

  const lines = buildProgram(gl, VS_LINES, FS_LINES)
  const lLocs = {
    a_wPos: gl.getAttribLocation(lines.prog, 'a_wPos'),
    a_color: gl.getAttribLocation(lines.prog, 'a_color'),
    a_sim: gl.getAttribLocation(lines.prog, 'a_sim'),
    a_isAccent: gl.getAttribLocation(lines.prog, 'a_isAccent'),
    u_rot: gl.getUniformLocation(lines.prog, 'u_rot'),
    u_target: gl.getUniformLocation(lines.prog, 'u_target'),
    u_dist: gl.getUniformLocation(lines.prog, 'u_dist'),
    u_fov: gl.getUniformLocation(lines.prog, 'u_fov'),
    u_resolution: gl.getUniformLocation(lines.prog, 'u_resolution'),
    u_fogNear: gl.getUniformLocation(lines.prog, 'u_fogNear'),
    u_fogFar: gl.getUniformLocation(lines.prog, 'u_fogFar'),
    u_simCutoff: gl.getUniformLocation(lines.prog, 'u_simCutoff'),
    u_accentAlpha: gl.getUniformLocation(lines.prog, 'u_accentAlpha'),
  }
  const linePosBuf = gl.createBuffer(), lineColBuf = gl.createBuffer(), lineSimBuf = gl.createBuffer(), lineAccentBuf = gl.createBuffer()
  let numLineVerts = 0, numAccentLineVerts = 0

  const quadProg = buildProgram(gl, VS_QUAD, FS_TONEMAP)
  const qLocs = {
    a_pos: gl.getAttribLocation(quadProg.prog, 'a_pos'),
    u_tex: gl.getUniformLocation(quadProg.prog, 'u_tex'),
    u_opacity: gl.getUniformLocation(quadProg.prog, 'u_opacity'),
  }
  const quadBuf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW)

  // 2× supersampled FBO — renders at double res then hardware bilinear
  // downsamples on composite, giving effective 4× SSAA everywhere.
  // 1.5× supersampling — mild upscale, bilinear downscale on composite gives
  // noticeable AA at only 2.25× pixel cost (vs 4× for 2× SSAA).
  const SSAA = 2
  let fbW = 0, fbH = 0, fbTex = null, fb = null

  function makeFBO(w, h) {
    const tex = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    const f = gl.createFramebuffer()
    gl.bindFramebuffer(gl.FRAMEBUFFER, f)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    return { tex, fb: f }
  }

  function ensureFBO(w, h) {
    if (w === fbW && h === fbH && fbTex) return
    fbW = w; fbH = h
    if (fbTex) { gl.deleteTexture(fbTex); gl.deleteFramebuffer(fb) }
    const f = makeFBO(w * SSAA, h * SSAA); fbTex = f.tex; fb = f.fb
  }

  let cssW = 500, cssH = 500
  function resize(cw, ch, dpr) {
    cssW = cw; cssH = ch
    const w = Math.round(cw * dpr), h = Math.round(ch * dpr)
    if (canvas.width !== w) canvas.width = w
    if (canvas.height !== h) canvas.height = h
    gl.viewport(0, 0, w, h)
    gl.useProgram(pts.prog);   gl.uniform2f(pLocs.u_resolution, cw, ch)
    gl.useProgram(lines.prog); gl.uniform2f(lLocs.u_resolution, cw, ch)
    if (fbTex && (w !== fbW || h !== fbH)) {
      gl.deleteTexture(fbTex); gl.deleteFramebuffer(fb)
      fbTex = fb = null
    }
  }
  function uploadPositions(pa,n){gl.bindBuffer(gl.ARRAY_BUFFER,posBuf);gl.bufferData(gl.ARRAY_BUFFER,pa,gl.DYNAMIC_DRAW);numPoints=n}
  let hasColors=false
  function uploadColors(ca){gl.bindBuffer(gl.ARRAY_BUFFER,colBuf);gl.bufferData(gl.ARRAY_BUFFER,ca,gl.DYNAMIC_DRAW);hasColors=true}
  function uploadIndices(ia,hlC=0){indexedMode=true;if(!ia||!ia.length){numIndices=0;numHighlightedIndices=0;return}gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,idxBuf);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,ia,gl.DYNAMIC_DRAW);numIndices=ia.length;numHighlightedIndices=hlC;idxIs32=uintIndexExt&&ia instanceof Uint32Array}
  let idxIs32=false,numHighlightedIndices=0
  function uploadLines(pa,ca,sa,aa,vc,ac=0){gl.bindBuffer(gl.ARRAY_BUFFER,linePosBuf);gl.bufferData(gl.ARRAY_BUFFER,pa,gl.DYNAMIC_DRAW);gl.bindBuffer(gl.ARRAY_BUFFER,lineColBuf);gl.bufferData(gl.ARRAY_BUFFER,ca,gl.DYNAMIC_DRAW);gl.bindBuffer(gl.ARRAY_BUFFER,lineSimBuf);gl.bufferData(gl.ARRAY_BUFFER,sa,gl.DYNAMIC_DRAW);gl.bindBuffer(gl.ARRAY_BUFFER,lineAccentBuf);gl.bufferData(gl.ARRAY_BUFFER,aa,gl.DYNAMIC_DRAW);numLineVerts=vc;numAccentLineVerts=ac}
  function bindLineAttrs() {
    gl.bindBuffer(gl.ARRAY_BUFFER,linePosBuf);gl.enableVertexAttribArray(lLocs.a_wPos);gl.vertexAttribPointer(lLocs.a_wPos,3,gl.FLOAT,false,0,0)
    gl.bindBuffer(gl.ARRAY_BUFFER,lineColBuf);gl.enableVertexAttribArray(lLocs.a_color);gl.vertexAttribPointer(lLocs.a_color,4,gl.FLOAT,false,0,0)
    gl.bindBuffer(gl.ARRAY_BUFFER,lineSimBuf);gl.enableVertexAttribArray(lLocs.a_sim);gl.vertexAttribPointer(lLocs.a_sim,1,gl.FLOAT,false,0,0)
    gl.bindBuffer(gl.ARRAY_BUFFER,lineAccentBuf);gl.enableVertexAttribArray(lLocs.a_isAccent);gl.vertexAttribPointer(lLocs.a_isAccent,1,gl.FLOAT,false,0,0)
  }
  function drawQuad(tex, opacity) {
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.uniform1i(qLocs.u_tex, 0); gl.uniform1f(qLocs.u_opacity, opacity)
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf); gl.enableVertexAttribArray(qLocs.a_pos); gl.vertexAttribPointer(qLocs.a_pos, 2, gl.FLOAT, false, 0, 0)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }

  function render({ rot, target, dist, fov, pointSizeWorld, dpr, fogNear, fogFar,
                     pointSizeMul = 1, pointOpacity = 1, lineWidth = 1, simCutoff = -1,
                     layerOpacity = 1, accentAlpha = 0 }) {
    const tx = target[0], ty = target[1], tz = target[2]
    const w = Math.round(cssW * dpr), h = Math.round(cssH * dpr)
    ensureFBO(w, h)
    const regularCount = numLineVerts - numAccentLineVerts
    const regularPointCount = numIndices - numHighlightedIndices

    // ── Pass 1: edges + nodes → FBO at 2× resolution ─────────────────────
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
    gl.viewport(0, 0, w * SSAA, h * SSAA)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)

    if (regularCount > 0) {
      gl.useProgram(lines.prog)
      gl.uniformMatrix3fv(lLocs.u_rot, false, rot)
      gl.uniform3f(lLocs.u_target, tx, ty, tz)
      gl.uniform1f(lLocs.u_dist, dist)
      gl.uniform1f(lLocs.u_fov, fov)
      gl.uniform1f(lLocs.u_fogNear, fogNear)
      gl.uniform1f(lLocs.u_fogFar, fogFar)
      gl.uniform1f(lLocs.u_simCutoff, simCutoff ?? -1)
      gl.lineWidth(Math.max(0.5, lineWidth * SSAA))
      bindLineAttrs()
      gl.drawArrays(gl.LINES, 0, regularCount)
    }
    if (numPoints > 0 && regularPointCount > 0) {
      gl.useProgram(pts.prog)
      if (cssW != null) gl.uniform2f(pLocs.u_resolution, cssW, cssH)
      gl.uniformMatrix3fv(pLocs.u_rot, false, rot)
      gl.uniform3f(pLocs.u_target, tx, ty, tz)
      gl.uniform1f(pLocs.u_dist, dist)
      gl.uniform1f(pLocs.u_fov, fov)
      gl.uniform1f(pLocs.u_pointSize, pointSizeWorld * dpr * SSAA)
      gl.uniform1f(pLocs.u_pointSizeMul, pointSizeMul)
      gl.uniform1f(pLocs.u_pointOpacity, pointOpacity)
      gl.uniform1f(pLocs.u_fogNear, fogNear)
      gl.uniform1f(pLocs.u_fogFar, fogFar)
      gl.bindBuffer(gl.ARRAY_BUFFER,posBuf);gl.enableVertexAttribArray(pLocs.a_wPos);gl.vertexAttribPointer(pLocs.a_wPos,3,gl.FLOAT,false,0,0)
      if (hasColors) {
        gl.bindBuffer(gl.ARRAY_BUFFER,colBuf);gl.enableVertexAttribArray(pLocs.a_color);gl.vertexAttribPointer(pLocs.a_color,4,gl.FLOAT,false,0,0)
      } else {
        gl.disableVertexAttribArray(pLocs.a_color);gl.vertexAttrib4f(pLocs.a_color,0.6,0.72,1.0,1.0)
      }
      if (indexedMode) {
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,idxBuf)
        gl.drawElements(gl.POINTS,regularPointCount,idxIs32?gl.UNSIGNED_INT:gl.UNSIGNED_SHORT,0)
      } else {
        gl.drawArrays(gl.POINTS,0,numPoints)
      }
    }

    // ── Pass 2: composite FBO → screen, bilinear downscale = 4× SSAA ─────
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, w, h)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    gl.useProgram(quadProg.prog)
    drawQuad(fbTex, layerOpacity)

    // ── Accent edges direct on top ────────────────────────────────────────
    if (numAccentLineVerts > 0) {
      gl.useProgram(lines.prog)
      gl.uniformMatrix3fv(lLocs.u_rot, false, rot)
      gl.uniform3f(lLocs.u_target, tx, ty, tz)
      gl.uniform1f(lLocs.u_dist, dist)
      gl.uniform1f(lLocs.u_fov, fov)
      gl.uniform1f(lLocs.u_fogNear, fogNear)
      gl.uniform1f(lLocs.u_fogFar, fogFar)
      gl.uniform1f(lLocs.u_simCutoff, simCutoff ?? -1)
      gl.uniform1f(lLocs.u_accentAlpha, accentAlpha)
      gl.lineWidth(Math.max(0.5, lineWidth))
      bindLineAttrs()
      gl.drawArrays(gl.LINES, regularCount, numAccentLineVerts)
    }

    // ── Highlighted nodes direct on top ───────────────────────────────────
    if (numHighlightedIndices > 0) {
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
      gl.useProgram(pts.prog)
      if (cssW != null) gl.uniform2f(pLocs.u_resolution, cssW, cssH)
      gl.uniformMatrix3fv(pLocs.u_rot, false, rot)
      gl.uniform3f(pLocs.u_target, tx, ty, tz)
      gl.uniform1f(pLocs.u_dist, dist)
      gl.uniform1f(pLocs.u_fov, fov)
      gl.uniform1f(pLocs.u_pointSize, pointSizeWorld * dpr)
      gl.uniform1f(pLocs.u_pointSizeMul, pointSizeMul)
      gl.uniform1f(pLocs.u_pointOpacity, 1.0)
      gl.uniform1f(pLocs.u_fogNear, fogNear)
      gl.uniform1f(pLocs.u_fogFar, fogFar)
      gl.bindBuffer(gl.ARRAY_BUFFER,posBuf);gl.enableVertexAttribArray(pLocs.a_wPos);gl.vertexAttribPointer(pLocs.a_wPos,3,gl.FLOAT,false,0,0)
      if (hasColors) {
        gl.bindBuffer(gl.ARRAY_BUFFER,colBuf);gl.enableVertexAttribArray(pLocs.a_color);gl.vertexAttribPointer(pLocs.a_color,4,gl.FLOAT,false,0,0)
      } else {
        gl.disableVertexAttribArray(pLocs.a_color);gl.vertexAttrib4f(pLocs.a_color,0.6,0.72,1.0,1.0)
      }
      if (indexedMode) {
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,idxBuf)
        const offsetBytes=(numIndices-numHighlightedIndices)*(idxIs32?4:2)
        gl.drawElements(gl.POINTS,numHighlightedIndices,idxIs32?gl.UNSIGNED_INT:gl.UNSIGNED_SHORT,offsetBytes)
      } else {
        gl.drawArrays(gl.POINTS,numPoints-numHighlightedIndices,numHighlightedIndices)
      }
    }
  }

  function destroy() {
    gl.deleteBuffer(posBuf); gl.deleteBuffer(colBuf); gl.deleteBuffer(idxBuf)
    gl.deleteBuffer(linePosBuf); gl.deleteBuffer(lineColBuf); gl.deleteBuffer(lineSimBuf); gl.deleteBuffer(lineAccentBuf)
    gl.deleteBuffer(quadBuf)
    gl.deleteProgram(pts.prog); gl.deleteShader(pts.vs); gl.deleteShader(pts.fs)
    gl.deleteProgram(lines.prog); gl.deleteShader(lines.vs); gl.deleteShader(lines.fs)
    gl.deleteProgram(quadProg.prog); gl.deleteShader(quadProg.vs); gl.deleteShader(quadProg.fs)
    if (fbTex) { gl.deleteTexture(fbTex); gl.deleteFramebuffer(fb) }
  }

  return { resize, uploadPositions, uploadColors, uploadIndices, uploadLines, render, destroy }
}
