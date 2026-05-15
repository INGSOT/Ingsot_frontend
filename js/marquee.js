/**
 * Seamless infinite marquee — requestAnimationFrame, modulo-based.
 *
 * Очікувана HTML-структура:
 *   <div class="marquee"> або <div class="marquee v2">
 *     <div class="track">
 *       <div class="inner">...items...</div>
 *     </div>
 *   </div>
 *
 * Скрипт клонує .inner стільки разів, щоб трек був достатньо широким для
 * безшовної прокрутки (track ≥ marquee + inner). Швидкість прив'язана до
 * ширини однієї .inner — одна копія проходить за `cycleSeconds` секунд.
 *
 * Особливості:
 *  - pause при hover (mouse), при втраті видимості (IntersectionObserver),
 *    при font/image reflow клонів автоматично пере-перераховує
 *  - rate-independent (rAF з delta-time)
 */

(function () {
  'use strict';

  const DEFAULT_CYCLE_SEC = 10;  // .marquee
  const V2_CYCLE_SEC      = 25;  // .marquee.v2

  function initMarquee(marquee) {
    const track = marquee.querySelector(':scope > .track');
    if (!track) return;

    const original = track.querySelector(':scope > .inner');
    if (!original) return;

    const cycleSeconds = marquee.classList.contains('v2') ? V2_CYCLE_SEC : DEFAULT_CYCLE_SEC;

    let innerWidth = 0;
    let offset     = 0;
    let lastTime   = 0;
    let isPaused   = false;
    let rafId      = null;

    function makeClone() {
      const clone = original.cloneNode(true);
      clone.classList.add('clone');
      clone.setAttribute('aria-hidden', 'true');
      // Дублікати не повинні приймати фокус
      clone.querySelectorAll('a, button, input, [tabindex]').forEach((el) => {
        el.setAttribute('tabindex', '-1');
      });
      return clone;
    }

    // Ідемпотентний sync: додає/видаляє клонів до потрібної кількості,
    // НЕ скидає offset і transform — анімація триває без стрибка.
    // Якщо innerWidth змінився (font swap, image load) — пропорційно
    // масштабує offset, щоб relative-позиція в циклі зберіглась.
    function ensureFill() {
      // getBoundingClientRect для sub-pixel precision — offsetWidth округлює
      // до цілих пікселів, через що клон може бути не точно над оригіналом
      // і modulo wrap "плаває" на 0.5px.
      const newInnerWidth = original.getBoundingClientRect().width;
      if (newInnerWidth === 0) return;

      const marqueeWidth = marquee.getBoundingClientRect().width;
      const needed       = Math.max(2, Math.ceil((marqueeWidth + newInnerWidth) / newInnerWidth));
      const existing     = track.querySelectorAll(':scope > .inner').length;

      if (existing < needed) {
        const frag = document.createDocumentFragment();
        for (let i = existing; i < needed; i++) frag.appendChild(makeClone());
        track.appendChild(frag);
      } else if (existing > needed) {
        const clones = track.querySelectorAll(':scope > .inner.clone');
        for (let i = clones.length - 1; i >= needed - 1; i--) clones[i].remove();
      }

      // Якщо вимірна ширина .inner змінилась — масштабуємо offset
      if (innerWidth > 0 && innerWidth !== newInnerWidth) {
        offset = (offset / innerWidth) * newInnerWidth;
      }
      innerWidth = newInnerWidth;
    }

    function frame(now) {
      if (!lastTime) lastTime = now;
      // Clamp dt у [0, 0.1]: коли таб був у фоні, rAF може дати dt=кілька
      // секунд за один кадр → стрибок. Обмежуємо 100 мс щоб уникнути цього.
      const dt = Math.min(0.1, Math.max(0, (now - lastTime) / 1000));
      lastTime = now;

      if (!isPaused && innerWidth > 0) {
        offset += (innerWidth / cycleSeconds) * dt;
        // modulo: безшовно повторюємо кожні innerWidth пікселів
        offset %= innerWidth;
        track.style.transform = `translate3d(${-offset}px, 0, 0)`;
      }
      rafId = requestAnimationFrame(frame);
    }

    function start() {
      if (rafId) return;
      lastTime = 0;
      rafId = requestAnimationFrame(frame);
    }

    function stop() {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    }

    // Pause при hover
    marquee.addEventListener('mouseenter', () => { isPaused = true; });
    marquee.addEventListener('mouseleave', () => { isPaused = false; lastTime = 0; });

    // Pause коли marquee поза viewport
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) start();
      else stop();
    }, { threshold: 0 });
    io.observe(marquee);

    // Пере-перераховуємо клони на resize або коли original змінив розмір
    // (наприклад після font swap або завантаження зображень).
    // ensureFill сам не зачіпає поточний offset, тому анімація триває.
    let resizeTimer;
    function recompute() {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(ensureFill, 100);
    }

    const roMarquee = new ResizeObserver(recompute);
    roMarquee.observe(marquee);

    const roInner = new ResizeObserver(recompute);
    roInner.observe(original);

    // Initial setup
    ensureFill();
  }

  function init() {
    document.querySelectorAll('.marquee').forEach(initMarquee);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
