/**
     * Завантажує HTML-файл із теки components і вставляє його в DOM
     * @param {string} fileName - Назва файлу без розширення (наприклад, 'header')
     * @param {string} targetSelector - CSS-селектор елемента, куди вставити код
     */
async function loadComponent(fileName, targetSelector) {
  try {
    const response = await fetch(`./components/${fileName}.html`);
    if (!response.ok) throw new Error(`Файл ${fileName}.html не знайдено`);

    const htmlText = await response.text();
    document.querySelector(targetSelector).innerHTML = htmlText;
  } catch (error) {
    console.error(`❌ Помилка при завантаженні компонента "${fileName}":`, error);
  }
}

// 🔧 Виклики функції
// loadComponent('header', '#header-placeholder');
// loadComponent('footer', '#footer-placeholder');
// Можеш додати loadComponent('sidebar', '#sidebar-placeholder') і т.д.
