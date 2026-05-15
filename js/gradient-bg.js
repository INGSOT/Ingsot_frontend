/**
 * GradientBg — WebGL animated gradient background
 * Zero CPU rendering — all math runs on GPU via GLSL shader
 *
 * Usage:
 *   const bg = new GradientBg('#my-canvas', config);
 *   bg.destroy(); // cleanup
 */

class GradientBg {

  // ─── Vertex shader ────────────────────────────────────────────────────────
  static VS = `
    attribute vec2 a_pos;
    void main() {
      gl_Position = vec4(a_pos, 0.0, 1.0);
    }
  `;

  // ─── Fragment shader ──────────────────────────────────────────────────────
  // GL_FRAGMENT_PRECISION_HIGH guard: страховка для GPU без highp у FS
  static FS = `
    #ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp float;
    #else
    precision mediump float;
    #endif

    uniform vec2  u_res;
    uniform float u_time;   // секунди з моменту старту, росте нескінченно
    uniform float u_speed;  // = 1.0 / duration
    uniform vec3  u_bg;

    uniform vec3  u_c0, u_c1, u_c2, u_c3;
    uniform vec2  u_f0, u_f1, u_f2, u_f3;
    uniform vec2  u_to0, u_to1, u_to2, u_to3;
    uniform float u_r0, u_r1, u_r2, u_r3;

    // sin(time) → плавний нескінченний цикл без жодного стрибка
    float pingpong(float speed) {
      return 0.5 + 0.5 * sin(u_time * speed * 3.14159265);
    }

    // Gaussian blob — no banding, smooth falloff
    vec3 blob(vec2 uv, vec2 from, vec2 to, float r, vec3 col, float p) {
      vec2  c = mix(from, to, p);
      float d = length(uv - c) / r;
      float w = exp(-d * d * 2.5);
      return col * w;
    }

    // Dithering — псевдовипадковий шум розбиває banding
    // Класична формула від Vlachos (GDC 2010)
    float dither(vec2 pos) {
      return fract(dot(pos, vec2(0.75487766, 0.56984029)));
    }

    void main() {
      vec2 uv = gl_FragCoord.xy / u_res;
      uv.y = 1.0 - uv.y;

      float p0 = pingpong(u_speed);
      float p1 = pingpong(u_speed * 0.97);
      float p2 = pingpong(u_speed * 1.03);
      float p3 = pingpong(u_speed * 0.91);

      vec3 col = u_bg;
      col += blob(uv, u_f0, u_to0, u_r0, u_c0, p0);
      col += blob(uv, u_f1, u_to1, u_r1, u_c1, p1);
      col += blob(uv, u_f2, u_to2, u_r2, u_c2, p2);
      col += blob(uv, u_f3, u_to3, u_r3, u_c3, p3);

      // Додаємо шум розміром половини одного біта (1/255 * 0.5)
      // Візуально непомітний але розбиває сходинки
      float noise = dither(gl_FragCoord.xy) / 255.0;
      col += vec3(noise);

      gl_FragColor = vec4(col, 1.0);
    }
  `;

  // ─── Constructor ──────────────────────────────────────────────────────────
  /**
   * @param {string|HTMLCanvasElement} target — CSS selector або canvas елемент
   * @param {Object} config — конфіг (див. gradient-presets.js)
   */
  constructor(target, config) {
    this._canvas = typeof target === 'string'
      ? document.querySelector(target)
      : target;

    if (!this._canvas) throw new Error(`GradientBg: canvas not found — "${target}"`);

    this._config    = config;
    this._startTime = null;
    this._rafId     = null;
    this._gl        = null;
    this._prog      = null;
    this._u         = null;
    this._inited    = false;   // GL context або fallback вже піднято
    this._fallback  = false;   // ми у CSS-fallback режимі
    this._visible   = false;   // IntersectionObserver state
    this._lastFrame = 0;       // для throttle 30fps

    this._onContextLost      = this._onContextLost.bind(this);
    this._onContextRestored  = this._onContextRestored.bind(this);

    this._initResizeObserver();
    this._initVisibilityObserver();
    // GL контекст створюється лазі — у `_tryInit` коли canvas видимий і має розмір.
    // Це знімає race з layout (iOS Safari) і кратно зменшує одночасне memory usage
    // на сторінках з кількома канвасами.
  }

  // ─── Lazy initialization ──────────────────────────────────────────────────
  // Викликається з IntersectionObserver і ResizeObserver. Намагається підняти
  // GL контекст у момент коли canvas одночасно (а) видимий і (б) має розмір > 0.
  _tryInit() {
    if (this._inited) return;
    if (!this._visible) return;
    if (!this._hasValidSize()) return;

    // low-power: підказка браузеру використовувати менш потужний GPU
    // знижує температуру на iMac M1 без помітної різниці в якості
    this._gl = this._canvas.getContext('webgl2', { powerPreference: 'low-power' })
            || this._canvas.getContext('webgl',  { powerPreference: 'low-power' });

    // WebGL недоступний (приватний режим, старі браузери) — CSS fallback
    if (!this._gl) {
      this._fallback = true;
      this._inited   = true;
      this._applyFallback();
      return;
    }

    this._canvas.addEventListener('webglcontextlost',     this._onContextLost,     false);
    this._canvas.addEventListener('webglcontextrestored', this._onContextRestored, false);

    try {
      this._initGL();
    } catch (e) {
      // Compile/link збій — переключаємось у fallback замість чорного екрана
      console.warn('GradientBg: GL init failed, falling back to CSS', e);
      this._teardownGL();
      this._fallback = true;
      this._inited   = true;
      this._applyFallback();
      return;
    }

    this._resize();
    this._inited = true;
    this._startRaf();
  }

  // ─── CSS Fallback (WebGL недоступний) ────────────────────────────────────
  _applyFallback() {
    const b   = this._config.blobs;
    const bg  = this._config.bg;

    const hsl = (blob) =>
      `hsl(${blob.h},${Math.round(blob.s * 100)}%,${Math.round(blob.l * 100)}%)`;

    const bgRgb = `rgb(${Math.round(bg[0]*255)},${Math.round(bg[1]*255)},${Math.round(bg[2]*255)})`;

    // Статичний радіальний градієнт з кольорів конфігу
    this._canvas.style.background = [
      `radial-gradient(ellipse at ${Math.round(b[0].fx*100)}% ${Math.round(b[0].fy*100)}%, ${hsl(b[0])} 0%, transparent 60%)`,
      `radial-gradient(ellipse at ${Math.round(b[2].fx*100)}% ${Math.round(b[2].fy*100)}%, ${hsl(b[2])} 0%, transparent 60%)`,
      `radial-gradient(ellipse at ${Math.round(b[1].fx*100)}% ${Math.round(b[1].fy*100)}%, ${hsl(b[1])} 0%, transparent 70%)`,
      bgRgb,
    ].join(',');
  }

  // ─── WebGL init ───────────────────────────────────────────────────────────
  _initGL() {
    const gl = this._gl;

    const vs = this._compile(gl.VERTEX_SHADER,   GradientBg.VS);
    const fs = this._compile(gl.FRAGMENT_SHADER, GradientBg.FS);

    this._prog = gl.createProgram();
    gl.attachShader(this._prog, vs);
    gl.attachShader(this._prog, fs);
    gl.linkProgram(this._prog);

    if (!gl.getProgramParameter(this._prog, gl.LINK_STATUS)) {
      throw new Error('GradientBg: shader link error — ' + gl.getProgramInfoLog(this._prog));
    }

    gl.useProgram(this._prog);

    // Full-screen quad
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1,-1, 1,-1, -1,1, 1,1]),
      gl.STATIC_DRAW
    );

    const aPos = gl.getAttribLocation(this._prog, 'a_pos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    // Cache uniform locations
    this._u = {};
    const names = [
      'u_res','u_time','u_speed','u_bg',
      'u_c0','u_c1','u_c2','u_c3',
      'u_f0','u_f1','u_f2','u_f3',
      'u_to0','u_to1','u_to2','u_to3',
      'u_r0','u_r1','u_r2','u_r3',
    ];
    for (const n of names) {
      this._u[n] = gl.getUniformLocation(this._prog, n);
    }
  }

  _compile(type, src) {
    const gl = this._gl;
    const s  = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error('GradientBg: shader compile error — ' + gl.getShaderInfoLog(s));
    }
    return s;
  }

  _teardownGL() {
    this._prog = null;
    this._u    = null;
    this._gl   = null;
  }

  // ─── Context loss / restore (iOS Safari memory pressure, rotation, tab switch)
  _onContextLost(e) {
    // preventDefault() обов'язковий — без нього restored ніколи не fires
    e.preventDefault();
    if (this._rafId) cancelAnimationFrame(this._rafId);
    this._rafId     = null;
    this._prog      = null;
    this._u         = null;
    this._startTime = null;
  }

  _onContextRestored() {
    if (!this._gl) return;
    try {
      this._initGL();
    } catch (err) {
      console.warn('GradientBg: failed to restore GL context, falling back', err);
      this._teardownGL();
      this._fallback = true;
      this._applyFallback();
      return;
    }
    this._resize();
    if (this._visible) this._startRaf();
  }

  // ─── Visibility (пауза коли canvas поза viewport) ────────────────────────
  _initVisibilityObserver() {
    this._io = new IntersectionObserver(([entry]) => {
      this._visible = entry.isIntersecting;
      if (this._visible) {
        if (!this._inited) {
          this._tryInit();
        } else if (this._gl && !this._rafId) {
          this._startRaf();
        }
      } else if (this._rafId) {
        cancelAnimationFrame(this._rafId);
        this._rafId = null;
      }
    }, { threshold: 0.01 }); // 1% видимості вже достатньо щоб запустити
    this._io.observe(this._canvas);
  }

  // ─── Resize ───────────────────────────────────────────────────────────────
  _initResizeObserver() {
    this._ro = new ResizeObserver(() => {
      if (this._gl) {
        this._resize();
      } else if (!this._inited) {
        // Розмір з'явився — можливо тепер можемо ініціалізуватися
        this._tryInit();
      }
    });
    this._ro.observe(this._canvas);
  }

  _hasValidSize() {
    const r = this._canvas.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  // DPR обмежений до 2: на iPhone з DPR=3 повний backing buffer (×9 пікселів)
  // спричиняє memory kill в iOS Safari. На blurred gradient blobs різниця
  // 2x→3x DPR візуально непомітна.
  _resize() {
    if (!this._gl) return;
    const r = this._canvas.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;  // не псуємо буфер 0×0

    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = Math.round(r.width  * dpr);
    const h = Math.round(r.height * dpr);

    if (this._canvas.width  !== w) this._canvas.width  = w;
    if (this._canvas.height !== h) this._canvas.height = h;
    this._gl.viewport(0, 0, this._canvas.width, this._canvas.height);
  }

  // ─── Animation loop ───────────────────────────────────────────────────────
  _startRaf() {
    if (this._rafId) return;
    this._startTime = null;
    this._lastFrame = 0;
    this._rafId = requestAnimationFrame(ts => this._frame(ts));
  }

  _frame(ts) {
    // Якщо контекст загублено посеред кадру — припиняємо до restored
    if (!this._gl || this._gl.isContextLost() || !this._prog) {
      this._rafId = null;
      return;
    }

    // Throttle до 30fps — знижує навантаження на WindowServer і температуру
    // на повільній градієнтній анімації різниця 30/60fps непомітна
    const elapsed = ts - this._lastFrame;
    if (elapsed < 33) { // 33ms ≈ 30fps
      this._rafId = requestAnimationFrame(ts => this._frame(ts));
      return;
    }
    this._lastFrame = ts;

    if (!this._startTime) this._startTime = ts;
    const time = (ts - this._startTime) / 1000;
    if (this._canvas.width > 0 && this._canvas.height > 0) {
      this._draw(time);
    }
    this._rafId = requestAnimationFrame(ts => this._frame(ts));
  }

  // ─── Draw ─────────────────────────────────────────────────────────────────
  _draw(time) {
    const gl = this._gl;
    const u  = this._u;
    const c  = this._config;
    const speed = 1.0 / (c.duration || 15);

    gl.uniform2f(u['u_res'],   this._canvas.width, this._canvas.height);
    gl.uniform1f(u['u_time'],  time);
    gl.uniform1f(u['u_speed'], speed);
    gl.uniform3fv(u['u_bg'],   c.bg);

    c.blobs.forEach((b, i) => {
      const rgb = GradientBg.hsl2rgb(b.h, b.s, b.l);
      gl.uniform3fv(u[`u_c${i}`],  rgb);
      gl.uniform2f( u[`u_f${i}`],  b.fx, b.fy);
      gl.uniform2f( u[`u_to${i}`], b.tx, b.ty);
      gl.uniform1f( u[`u_r${i}`],  b.r);
    });

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  // ─── Config update (для зміни пресету без перезапуску) ────────────────────
  /**
   * Оновити конфіг на льоту (наприклад при переході між сторінками SPA)
   * @param {Object} config
   */
  updateConfig(config) {
    this._config    = config;
    this._startTime = null;
    if (this._fallback) this._applyFallback();
  }

  // ─── Cleanup ──────────────────────────────────────────────────────────────
  destroy() {
    if (this._rafId) cancelAnimationFrame(this._rafId);
    if (this._ro)    this._ro.disconnect();
    if (this._io)    this._io.disconnect();
    if (this._canvas) {
      this._canvas.removeEventListener('webglcontextlost',     this._onContextLost,     false);
      this._canvas.removeEventListener('webglcontextrestored', this._onContextRestored, false);
    }
    if (this._gl) this._gl.getExtension('WEBGL_lose_context')?.loseContext();
  }

  // ─── HSL → RGB utility (JS side, для конфігу) ────────────────────────────
  static hsl2rgb(h, s, l) {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - c / 2;
    let r, g, b;
    if      (h < 60)  { r=c; g=x; b=0; }
    else if (h < 120) { r=x; g=c; b=0; }
    else if (h < 180) { r=0; g=c; b=x; }
    else if (h < 240) { r=0; g=x; b=c; }
    else if (h < 300) { r=x; g=0; b=c; }
    else              { r=c; g=0; b=x; }
    return new Float32Array([r+m, g+m, b+m]);
  }
}
