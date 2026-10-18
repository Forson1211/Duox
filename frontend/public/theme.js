try {
  var media = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
  if (media) {
    var applyTheme = function(e) {
      var isDark = typeof e.matches === 'boolean' ? e.matches : media.matches;
      document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
    };
    applyTheme(media);
    if (media.addEventListener) {
      media.addEventListener('change', applyTheme);
    } else if (media.addListener) {
      media.addListener(applyTheme);
    }
  }
  localStorage.removeItem('duo-theme');
} catch (_) {
  document.documentElement.dataset.theme = 'light';
}
