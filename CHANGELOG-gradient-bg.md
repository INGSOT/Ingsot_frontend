# Журнал змін: `js/gradient-bg.js`

---

## 2026-05-15 — perf: 30fps throttle + low-power GPU

**Коміт:** `19b6f92` — `perf(gradient-bg): throttle to 30fps and low-power GPU preference`

### Чому

WebGL-анімація крутилася на 60fps з GPU за замовчуванням. На сторінках з кількома канвасами (`index.html` — 4 одночасно) це:
- помітно нагрівало пристрій (iMac у тестах виходив до ~90°C),
- на ноутбуках з перемикальною графікою (Intel + дискретна) пробуджало дискретну GPU, що додатково гріло і знижувало автономність.

Сам шейдер легкий, але `requestAnimationFrame × 60Hz × 4 контексти = 240 fragment-passes/сек`, плюс шейдер з 4 Gaussian blob-ами і dithering на повний viewport кожного канваса.

### Що змінено

#### 1. `powerPreference: 'low-power'`

```js
this._gl = this._canvas.getContext('webgl2', { powerPreference: 'low-power' })
        || this._canvas.getContext('webgl',  { powerPreference: 'low-power' });
```

Підказка браузеру обирати інтегровану GPU замість дискретної. На пристроях з єдиною GPU — no-op. На MacBook Pro з discrete — критично: різниця між integrated і дискретною ~5-10× по енергоспоживанню.

#### 2. Throttle до 30fps

У конструкторі додано `this._lastFrame = 0`, у `_startRaf()` ресет цього ж поля, у `_frame()`:

```js
const elapsed = ts - this._lastFrame;
if (elapsed < 33) { // 33ms ≈ 30fps
  this._rafId = requestAnimationFrame(ts => this._frame(ts));
  return;
}
this._lastFrame = ts;
// ... решта draw логіки
```

На rAF з частотою монітора 60Hz це робить draw кожен **другий** кадр (~33.33ms apart) → реальні стабільні 30fps. Для повільної анімації blob-ів різниця 30/60fps візуально непомітна, але CPU/GPU роботи вдвічі менше.

#### 3. `_lastFrame` ресет у `_startRaf()`

Без цього після pause→resume (IntersectionObserver або context restored) перший кадр спрацював би з величезним `elapsed` (час паузи), draw виконався б одразу і потім нормальний цикл. Тривіальна страховка, але без неї поведінка нестабільна.

### Як перевірити

1. **Activity Monitor**: відкрий `index.html`, поспостерігай за CPU/GPU. WindowServer і браузер мають займати помітно менше CPU vs до фіксу.
2. **Battery on MacBook**: дискретна GPU не повинна вмикатися (Activity Monitor → Energy → GPU column).
3. **Візуально**: анімація має виглядати так само плавно. 30fps на blur-градієнтах не помітно.

Якщо потрібна ще менша частота — змінити `33` на `66` (=15fps) або `100` (=10fps). Для цього типу анімації навіть 10fps виглядає прийнятно.

---

## 2026-05-14 — fix: стабілізація на iOS Safari

**Коміт:** `2eafb66` — `fix(gradient-bg): stabilise iOS Safari WebGL init`

### Проблема

На iPhone (iOS 17.5.1) Safari ~50% завантажень показував:
- повністю чорний фон замість анімованого градієнта, або
- нативне повідомлення Safari «сторінка не відображається належним чином» (це браузер сам убиває таб).

Відтворювалося навіть на мінімальній `example.html` з одним `<canvas>`.

---

### Першопричина

Не одна, а **три** взаємопов'язані причини. Кожна окремо могла дати збій, разом — давали 50% failure rate:

#### 1. Memory kill через DPR=3 на iPhone (головна)
`_resize()` створював backing buffer з повним `devicePixelRatio`. На iPhone DPR=3, viewport-висота 100vh ≈ 932 CSS px:
- Один canvas = 1290 × 2796 пікселів ≈ **14 МБ** на drawing buffer
- На `index.html` створювалися **4 контексти одночасно** ≈ **56 МБ**
- iOS Safari ріже сторінку при ~100-150 МБ → kill page

#### 2. Race з layout у конструкторі
WebGL контекст і `_resize()` викликалися синхронно в конструкторі. Якщо в цей момент canvas ще не отримав layout (зовнішній CSS/шрифти не застосовані) → `getBoundingClientRect()` повертає `0×0` → `canvas.width = 0` → broken context на iOS Safari.

#### 3. Відсутність обробки втрати контексту
iOS Safari скидає WebGL-контексти при rotation, tab switch, memory pressure. Без `webglcontextlost` обробника контекст не відновлюється — canvas залишається чорним.

---

### Що змінено

#### 1. Lazy GL init — створення контексту відкладено
**Було:** `getContext('webgl2')`, компіляція шейдерів і `_resize()` робилися у конструкторі.

**Стало:** конструктор лише чіпляє `IntersectionObserver` + `ResizeObserver`. WebGL контекст створюється у `_tryInit()` — тільки коли canvas одночасно:
- увійшов у viewport (IO fires `isIntersecting: true`), і
- має `getBoundingClientRect()` з шириною та висотою > 0.

**Що це лікує:**
- Race з layout — на момент створення контексту canvas гарантовано має валідний розмір.
- Memory pressure на `index.html` з 4 канвасами — контексти створюються послідовно по скролу, а не всі одразу при завантаженні.

#### 2. Кеп `devicePixelRatio` до 2
**Було:** `const dpr = devicePixelRatio || 1;` (3 на iPhone)
**Стало:** `const dpr = Math.min(devicePixelRatio || 1, 2);`

Знижує пам'ять одного буфера з ~14 МБ до ~6 МБ (~55%). На blurred gradient blobs різниця 2×→3× DPR візуально непомітна.

#### 3. Guard на нульовий розмір у `_resize()`
**Було:** `canvas.width = Math.round(r.width * dpr)` — могло стати `0`, що ламало контекст на iOS Safari.
**Стало:**
```js
if (r.width <= 0 || r.height <= 0) return;
```
Якщо canvas тимчасово не має розміру (через CSS-перебудову), залишаємо попередній буфер замість того щоб ламати GL state.

#### 4. Обробники `webglcontextlost` / `webglcontextrestored`
Додано в `_tryInit()` через `addEventListener`. У `_onContextLost`:
- `e.preventDefault()` — **обов'язково**, без цього `restored` ніколи не fires.
- Зупиняємо RAF, обнуляємо посилання на `_prog` / `_u`.

У `_onContextRestored`:
- Повторно компілюємо шейдери і пересоздаємо buffer/uniforms (`_initGL()`).
- Якщо знову `_visible` — рестартуємо RAF.

Тепер canvas автоматично відновлюється після rotation/tab switch/memory pressure.

#### 5. Precision fallback у fragment shader
**Було:** `precision highp float;` — на старих GPU без highp у FS компіляція провалюється.
**Стало:**
```glsl
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
```
На iOS 17 малоймовірно потрібно, але страховка безкоштовна.

#### 6. Try/catch навколо `_initGL`
Якщо shader compile або link провалився — раніше `throw` ламав ініціалізацію інших canvases на сторінці. Тепер падаємо в CSS-fallback для цього конкретного canvas через `_applyFallback()`, інші продовжують працювати.

#### 7. Skip `_draw()` коли контекст битий
У `_frame()` додано перевірку `gl.isContextLost()` і `!this._prog`. Якщо контекст загублено посеред кадру — припиняємо цикл до події `restored`, а не сипимо помилки в консоль.

#### 8. Флаг `_fallback` замість перевірки `!this._gl`
**Чому:** у новій lazy-моделі `_gl === null` означає одне з двох:
- ще не ініціалізовані (canvas не у viewport), або
- ми у CSS-fallback режимі.

`updateConfig()` раніше переключав на fallback, якщо `_gl` був `null` — у lazy-моделі це б помилково спрацьовувало для ще-не-ініціалізованих canvases. Тепер є явний `_fallback: boolean`.

---

### Що **не** змінилося

- **Публічний API класу:** `new GradientBg(target, config)`, `destroy()`, `updateConfig(config)`, посилання `bg._canvas` — все на місці.
- **Структура `GRADIENT_PRESETS`** і файл `js/gradient-presets.js` — не чіпали.
- **HTML/SCSS:** жодних правок на сторінках. `index.html`, `example.html` і решта 18 сторінок працюють без модифікацій.
- **Анімація візуально:** ідентична — той самий шейдер, ті самі blob-и.

---

### Як перевірити

1. **Stress reload на iPhone:** відкрий `example.html`, зроби 10+ hard reload поспіль. До фіксу падало ~5/10, тепер має бути 0/10.
2. **Багатоконтекстна сторінка:** `index.html` — 4 канваси, проскроль вниз до кінця. Кожен canvas має ожити в момент входження у viewport, а не одразу при завантаженні.
3. **Rotation:** поверни iPhone landscape ⇄ portrait кілька разів на `index.html`. Анімація має відновлюватися після кожного повороту (це гілка `webglcontextrestored`).
4. **Tab switch:** перейди в інший таб на 30+ секунд, повернись. Canvas не має залишитися чорним.
5. **Memory pressure:** відкрий 5-6 важких табів перед `index.html` — раніше це гарантовано вбивало сторінку, тепер має витримати.

Для діагностики на iPhone: підключи кабелем до Mac, відкрий `Safari → Develop → [iPhone] → [сторінка]`. У Console будуть видні `console.warn` з fallback-шляху і події `webglcontextlost`, якщо вони fires.

---

### Якщо проблема повернеться

Найімовірніші точки регресії і де копати:

| Симптом | Куди дивитися |
|---|---|
| Чорний canvas на iPhone при першому завантаженні | `_tryInit()` — чи fires IntersectionObserver, чи проходить `_hasValidSize()`. Логи: `console.log` всередині `_tryInit` |
| Canvas чорнішає після rotation/tab switch | `_onContextRestored` — чи відновлюється `_prog`, чи рестартує RAF |
| Знов «сторінка не відображається» | Перевір `Math.min(devicePixelRatio || 1, 2)` — можливо хтось підняв ліміт. Або додалося ще канвасів на сторінці |
| Працює на десктопі, не працює на мобільному | Перевір що CSS `.bcg_anim canvas` дає валідний розмір на момент входу у viewport (не `display:none` і не `width:0`) |

Якщо потрібен ще нижчий memory footprint — можна:
- Кепнути DPR до 1.5 (далі від нативної роздільної здатності, але економія ще ~30%).
- Звільняти GL контекст коли canvas давно поза viewport (наприклад `> 2× viewport` від поточної позиції) — додати `loseContext()` у гілку `_visible = false` + lazy відновлення при поверненні.
