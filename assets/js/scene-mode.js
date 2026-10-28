'use strict';

/**
 * Easter eggs: clicking the current page's tab five times in quick succession
 * clears the page away and drops the visitor straight into that background's
 * mini-game. One more click on the tab, Escape, or switching pages brings it back.
 *
 * Scores are lifetime totals that only ever go up, kept per game in localStorage.
 */
(function () {

  const TOTALS_KEY = 'portfolio-game-totals';
  const EGGS_KEY = 'portfolio-eggs-found';
  const PAGES = ['about', 'resume', 'portfolio', 'contact'];
  const TAPS = 5;            // clicks on the current tab that open its game
  const TAP_GAP = 800;       // ms allowed between those clicks
  const MILESTONES = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000];

  const bg = window.asciiBackground;
  const layer = document.querySelector('[data-game-layer]');
  if (!bg || !layer) return;

  const scoreEl = layer.querySelector('[data-game-score]');
  const unitEl = layer.querySelector('[data-game-unit]');
  const multEl = layer.querySelector('[data-game-mult]');
  const returnEl = layer.querySelector('[data-game-return]');
  const card = layer.querySelector('[data-game-card]');
  const flashEl = document.querySelector('[data-scene-flash]');
  const floaters = document.querySelector('[data-game-floaters]');
  const notice = document.querySelector('[data-egg-notice]');

  const touch = window.matchMedia('(pointer: coarse)').matches;
  const verb = touch ? 'tap' : 'click';
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const fmt = (n) => n.toLocaleString();
  const panels = () => document.querySelectorAll('.sidebar, article[data-page]');
  const music = () => window.portfolioMusic;
  const sound = (name, opts) => { if (music()) music().sfx(name, opts); };

  function load(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (e) { return fallback; }
  }

  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage unavailable */ }
  }

  const totals = load(TOTALS_KEY, {});
  const found = new Set(load(EGGS_KEY, []));

  let active = false, page = null, enteredAt = 0;
  let shown = 0, saveTimer = 0, flashTimer = 0, cardTimer = 0, tween = 0;

  function currentPage() {
    const a = document.querySelector('article.active[data-page]');
    return a ? a.dataset.page : 'about';
  }



  // the big number: counts up towards the total rather than jumping

  function renderScore() {
    scoreEl.textContent = fmt(shown);
  }

  function countUp() {
    const target = totals[page] || 0;
    if (shown < target) {
      shown += Math.max(1, Math.ceil((target - shown) * 0.18));
      if (shown > target) shown = target;
      renderScore();
      tween = requestAnimationFrame(countUp);
    } else {
      tween = 0;
    }
  }

  function pop() {
    scoreEl.classList.remove('is-popping');
    void scoreEl.offsetWidth;
    scoreEl.classList.add('is-popping');
  }

  // a "+N" rising from wherever the points were earned
  function floater(value, x, y) {
    if (floaters.childElementCount > 40) floaters.firstElementChild.remove();
    const el = document.createElement('span');
    el.className = 'game-float' + (value >= 10 ? ' is-huge' : value >= 3 ? ' is-big' : '');
    el.textContent = `+${fmt(value)}`;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    floaters.appendChild(el);
    setTimeout(() => el.remove(), 1300);
  }

  function flash(text) {
    flashEl.textContent = text;
    flashEl.classList.remove('is-showing');
    void flashEl.offsetWidth;
    flashEl.classList.add('is-showing');
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => flashEl.classList.remove('is-showing'), 1900);
  }

  function gain(value, x, y) {
    const before = totals[page] || 0, after = before + value;
    totals[page] = after;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => save(TOTALS_KEY, totals), 400);

    floater(value, x, y);
    pop();
    if (!tween) tween = requestAnimationFrame(countUp);

    // crossing a milestone gets a celebration
    let m = MILESTONES.find((n) => before < n && after >= n);
    if (!m && after >= 100000 && Math.floor(before / 100000) < Math.floor(after / 100000)) m = Math.floor(after / 100000) * 100000;
    if (m) {
      flash(`${fmt(m)} ${bg.toyInfo(page).unit}!`);
      scoreEl.classList.add('is-milestone');
      setTimeout(() => scoreEl.classList.remove('is-milestone'), 1200);
      const key = music() ? music().keyNotes(page) : null;
      if (key) sound('chime', { notes: [key[0] + 12, key[2] + 12, key[4] + 12, key[0] + 24], gap: 0.08, vol: 0.08, decay: 1.8, verb: 0.5 });
    }
  }

  bg.onToy = (e) => {
    if (!active) return;
    if (e.type === 'gain') gain(e.value, e.x, e.y);
    else if (e.type === 'mult') {
      multEl.textContent = `×${e.value}`;
      multEl.classList.toggle('is-on', e.value > 1);
    } else if (e.type === 'flash') flash(e.text);
  };



  // getting in and out

  function enter() {
    if (active) return;
    active = true;
    enteredAt = performance.now();
    page = currentPage();
    const info = bg.toyInfo(page);
    window.scrollTo(0, 0);

    const isNew = !found.has(page);
    if (isNew) { found.add(page); save(EGGS_KEY, [...found]); }

    shown = totals[page] || 0;
    renderScore();
    unitEl.textContent = info.unit;
    multEl.classList.remove('is-on');
    returnEl.innerHTML = touch
      ? `Tap <strong>${cap(page)}</strong> to return`
      : `Click <strong>${cap(page)}</strong> or press Esc to return`;

    card.querySelector('[data-game-egg]').textContent = isNew
      ? `easter egg found · ${found.size} of ${PAGES.length}`
      : `easter egg ${found.size} of ${PAGES.length}`;
    card.querySelector('[data-game-title]').textContent = info.title;
    card.querySelector('[data-game-hint]').textContent = info.hint;
    card.classList.remove('is-showing');
    void card.offsetWidth;
    card.classList.add('is-showing');
    clearTimeout(cardTimer);
    cardTimer = setTimeout(() => card.classList.remove('is-showing'), 3600);
    if (isNew && found.size === PAGES.length) setTimeout(() => { if (active) flash('all 4 easter eggs found!'); }, 3800);

    layer.hidden = false;
    document.body.classList.add('scene-mode');
    panels().forEach((p) => { p.inert = true; });
    hideNotice();

    if (music()) music().startForGame(page);
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
    card.classList.remove('is-showing');
    floaters.textContent = '';
    clearTimeout(saveTimer);
    save(TOTALS_KEY, totals);
    sound('swoosh', { up: true });
    if (music()) music().endGame();
    setTimeout(() => { if (!active) layer.hidden = true; }, 350);
  }

  // clicks on the current page's tab: five quick ones open the game, one closes it
  let taps = 0, lastTap = 0;

  function tabClick(link) {
    const now = performance.now();
    if (active) {
      // ignore the tail of the burst of clicks that opened the game
      if (now - enteredAt > 600) exit();
      return;
    }
    taps = now - lastTap < TAP_GAP ? taps + 1 : 1;
    lastTap = now;
    link.classList.remove('is-charging');
    void link.offsetWidth;
    link.classList.add('is-charging');
    if (taps >= TAPS) {
      taps = 0;
      enter();
    } else {
      sound('select');
    }
  }

  function resetTaps() { taps = 0; }

  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') exit(); });



  // the notification: slides in on load on wide screens; on narrower ones, where it would
  // cover the header, it waits inside the sidebar until the visitor opens the contacts dropdown

  let noticeTimer = 0;
  const sidebar = document.querySelector('[data-sidebar]');
  const sidebarBtn = document.querySelector('[data-sidebar-btn]');
  const inDropdown = window.matchMedia('(max-width: 1249px)').matches && sidebar && sidebarBtn;

  function showNotice() {
    notice.hidden = false;
    requestAnimationFrame(() => notice.classList.add('is-showing'));
    noticeTimer = setTimeout(hideNotice, 12000);
  }

  function hideNotice() {
    if (!notice || notice.hidden) return;
    notice.classList.remove('is-showing');
    clearTimeout(noticeTimer);
    setTimeout(() => {
      notice.hidden = true;
      if (sidebar) sidebar.classList.remove('has-notice');
    }, 450);
  }

  if (notice) {
    const text = notice.querySelector('[data-egg-text]');
    const left = PAGES.length - found.size;
    if (found.size === 0) {
      text.innerHTML = `Psst… ${verb} <strong>${cap(currentPage())}</strong> ${TAPS} times to uncover a hidden easter egg. ` +
        `I've tucked 3 more away. Can you find them all? 😉`;
    } else if (left > 0) {
      text.innerHTML = `Welcome back! You've found <strong>${found.size} of ${PAGES.length}</strong> easter eggs. ` +
        `Keep hunting down ${left === 1 ? 'the last one' : `the other ${left}`} 😉`;
    } else {
      text.innerHTML = `All <strong>${PAGES.length}</strong> easter eggs found, nicely done! ` +
        `${cap(verb)} any tab ${TAPS} times to jump back in and keep your scores climbing 😉`;
    }
    notice.querySelector('[data-egg-close]').addEventListener('click', hideNotice);
    if (inDropdown) {
      notice.classList.add('is-inline');
      sidebar.querySelector('.contacts-list').before(notice);
      // script.js toggles the dropdown after this listener runs, so check on the next tick
      sidebarBtn.addEventListener('click', function reveal() {
        setTimeout(() => {
          if (!sidebar.classList.contains('active') || active) return;
          sidebarBtn.removeEventListener('click', reveal);
          sidebar.classList.add('has-notice');
          showNotice();
        });
      });
    } else {
      setTimeout(() => { if (!active) showNotice(); }, 1200);
    }
  }

  window.sceneMode = { enter, exit, tabClick, resetTaps, get active() { return active; } };

})();
