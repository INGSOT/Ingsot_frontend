
// відкриття модалки
function openModal() {
  const modal = document.getElementById('modal');
  const wrapper = document.querySelector('.wrapper');

  if (modal) {
    modal.classList.add('on');
    // wrapper.classList.add('on');
  }
}

// закриття modal
const modal = document.getElementById('modal');
const wrapper = document.querySelector('.wrapper');

function closeModal() {
  modal.innerHTML = '';
  modal.classList.remove('on');
  wrapper.classList.remove('on');
}

// Делегування подій
modal.addEventListener('click', function (event) {
  // Клік по самому фоні
  if (event.target === modal) {
    closeModal();
  }

  // Клік по кнопці закриття
  if (event.target.matches('.modal_content .x12')) {
    event.stopPropagation(); // Щоб не передавати клік фону
    closeModal();
  }
});

// скрол до гори
const scrollToUp = () => {
  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });
}

// календар
const observer = new MutationObserver(() => {
  const calendarInput = document.querySelector("#calendar");
  if (calendarInput && !calendarInput._flatpickr) {
    flatpickr("#calendar", {
      inline: true,          // календар як блок
      locale: "uk",          // українська локалізація
      dateFormat: "d.m.Y",   // формат дати
      minDate: "today",      // тільки сьогодні і далі
      defaultDate: new Date(),
      monthSelectorType: "static", // тільки назва місяця, без випадаючого списку
      weekNumbers: false     // вимикаємо показ номерів тижнів
    });
  }
});
observer.observe(document.body, { childList: true, subtree: true });

// select
$(document).ready(function () {
  // Клік по .inp
  $(document).on('click', '.select .inp', function (e) {
    e.stopPropagation();

    var $inp = $(this);
    var $drop = $inp.siblings('.drop');

    // Закриваємо інші селекти
    $('.select .inp').not($inp).removeClass('on');
    $('.select .drop').not($drop).stop(true, true).slideUp(300);

    // Перемикаємо поточний
    $inp.toggleClass('on');
    $drop.stop(true, true).slideToggle(300);
  });

  // Клік по label
  $(document).on('click', '.select .drop label', function (e) {
    e.stopPropagation();

    var text = $(this).find('span').text();
    var $select = $(this).closest('.select');
    var $inp = $select.find('.inp');
    var $drop = $select.find('.drop');

    // плавна зміна тексту
    $inp.fadeOut(150, function () {
      $inp.text(text).fadeIn(150);
    });

    $inp.removeClass('on');
    $drop.stop(true, true).slideUp(300);
  });

  // Клік поза .select
  $(document).on('click', function (e) {
    if ($(e.target).closest('.select').length === 0) {
      $('.select .inp').removeClass('on');
      $('.select .drop').stop(true, true).slideUp(300);
    }
  });
});

// projects_slider
document.addEventListener('DOMContentLoaded', () => {
  const sliderEl = document.querySelector('#projects_slider');
  if (!sliderEl) return; // якщо елемента немає — вихід

  const n1 = document.querySelector('.projects_slider .progress .n1');
  const n2 = document.querySelector('.projects_slider .progress .n2');

  const projects_slider = new Swiper('#projects_slider', {
    loop: true,
    slidesPerView: 'auto',
    speed: 800,
    edgeSwipeThreshold: 1,
    longSwipesRatio: 0.1,
    navigation: {
      nextEl: '.projects_slider .slider_control button:last-of-type',
      prevEl: '.projects_slider .slider_control button:first-of-type',
    },
  });

  const total = projects_slider.slides.length; // кількість слайдів
  const step = 100 / total;
  const duration = 5000; // 5 сек на один крок
  let timer;
  let currentPercent = 0;

  function startCycle(index) {
    if (timer) clearInterval(timer);

    currentPercent = index * step;
    n1.style.width = currentPercent + '%';
    n2.style.width = currentPercent + '%';

    timer = setInterval(() => {
      currentPercent += (step / (duration / 50));
      n1.style.width = currentPercent + '%';

      const threshold = (projects_slider.realIndex + 1) * step;
      if (currentPercent >= threshold) {
        projects_slider.slideNext();

        // n2 залишається на позначці мінімум 1 сек
        n2.style.width = threshold + '%';
        n2.style.transition = 'width 0.3s ease';
        setTimeout(() => {
          // після 1 сек залишаємо як є
        }, 1000);

        if (currentPercent >= 100) {
          currentPercent = 0;
          n1.style.width = '0%';
          n2.style.width = '0%';
        }
      }
    }, 50);
  }

  startCycle(0);

  projects_slider.on('slideChange', () => {
    const index = projects_slider.realIndex % total;
    startCycle(index);
  });
});


// скрол до якоря
document.addEventListener("DOMContentLoaded", () => {
  const hash = window.location.hash; // наприклад "#anchor_approach"
  if (hash) {
    const target = document.querySelector(hash);
    if (target) {
      // зняти клас on з усіх братів
      document.querySelectorAll(".item.on").forEach(el => {
        el.classList.remove("on");
      });

      // додати клас on до цільового
      target.classList.add("on");

      // необов'язково: плавний скрол
      target.scrollIntoView({ behavior: "smooth" });
    }
  }
});








