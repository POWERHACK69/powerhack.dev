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


class SkillsPentagon {
  constructor(canvasId, labelsId, dataElementId, explanationId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.labelsContainer = document.getElementById(labelsId);
    this.explanationBox = document.getElementById(explanationId);
    this.container = this.canvas.parentElement;
    
    // Get skills from the data element
    const dataElement = document.getElementById(dataElementId);
    this.skills = JSON.parse(dataElement.dataset.skills || '[]');
    
    // Track active skill explanation
    this.activeSkill = null;
    
    // Initialize and handle resize
    this.resizeCanvas();
    this.setupResizeListener();
    this.init();
  }
  
  resizeCanvas() {
    // Get container dimensions
    const containerWidth = this.container.clientWidth;
    const size = Math.min(containerWidth, window.innerHeight * 0.7);
    
    // Set canvas dimensions based on container
    this.canvas.width = size;
    this.canvas.height = size;
    
    // Update center and radius
    this.centerX = this.canvas.width / 2;
    this.centerY = this.canvas.height / 2;
    this.radius = Math.min(this.centerX, this.centerY) * 0.8;
  }
  
  setupResizeListener() {
    window.addEventListener('resize', () => {
      // Clear previous elements
      this.labelsContainer.innerHTML = '';
      
      // Resize canvas and redraw
      this.resizeCanvas();
      this.init();
      
      // Hide explanation box on resize
      this.explanationBox.classList.remove('visible');
      this.activeSkill = null;
    });
  }
  
  init() {
    this.drawPentagonGrid();
    this.drawSkillsPentagon();
    this.addSkillLabels();
    this.setupEventListeners();
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
    // Calculate responsive label size based on canvas size
    const labelWidth = Math.min(150, this.canvas.width * 0.3);
    const fontSize = Math.max(12, Math.min(16, this.canvas.width * 0.03));
    
    this.skills.forEach((skill, index) => {
      const angle = (Math.PI * 2 * index / this.skills.length) - Math.PI / 2;
      const labelDistance = this.radius * 1.15;
      const x = this.centerX + labelDistance * Math.cos(angle);
      const y = this.centerY + labelDistance * Math.sin(angle);
      
      const label = document.createElement('div');
      label.className = 'skill-label';
      label.innerHTML = `${skill.name}<span class="skill-percentage">${skill.value}%</span>`;
      label.dataset.skillIndex = index;
      
      // Position the label
      label.style.left = `${x}px`;
      label.style.top = `${y}px`;
      label.style.width = `${labelWidth}px`;
      label.style.fontSize = `${fontSize}px`;
      
      // Adjust label position based on angle to avoid cutoff
      const translateX = -labelWidth / 2;
      
      // Adjust vertical alignment based on position
      let translateY = -20;
      
      label.style.transform = `translate(${translateX}px, ${translateY}px)`;
      
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
      
      // Show explanation box
      const labelRect = skillLabel.getBoundingClientRect();
      const containerRect = this.labelsContainer.getBoundingClientRect();
      
      // Calculate position based on screen size and which side of the pentagon the label is on
      const angle = (Math.PI * 2 * skillIndex / this.skills.length) - Math.PI / 2;
      let left, top;
      
      const isMobile = window.innerWidth < 768;
      const explanationWidth = isMobile ? this.container.clientWidth * 0.8 : 300;
      
      if (isMobile) {
        // For mobile, position below the pentagon
        left = this.container.clientWidth / 2 - explanationWidth / 2;
        top = this.canvas.height + 20;
      } else {
        // For desktop, position near the clicked label
        // Position differently based on which part of the pentagon the skill is on
        if (angle >= -Math.PI/2 && angle < 0) {
          // Top right
          left = labelRect.left - containerRect.left + labelRect.width;
          top = labelRect.top - containerRect.top;
        } else if (angle >= 0 && angle < Math.PI/2) {
          // Bottom right
          left = labelRect.left - containerRect.left + labelRect.width;
          top = labelRect.top - containerRect.top - 50;
        } else if (angle >= Math.PI/2 && angle < Math.PI) {
          // Bottom left
          left = labelRect.left - containerRect.left - explanationWidth;
          top = labelRect.top - containerRect.top - 50;
        } else {
          // Top left
          left = labelRect.left - containerRect.left - explanationWidth;
          top = labelRect.top - containerRect.top;
        }
        
        // Ensure the explanation stays within container bounds
        left = Math.max(0, Math.min(left, this.container.clientWidth - explanationWidth));
      }
      
      // Set content and position
      this.explanationBox.innerHTML = `
        <div class="skill-explanation-title">${skill.name}</div>
        <div>${skill.description}</div>
      `;
      
      this.explanationBox.style.left = `${left}px`;
      this.explanationBox.style.top = `${top}px`;
      this.explanationBox.style.width = `${explanationWidth}px`;
      
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
  }
}

// Initialize the pentagon
document.addEventListener('DOMContentLoaded', function() {
  new SkillsPentagon('skillsPentagon', 'skillLabels', 'skillsData', 'skillExplanation');
});