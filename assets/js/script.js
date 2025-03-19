'use strict';



// element toggle function
const elementToggleFunc = function (elem) { elem.classList.toggle("active"); }



// sidebar variables
const sidebar = document.querySelector("[data-sidebar]");
const sidebarBtn = document.querySelector("[data-sidebar-btn]");

// sidebar toggle functionality for mobile
sidebarBtn.addEventListener("click", function () { elementToggleFunc(sidebar); });



// testimonials variables
const testimonialsItem = document.querySelectorAll("[data-testimonials-item]");
const modalContainer = document.querySelector("[data-modal-container]");
const modalCloseBtn = document.querySelector("[data-modal-close-btn]");
const overlay = document.querySelector("[data-overlay]");

// modal variable
const modalImg = document.querySelector("[data-modal-img]");
const modalTitle = document.querySelector("[data-modal-title]");
const modalText = document.querySelector("[data-modal-text]");

// modal toggle function
const testimonialsModalFunc = function () {
  modalContainer.classList.toggle("active");
  overlay.classList.toggle("active");
}

// add click event to all modal items
for (let i = 0; i < testimonialsItem.length; i++) {

  testimonialsItem[i].addEventListener("click", function () {

    modalImg.src = this.querySelector("[data-testimonials-avatar]").src;
    modalImg.alt = this.querySelector("[data-testimonials-avatar]").alt;
    modalTitle.innerHTML = this.querySelector("[data-testimonials-title]").innerHTML;
    modalText.innerHTML = this.querySelector("[data-testimonials-text]").innerHTML;

    testimonialsModalFunc();

  });

}

// add click event to modal close button, uncomment to use Testimonials Modal

modalCloseBtn.addEventListener("click", testimonialsModalFunc);
overlay.addEventListener("click", testimonialsModalFunc);



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



// page navigation variables
const navigationLinks = document.querySelectorAll("[data-nav-link]");
const pages = document.querySelectorAll("[data-page]");

// add event to all nav link
for (let i = 0; i < navigationLinks.length; i++) {
  navigationLinks[i].addEventListener("click", function () {

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

  });
}


// JavaScript class with responsiveness functionality
class SkillsPentagon {
  constructor(canvasId, labelsId, dataElementId, explanationId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.labelsContainer = document.getElementById(labelsId);
    this.explanationBox = document.getElementById(explanationId);
    
    // Get skills from the data element
    const dataElement = document.getElementById(dataElementId);
    this.skills = JSON.parse(dataElement.dataset.skills || '[]');
    
    // Setup resize observer for canvas
    this.resizeObserver = new ResizeObserver(entries => {
      for (let entry of entries) {
        this.resizeCanvas(entry.contentRect);
      }
    });
    
    // Initialize responsive canvas
    this.resizeObserver.observe(this.canvas.parentElement);
    
    // Track active skill explanation
    this.activeSkill = null;
    
    this.init();
  }
  
  init() {
    this.setupEventListeners();
  }
  
  resizeCanvas(rect) {
    // Clear previous content
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Update canvas size
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
    
    // Update center and radius
    this.centerX = this.canvas.width / 2;
    this.centerY = this.canvas.height / 2;
    this.radius = Math.min(this.centerX, this.centerY) * 0.8;
    
    // Clear and redraw everything
    this.clearLabels();
    this.drawPentagonGrid();
    this.drawSkillsPentagon();
    this.addSkillLabels();
    
    // Hide explanation box when resizing
    this.explanationBox.classList.remove('visible');
    this.activeSkill = null;
  }
  
  clearLabels() {
    // Remove all existing labels
    while (this.labelsContainer.firstChild) {
      this.labelsContainer.removeChild(this.labelsContainer.firstChild);
    }
  }
  
  drawPentagonGrid() {
    const levels = 5;
    
    for (let i = 1; i <= levels; i++) {
      this.ctx.beginPath();
      const levelRadius = (this.radius / levels) * i;
      
      for (let j = 0; j < this.skills.length; j++) {
        const angle = (Math.PI * 2 * j / this.skills.length) - Math.PI / 2;
        const x = this.centerX + levelRadius * Math.cos(angle);
        const y = this.centerY + levelRadius * Math.sin(angle);
        
        if (j === 0) {
          this.ctx.moveTo(x, y);
        } else {
          this.ctx.lineTo(x, y);
        }
      }
      
      // Close the path
      const firstAngle = -Math.PI / 2;
      this.ctx.lineTo(
        this.centerX + levelRadius * Math.cos(firstAngle), 
        this.centerY + levelRadius * Math.sin(firstAngle)
      );
      
      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      this.ctx.stroke();
    }
    
    // Draw connecting lines from center to vertices
    for (let j = 0; j < this.skills.length; j++) {
      const angle = (Math.PI * 2 * j / this.skills.length) - Math.PI / 2;
      const x = this.centerX + this.radius * Math.cos(angle);
      const y = this.centerY + this.radius * Math.sin(angle);
      
      this.ctx.beginPath();
      this.ctx.moveTo(this.centerX, this.centerY);
      this.ctx.lineTo(x, y);
      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      this.ctx.stroke();
    }
  }
  
  drawSkillsPentagon() {
    this.ctx.beginPath();
    
    for (let i = 0; i < this.skills.length; i++) {
      const angle = (Math.PI * 2 * i / this.skills.length) - Math.PI / 2;
      const value = this.skills[i].value / 100;
      const x = this.centerX + this.radius * value * Math.cos(angle);
      const y = this.centerY + this.radius * value * Math.sin(angle);
      
      if (i === 0) {
        this.ctx.moveTo(x, y);
      } else {
        this.ctx.lineTo(x, y);
      }
    }
    
    this.ctx.closePath();
    this.ctx.fillStyle = 'rgba(255, 215, 0, 0.3)';
    this.ctx.strokeStyle = 'rgba(255, 215, 0, 0.7)';
    this.ctx.lineWidth = 3;
    this.ctx.fill();
    this.ctx.stroke();
  }
  
  addSkillLabels() {
    const isMobile = window.innerWidth <= 480;
    const labelScaleFactor = isMobile ? 0.9 : 1.15;
    
    this.skills.forEach((skill, index) => {
      const angle = (Math.PI * 2 * index / this.skills.length) - Math.PI / 2;
      const labelDistance = this.radius * labelScaleFactor;
      const x = this.centerX + labelDistance * Math.cos(angle);
      const y = this.centerY + labelDistance * Math.sin(angle);
      
      const label = document.createElement('div');
      label.className = 'skill-label';
      label.innerHTML = `${skill.name}<span class="skill-percentage">${skill.value}%</span>`;
      label.dataset.skillIndex = index;
      
      // Calculate offset based on label width
      const labelWidth = isMobile ? 100 : 120;
      
      // Position the label
      label.style.left = `${x - labelWidth/2}px`;
      label.style.top = `${y - 20}px`;
      
      this.labelsContainer.appendChild(label);
    });
  }
  
  setupEventListeners() {
    // Click event for skill labels
    this.labelsContainer.addEventListener('click', (e) => {
      const skillLabel = e.target.closest('.skill-label');
      if (!skillLabel) return;
      
      const skillIndex = parseInt(skillLabel.dataset.skillIndex);
      const skill = this.skills[skillIndex];
      
      // Show explanation box near the clicked label
      const labelRect = skillLabel.getBoundingClientRect();
      const containerRect = this.labelsContainer.getBoundingClientRect();
      
      // Position differently based on screen size
      const isMobile = window.innerWidth <= 480;
      if (isMobile) {
        // For mobile, position at bottom of container
        this.explanationBox.style.left = '50%';
        this.explanationBox.style.top = 'auto';
        this.explanationBox.style.bottom = '-200px';
      } else {
        // Calculate position based on which side of the pentagon the label is on
        const angle = (Math.PI * 2 * skillIndex / this.skills.length) - Math.PI / 2;
        let left, top;
        
        // Position differently based on which part of the pentagon the skill is on
        if (angle >= -Math.PI/2 && angle < 0) {
          // Top right
          left = labelRect.left - containerRect.left + 160;
          top = labelRect.top - containerRect.top;
        } else if (angle >= 0 && angle < Math.PI/2) {
          // Bottom right
          left = labelRect.left - containerRect.left + 160;
          top = labelRect.top - containerRect.top - 50;
        } else if (angle >= Math.PI/2 && angle < Math.PI) {
          // Bottom left
          left = labelRect.left - containerRect.left - 260;
          top = labelRect.top - containerRect.top - 50;
        } else {
          // Top left
          left = labelRect.left - containerRect.left - 260;
          top = labelRect.top - containerRect.top;
        }
        
        // Ensure explanation stays within container bounds
        left = Math.max(20, Math.min(containerRect.width - 320, left));
        
        this.explanationBox.style.left = `${left}px`;
        this.explanationBox.style.top = `${top}px`;
      }
      
      // Set content
      this.explanationBox.innerHTML = `
        <div class="skill-explanation-title">${skill.name}</div>
        <div>${skill.description}</div>
      `;
      
      // Toggle visibility
      if (this.activeSkill === skillIndex) {
        this.explanationBox.classList.remove('visible');
        this.activeSkill = null;
      } else {
        this.explanationBox.classList.add('visible');
        this.activeSkill = skillIndex;
      }
    });
    
    // Close explanation when clicking elsewhere
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.skill-label') && !e.target.closest('.skill-explanation')) {
        this.explanationBox.classList.remove('visible');
        this.activeSkill = null;
      }
    });
    
    // Also handle window resize events
    window.addEventListener('resize', () => {
      // Hide explanation box when resizing
      this.explanationBox.classList.remove('visible');
      this.activeSkill = null;
    });
  }
}

// Initialize the pentagon
document.addEventListener('DOMContentLoaded', function() {
  new SkillsPentagon('skillsPentagon', 'skillLabels', 'skillsData', 'skillExplanation');
});