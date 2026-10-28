'use strict';



// element toggle function
const elementToggleFunc = function (elem) { elem.classList.toggle("active"); }



// sidebar variables
const sidebar = document.querySelector("[data-sidebar]");
const sidebarBtn = document.querySelector("[data-sidebar-btn]");

// sidebar toggle functionality for mobile
sidebarBtn.addEventListener("click", function () { elementToggleFunc(sidebar); });



// custom select variables
const select = document.querySelector("[data-select]");
const selectItems = document.querySelectorAll("[data-select-item]");
const selectValue = document.querySelector("[data-selecct-value]");
const filterBtn = document.querySelectorAll("[data-filter-btn]");

select.addEventListener("click", function () { elementToggleFunc(this); });

// add event in all select items
for (let i = 0; i < selectItems.length; i++) {
  selectItems[i].addEventListener("click", function () {

    let selectedValue = this.innerText.toLowerCase();
    selectValue.innerText = this.innerText;
    elementToggleFunc(select);
    filterFunc(selectedValue);

  });
}

// filter variables
const filterItems = document.querySelectorAll("[data-filter-item]");

const filterFunc = function (selectedValue) {

  for (let i = 0; i < filterItems.length; i++) {

    if (selectedValue === "all") {
      filterItems[i].classList.add("active");
    } else if (selectedValue === filterItems[i].dataset.category) {
      filterItems[i].classList.add("active");
    } else {
      filterItems[i].classList.remove("active");
    }

  }

}

// add event in all filter button items for large screen
let lastClickedBtn = filterBtn[0];

for (let i = 0; i < filterBtn.length; i++) {

  filterBtn[i].addEventListener("click", function () {

    let selectedValue = this.innerText.toLowerCase();
    selectValue.innerText = this.innerText;
    filterFunc(selectedValue);

    lastClickedBtn.classList.remove("active");
    this.classList.add("active");
    lastClickedBtn = this;

  });

}



// contact form variables
const form = document.querySelector("[data-form]");
const formInputs = document.querySelectorAll("[data-form-input]");
const formBtn = document.querySelector("[data-form-btn]");

// add event to all form input field
for (let i = 0; i < formInputs.length; i++) {
  formInputs[i].addEventListener("input", function () {

    // check form validation
    if (form.checkValidity()) {
      formBtn.removeAttribute("disabled");
    } else {
      formBtn.setAttribute("disabled", "");
    }

  });
}

// handle form submission with client-side redirect
form.addEventListener("submit", async function (e) {
  e.preventDefault();

  const data = new FormData(form);

  try {
    await fetch(form.action, {
      method: "POST",
      body: data,
    });
  } catch {
    // proceed even if fetch fails
  }

  window.location.href = "./pages/thank-you.html";
});




// page navigation variables
const navigationLinks = document.querySelectorAll("[data-nav-link]");
const pages = document.querySelectorAll("[data-page]");

// add event to all nav link
for (let i = 0; i < navigationLinks.length; i++) {
  navigationLinks[i].addEventListener("click", function (e) {

    // clicks on the tab you're already on feed the easter egg (three opens that page's game)
    if (this.classList.contains("active")) {
      e.sceneToggle = true;
      if (window.sceneMode) window.sceneMode.tabClick(this);
      return;
    }
    if (window.sceneMode) {
      window.sceneMode.exit();
      window.sceneMode.resetTaps();
    }

    for (let i = 0; i < pages.length; i++) {
      if (this.innerHTML.toLowerCase() === pages[i].dataset.page) {
        pages[i].classList.add("active");
        navigationLinks[i].classList.add("active");
        window.scrollTo(0, 0);
      } else {
        pages[i].classList.remove("active");
        navigationLinks[i].classList.remove("active");
      }
    }

    // swap the animated background and the music to match the page
    const page = this.innerHTML.toLowerCase();
    if (window.asciiBackground) window.asciiBackground.setScene(page);
    if (window.portfolioMusic) window.portfolioMusic.setSong(page);

  });
}


// skill values are self-assessed and only meaningful relative to each other,
// so the labels show a tier instead of a raw percentage
function skillTier(value) {
  if (value >= 75) return 'Core strength';
  if (value >= 65) return 'Strong';
  return 'Collaborative';
}

// skills radar chart. Wide screens: labels sit around the chart and fill a reading panel beside it.
// Phones and tablets: the chart stays compact (names only) and a tappable list below carries the detail.
class SkillsPentagon {
  constructor(canvasId, labelsId, dataElementId, explanationId, listId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.labelsContainer = document.getElementById(labelsId);
    this.explanationBox = document.getElementById(explanationId);
    this.list = document.getElementById(listId);
    this.skills = JSON.parse(document.getElementById(dataElementId).dataset.skills || '[]');
    this.compactQuery = window.matchMedia('(max-width: 767px)');
    this.activeSkill = null;

    this.buildList();
    this.renderPanel();
    this.setupEventListeners();

    // redraw whenever the chart's box changes size
    new ResizeObserver(entries => {
      for (const entry of entries) this.resizeCanvas(entry.contentRect);
    }).observe(this.canvas.parentElement);
  }

  get compact() { return this.compactQuery.matches; }

  angle(i) { return (Math.PI * 2 * i / this.skills.length) - Math.PI / 2; }

  point(i, r) {
    const a = this.angle(i);
    return [this.centerX + r * Math.cos(a), this.centerY + r * Math.sin(a)];
  }

  resizeCanvas(rect) {
    if (!rect.width) return;

    // back the canvas with device pixels so lines stay crisp on phones
    const dpr = window.devicePixelRatio || 1;
    this.width = rect.width;
    this.height = rect.height;
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // size the pentagon to leave a fixed column beside the side corners and a band above
    // and below for the labels; a pentagon is 1.81 radii tall and 1.9 wide
    this.sideRoom = this.compact ? 90 : 124;
    const bandRoom = this.compact ? 26 : 44;
    this.radius = Math.min((this.width / 2 - this.sideRoom) / 0.951, (this.height - 2 * bandRoom) / 1.809);
    this.centerX = this.width / 2;
    // its bottom points sit higher than its top one, so nudge it down to look centred
    this.centerY = this.height / 2 + this.radius * 0.0955;

    this.draw();
    this.addSkillLabels();
  }

  draw() {
    const ctx = this.ctx, n = this.skills.length, levels = 5;
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';

    for (let l = 1; l <= levels; l++) {
      ctx.beginPath();
      for (let i = 0; i < n; i++) ctx.lineTo(...this.point(i, this.radius / levels * l));
      ctx.closePath();
      ctx.stroke();
    }

    for (let i = 0; i < n; i++) {
      ctx.beginPath();
      ctx.moveTo(this.centerX, this.centerY);
      ctx.lineTo(...this.point(i, this.radius));
      ctx.stroke();
    }

    ctx.beginPath();
    this.skills.forEach((s, i) => ctx.lineTo(...this.point(i, this.radius * s.value / 100)));
    ctx.closePath();
    ctx.fillStyle = 'rgba(255, 215, 0, 0.3)';
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.7)';
    ctx.lineWidth = this.compact ? 2 : 3;
    ctx.fill();
    ctx.stroke();

    // a dot on each skill's value, bigger on the one being read
    this.skills.forEach((s, i) => {
      const active = i === this.activeSkill;
      ctx.beginPath();
      ctx.arc(...this.point(i, this.radius * s.value / 100), active ? 5 : 3, 0, Math.PI * 2);
      ctx.fillStyle = active ? 'hsl(45, 100%, 72%)' : 'rgba(255, 215, 0, 0.9)';
      ctx.fill();
    });
  }

  addSkillLabels() {
    this.labelsContainer.replaceChildren();
    const gap = this.compact ? 8 : 12;

    this.skills.forEach((skill, index) => {
      const label = document.createElement('button');
      label.type = 'button';
      label.className = 'skill-label';
      label.dataset.skillIndex = index;
      label.innerHTML = this.compact
        ? skill.name
        : `${skill.name}<span class="skill-percentage">${skillTier(skill.value)}</span>`;

      // place each label just outside its corner: side labels grow outward from it,
      // top and bottom labels sit centred above or below it
      const [x, y] = this.point(index, this.radius);
      const cos = Math.cos(this.angle(index)), sin = Math.sin(this.angle(index));
      const side = Math.abs(cos) > 0.8 ? (cos > 0 ? 'right' : 'left') : null;
      const width = side ? this.sideRoom - gap : (this.compact ? 110 : 140);
      label.style.width = `${width}px`;
      if (side) label.style.textAlign = side === 'right' ? 'left' : 'right';
      this.labelsContainer.appendChild(label);

      const h = label.offsetHeight;
      let left, top;
      if (side === 'right') { left = x + gap; top = y - h / 2; }
      else if (side === 'left') { left = x - gap - width; top = y - h / 2; }
      else { left = x - width / 2; top = sin < 0 ? y - gap - h : y + gap / 2; }

      // keep every label inside the box so nothing is clipped at the screen edge
      label.style.left = `${Math.max(0, Math.min(this.width - width, left))}px`;
      label.style.top = `${Math.max(0, Math.min(this.height - h, top))}px`;
    });
    this.markActive();
  }

  buildList() {
    if (!this.list) return;
    this.list.innerHTML = this.skills.map((s, i) => `
      <li class="skill-row" data-skill-index="${i}">
        <button class="skill-row-head" type="button" aria-expanded="false" aria-controls="skill-detail-${i}">
          <span class="skill-row-name">${s.name}</span>
          <span class="skill-row-tier">${skillTier(s.value)}</span>
          <ion-icon name="chevron-down" aria-hidden="true"></ion-icon>
        </button>
        <div class="skill-row-detail" id="skill-detail-${i}" hidden>
          <p>${s.description}</p>
          ${s.evidence ? `<p class="skill-explanation-evidence">${s.evidence}</p>` : ''}
        </div>
      </li>`).join('');
  }

  markActive() {
    this.labelsContainer.querySelectorAll('.skill-label').forEach(l =>
      l.classList.toggle('active', +l.dataset.skillIndex === this.activeSkill));
    if (!this.list) return;
    this.list.querySelectorAll('.skill-row').forEach(row => {
      const open = +row.dataset.skillIndex === this.activeSkill;
      row.classList.toggle('open', open);
      row.querySelector('.skill-row-head').setAttribute('aria-expanded', open);
      row.querySelector('.skill-row-detail').hidden = !open;
    });
  }

  select(index) {
    this.activeSkill = this.activeSkill === index ? null : index;
    this.draw();
    this.markActive();
    this.renderPanel();
  }

  renderPanel() {
    const skill = this.skills[this.activeSkill];
    this.explanationBox.classList.toggle('visible', !!skill);
    this.explanationBox.innerHTML = skill ? `
      <div class="skill-explanation-title">${skill.name} · ${skillTier(skill.value)}</div>
      <div>${skill.description}</div>
      ${skill.evidence ? `<div class="skill-explanation-evidence">${skill.evidence}</div>` : ''}
    ` : '<p class="skill-explanation-hint">Select a skill on the chart to see what it covers and what backs it up.</p>';
  }

  setupEventListeners() {
    this.labelsContainer.addEventListener('click', (e) => {
      const label = e.target.closest('.skill-label');
      if (!label) return;
      const index = +label.dataset.skillIndex;
      this.select(index);

      // phones and tablets: bring the opened row in the list below into view
      const row = this.compact && this.list && this.list.querySelector(`[data-skill-index="${index}"]`);
      if (row && this.activeSkill === index) row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });

    if (this.list) {
      this.list.addEventListener('click', (e) => {
        const row = e.target.closest('.skill-row-head');
        if (row) this.select(+row.parentElement.dataset.skillIndex);
      });
    }
  }
}

// Initialize the pentagon
document.addEventListener('DOMContentLoaded', function() {
  new SkillsPentagon('skillsPentagon', 'skillLabels', 'skillsData', 'skillExplanation', 'skillList');
});
