
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

// Дропи в мобільному футері
document.addEventListener('click', (e) => {
  if (window.innerWidth <= 700 && e.target.matches('.link_block .link_title button')) {
    const button = e.target;
    const linkBlock = button.closest('.link_block');
    const drop = linkBlock?.querySelector('.drop');

    button.classList.toggle('on');
    drop?.classList.toggle('on');
  }
});

//анімація 
function initAnimations() {
  const containers = document.querySelectorAll('.anim_fond');

  containers.forEach(container => {
    const balls = container.querySelectorAll('.ball');

    // Центр і радіуси еліпса
    let centerX = container.clientWidth / 2;
    let centerY = container.clientHeight / 2;
    let a = container.clientWidth * 0.3;
    let b = container.clientHeight * 0.2;

    // Для кожної кулі зберігаємо її кут і швидкість
    const states = Array.from(balls).map((ball, index) => ({
      ball,
      angle: index * (Math.PI * 2 / balls.length), // початковий зсув
      speed: 0.003 + Math.random() * 0.001 // різна швидкість
    }));

    function frame() {
      states.forEach(state => {
        const { ball } = state;
        const x = centerX + a * Math.cos(state.angle) - ball.clientWidth / 2;
        const y = centerY + b * Math.sin(state.angle) - ball.clientHeight / 2;

        ball.style.transform = `translate(${x}px, ${y}px)`;

        // Оновлюємо кут з урахуванням швидкості
        state.angle += state.speed;
      });

      requestAnimationFrame(frame);
    }

    frame();

    // При зміні розміру оновлюємо центр і радіуси
    window.addEventListener('resize', () => {
      centerX = container.clientWidth / 2;
      centerY = container.clientHeight / 2;
      a = container.clientWidth * 0.4;
      b = container.clientHeight * 0.3;
    });
  });
}

// Запуск після завантаження сторінки
window.addEventListener('load', initAnimations);

// перемикання в help_ways
$(document).ready(function () {
  const $items = $('#help_ways .item');

  // --- При завантаженні сторінки ---
  $items.each(function () {
    const $item = $(this);
    if ($item.hasClass('on')) {
      // ліва частина завжди відкривається
      $item.find('.left .drop').slideDown(500);

      // права частина тільки на ширині ≤1024
      if ($(window).width() <= 1024) {
        $item.find('.right .drop').slideDown(500);
        $item.find('.big_img').slideDown(500);
      }
    }
  });

  // --- Клік по кнопці ---
  $items.each(function () {
    const $item = $(this);
    const $btn = $item.find('.left button');

    $btn.on('click', function () {
      // перемикаємо клас on
      $items.not($item).removeClass('on');
      $item.toggleClass('on');

      // ліва частина: закриваємо всі інші, відкриваємо лише активну
      $items.not($item).find('.left .drop').slideUp(500);
      $item.find('.left .drop').slideToggle(500);

      // права частина: тільки на ширині ≤1024
      if ($(window).width() <= 1024) {
        $items.not($item).find('.right .drop').slideUp(500);
        $items.not($item).find('.big_img').slideUp(500);
        $item.find('.right .drop').slideToggle(500);
        $item.find('.big_img').slideToggle(500);
      }
    });
  });
});

// висота help_ways
document.addEventListener('DOMContentLoaded', () => {
  const helpWays = document.getElementById('help_ways');
  if (!helpWays) return;

  const texts = helpWays.querySelectorAll('.item .text');

  function updateHeight() {
    if (window.innerWidth <= 1024) {
      helpWays.style.height = ''; // скидаємо, щоб працювала адаптивність
      return;
    }

    let maxBottom = 0;
    const helpWaysTop = helpWays.getBoundingClientRect().top;

    texts.forEach(text => {
      const rect = text.getBoundingClientRect();
      const bottom = rect.bottom - helpWaysTop;
      if (bottom > maxBottom) {
        maxBottom = bottom;
      }
    });

    helpWays.style.height = maxBottom + 'px';
  }

  // виклик при завантаженні
  updateHeight();

  // виклик при зміні розміру вікна
  window.addEventListener('resize', updateHeight);
});

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
$(document).ready(function () {
  const $slider = $('#projects_slider .slider');
  const $progressSpan = $('#projects_slider .progress span');

  // Ініціалізація slick
  $slider.slick({
    dots: false,
    arrows: true,
    slidesToShow: 1,
    slidesToScroll: 1,
    touchThreshold: 100,
    swipeToSlide: true,
    infinite: true,
    variableWidth: true,
    prevArrow: $('#projects_slider .slider_control button:first-of-type'),
    nextArrow: $('#projects_slider .slider_control button:last-of-type'),
  });

  // Рахуємо тільки оригінальні слайди
  const total = $slider.find('.slick-slide').not('.slick-cloned').length;

  function updateProgress(currentIndex) {
    const percent = ((currentIndex + 1) / total) * 100;
    $progressSpan.css('width', percent + '%');
  }

  // Початкове значення
  updateProgress($slider.slick('slickCurrentSlide'));

  // Оновлення після зміни слайду
  $slider.on('afterChange', function (event, slick, currentSlide) {
    updateProgress(currentSlide);
  });
});








