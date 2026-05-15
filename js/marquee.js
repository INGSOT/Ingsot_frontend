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

    function clearClones() {
      track.querySelectorAll(':scope > .inner.clone').forEach((c) => c.remove());
    }

    // Клонує .inner стільки разів, щоб трек був ≥ marquee + innerWidth.
    // Це гарантує що при максимальному зсуві (-innerWidth) контент
    // повністю покриває видиму область — нема порожнього простору на краю.
    function ensureFill() {
      clearClones();
      innerWidth = original.offsetWidth;
      if (innerWidth === 0) return; // ще не виміряно (шрифти/зображення)

      const marqueeWidth = marquee.offsetWidth;
      const totalCopies  = Math.max(2, Math.ceil((marqueeWidth + innerWidth) / innerWidth));

      for (let i = 1; i < totalCopies; i++) {
        const clone = original.cloneNode(true);
        clone.classList.add('clone');
        clone.setAttribute('aria-hidden', 'true');
        // Дублікати не повинні приймати фокус
        clone.querySelectorAll('a, button, input, [tabindex]').forEach((el) => {
          el.setAttribute('tabindex', '-1');
        });
        track.appendChild(clone);
      }
    }

    function frame(now) {
      if (!lastTime) lastTime = now;
      const dt = (now - lastTime) / 1000;
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
    // (наприклад після font swap або завантаження зображень)
    let resizeTimer;
    function recompute() {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        offset = 0;
        track.style.transform = 'translate3d(0, 0, 0)';
        ensureFill();
      }, 100);
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
