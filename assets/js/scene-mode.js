'use strict';

/**
 * Scene mode: clicking the current page's tab again clears the panels away and
 * turns the background into that page's mini-game. Clicking it again, pressing
 * Escape, using "Back to page" or switching pages brings everything back.
 */
(function () {

  const HINT_KEY = 'portfolio-scene-hint';
  const BEST_KEY = 'portfolio-scene-best';

  const bg = window.asciiBackground;
  const hud = document.querySelector('[data-scene-hud]');
  if (!bg || !hud) return;

  const title = hud.querySelector('[data-hud-title]');
  const howTo = hud.querySelector('[data-hud-hint]');
  const scoreEl = hud.querySelector('[data-hud-score]');
  const unitEl = hud.querySelector('[data-hud-unit]');
  const bestEl = hud.querySelector('[data-hud-best]');
  const back = hud.querySelector('[data-scene-exit]');
  const flashEl = document.querySelector('[data-scene-flash]');
  const hint = document.querySelector('[data-scene-hint]');
  const panels = () => document.querySelectorAll('.sidebar, article[data-page]');
  const sound = (name, opts) => { if (window.portfolioMusic) window.portfolioMusic.sfx(name, opts); };

  let active = false, page = null, flashTimer = 0;

  function readBest() {
    try { return JSON.parse(localStorage.getItem(BEST_KEY)) || {}; } catch (e) { return {}; }
  }

  function writeBest(all) {
    try { localStorage.setItem(BEST_KEY, JSON.stringify(all)); } catch (e) { /* storage unavailable */ }
  }

  const best = readBest();

  function currentPage() {
    const a = document.querySelector('article.active[data-page]');
    return a ? a.dataset.page : 'about';
  }

  function renderScore(value) {
    const info = bg.toyInfo(page);
    scoreEl.textContent = value;
    unitEl.textContent = info.unit;
    bestEl.textContent = best[page] ? `best ${best[page]}` : '';
  }

  function flash(text) {
    flashEl.textContent = text;
    flashEl.classList.remove('is-showing');
    void flashEl.offsetWidth;   // restart the animation
    flashEl.classList.add('is-showing');
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => flashEl.classList.remove('is-showing'), 1900);
  }

  bg.onToy = (e) => {
    if (!active) return;
    if (e.type === 'flash') flash(e.text);
    if (e.type === 'score') {
      if (e.value > (best[page] || 0)) {
        const first = !best[page];
        best[page] = e.value;
        writeBest(best);
        if (!first && e.value > 1) hud.classList.add('is-record');
      }
      renderScore(e.value);
    }
  };

  function enter() {
    if (active) return;
    active = true;
    page = currentPage();
    const info = bg.toyInfo(page);
    window.scrollTo(0, 0);

    title.textContent = info.title;
    howTo.textContent = info.hint;
    back.textContent = `Back to ${page.charAt(0).toUpperCase() + page.slice(1)}`;
    hud.classList.remove('is-record');
    renderScore(0);
    hud.hidden = false;

    document.body.classList.add('scene-mode');
    panels().forEach((p) => { p.inert = true; });
    updateTabTitles();
    dismissHint(true);
    bg.setPlay(true);
    sound('swoosh', { up: false });
  }

  function exit() {
    if (!active) return;
    active = false;
    bg.setPlay(false);
    document.body.classList.remove('scene-mode');
    panels().forEach((p) => { p.inert = false; });
    flashEl.classList.remove('is-showing');
    updateTabTitles();
    sound('swoosh', { up: true });
    // let the HUD fade before hiding it from assistive tech
    setTimeout(() => { if (!active) hud.hidden = true; }, 350);
  }

  function toggle() {
    if (active) exit(); else enter();
  }

  // the active tab says what clicking it again will do
  function updateTabTitles() {
    setTimeout(() => {
      document.querySelectorAll('[data-nav-link]').forEach((link) => {
        const on = link.classList.contains('active');
        link.title = on ? (active ? 'Back to the page' : 'Click again to play with the scene') : '';
        if (on) link.setAttribute('aria-pressed', String(active)); else link.removeAttribute('aria-pressed');
      });
    });
  }

  back.addEventListener('click', exit);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') exit(); });
  document.querySelectorAll('[data-nav-link]').forEach((link) => link.addEventListener('click', updateTabTitles));
  updateTabTitles();



  // a one-time nudge so visitors discover the games

  function dismissHint(remember) {
    if (!hint || hint.hidden) {
      if (remember) seen();
      return;
    }
    hint.classList.remove('is-showing');
    setTimeout(() => { hint.hidden = true; }, 400);
    if (remember) seen();
  }

  function seen() {
    try { localStorage.setItem(HINT_KEY, '1'); } catch (e) { /* storage unavailable */ }
  }

  function hintSeen() {
    try { return localStorage.getItem(HINT_KEY) === '1'; } catch (e) { return true; }
  }

  if (hint && !hintSeen()) {
    setTimeout(() => {
      if (active || hintSeen()) return;
      hint.querySelector('[data-hint-page]').textContent = currentPage().charAt(0).toUpperCase() + currentPage().slice(1);
      hint.hidden = false;
      requestAnimationFrame(() => hint.classList.add('is-showing'));
      setTimeout(() => dismissHint(true), 9000);
    }, 6000);
    hint.addEventListener('click', () => dismissHint(true));
  }

  window.sceneMode = { enter, exit, toggle, get active() { return active; } };

})();
