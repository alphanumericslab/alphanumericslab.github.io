/* Explicit theme control; no cookies, storage, or external dependencies. */
(function () {
  const root = document.documentElement;
  const button = document.getElementById('package-theme');
  function setDark(dark) {
    if (dark) root.setAttribute('data-theme', 'dark');
    else root.removeAttribute('data-theme');
    button.setAttribute('aria-pressed', String(dark));
    button.textContent = dark ? 'Light theme' : 'Dark theme';
  }
  setDark(window.matchMedia('(prefers-color-scheme: dark)').matches);
  button.addEventListener('click', function () {
    setDark(root.getAttribute('data-theme') !== 'dark');
  });
}());
