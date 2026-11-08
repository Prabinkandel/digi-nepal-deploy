/* ==========================================================================
   Digi Nepal — Theme engine (theme.js)
   Companion to the inline pre-paint snippet in each page's <head>, which
   sets <html data-theme> from localStorage before CSS paints (no flash).

   This file only wires the .theme-toggle buttons: click flips the theme,
   updates <html data-theme>, persists the choice to localStorage
   ('dn-theme'), and keeps the button's aria-label / aria-pressed in sync.
   Icon visibility (sun in dark mode, moon in light mode) is pure CSS in
   theme.css, driven by the same data-theme attribute.

   Dependency-free and defensive: safe if localStorage is unavailable
   (private mode, blocked storage) and safe on pages whose DOM differs
   (storefront, content pages, admin panel).
   ========================================================================== */
(function () {
  'use strict';

  var STORAGE_KEY = 'dn-theme';
  var root = document.documentElement;

  function storedTheme() {
    try {
      var t = localStorage.getItem(STORAGE_KEY);
      return t === 'light' || t === 'dark' ? t : null;
    } catch (e) {
      return null;
    }
  }

  function currentTheme() {
    return root.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  }

  function saveTheme(theme) {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (e) {
      /* Storage unavailable: theme still applies for this page view. */
    }
  }

  function syncButtons(theme) {
    var label = theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme';
    var buttons = document.querySelectorAll('.theme-toggle');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].setAttribute('aria-label', label);
      buttons[i].setAttribute('aria-pressed', theme === 'light' ? 'true' : 'false');
    }
  }

  function syncThemeColor(theme) {
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'light' ? '#f6f6f8' : '#050505');
  }

  function applyTheme(theme) {
    root.setAttribute('data-theme', theme);
    syncButtons(theme);
    syncThemeColor(theme);
  }

  function toggleTheme() {
    var next = currentTheme() === 'light' ? 'dark' : 'light';
    applyTheme(next);
    saveTheme(next);
  }

  function init() {
    /* The inline snippet normally set data-theme already; fall back to the
       stored value, then to the dark default, so the attribute is always
       present and consistent before we wire the buttons. */
    if (!root.getAttribute('data-theme')) {
      root.setAttribute('data-theme', storedTheme() || 'dark');
    }
    applyTheme(currentTheme());

    var buttons = document.querySelectorAll('.theme-toggle');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].addEventListener('click', toggleTheme);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
