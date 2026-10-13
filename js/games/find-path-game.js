// Find the Path Game Module — Uses custom div-based dropdowns (no native <select>)
(function() {
    'use strict';

    const findPathGame = {
        pathSequence: ['Option A', 'Alpha', 'Red', 'First', 'Win!'],
        currentStep: 0,
        attempts: 0,

        init: function() {
            console.log('Find the Path game initializing...');
            this.renderLevels();
            this.addLevelEventListeners();
        },

        renderLevels: function() {
            const container = document.getElementById('path-levels');
            if (!container) return;
            
            let html = '';
            for (let i = 0; i < 5; i++) {
                // Only show first level initially, hide others
                const displayStyle = (i === 0) ? 'block' : 'none';
                html += `
                    <div class="level-container" id="level-${i}" style="display: ${displayStyle};">
                        <h3>Level ${i + 1}</h3>
                        <div class="path-game-dropdown custom-select" data-level="${i}">
                            <div class="custom-select-trigger">Select...</div>
                            <div class="custom-select-menu"></div>
                        </div>
                        <div class="feedback" id="feedback-${i}"></div>
                    </div>
                `;
            }
            container.innerHTML = html;
            
            // Populate dropdown options after DOM is ready
            for (let i = 0; i < 5; i++) {
                this.populateDropdown(i);
            }
        },

        populateDropdown: function(levelIndex) {
            const dropdown = document.querySelector(`.path-game-dropdown[data-level="${levelIndex}"]`);
            if (!dropdown) return;
            
            const menu = dropdown.querySelector('.custom-select-menu');
            menu.innerHTML = '';
            
            // Get options for this level
            const correctAnswers = ['Option A', 'Alpha', 'Red', 'First', 'Win!'];
            const correctAnswer = correctAnswers[levelIndex];
            
            let distractors;
            switch (levelIndex) {
                case 0: distractors = ['Option B', 'Option C']; break;
                case 1: distractors = ['Beta', 'Gamma']; break;
                case 2: distractors = ['Green', 'Blue']; break;
                case 3: distractors = ['Second', 'Third']; break;
                case 4: distractors = ['Lose', 'Try Again']; break;
                default: distractors = ['Option 1', 'Option 2'];
            }
            
            // Shuffle options so correct answer isn't always first
            const allOptions = ['Select...', correctAnswer, ...distractors];
            for (let i = allOptions.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [allOptions[i], allOptions[j]] = [allOptions[j], allOptions[i]];
            }
            
            allOptions.forEach(opt => {
                const item = document.createElement('div');
                item.className = 'custom-select-item';
                item.textContent = opt;
                item.dataset.value = opt;
                
                item.addEventListener('click', (e) => {
                    e.stopPropagation();
                    dropdown.querySelector('.custom-select-trigger').textContent = opt;
                    menu.querySelectorAll('.custom-select-item').forEach(it => it.classList.remove('selected'));
                    item.classList.add('selected');
                    dropdown.classList.remove('open');
                    
                    // Trigger game logic with the selected value
                    this.handleLevelChange(dropdown, opt);
                });
                
                menu.appendChild(item);
            });
        },

        addLevelEventListeners: function() {
            const container = document.getElementById('path-levels');
            if (!container) return;

            // Close dropdown when clicking outside
            document.addEventListener('click', (e) => {
                if (!e.target.closest('.path-game-dropdown')) {
                    document.querySelectorAll('.path-game-dropdown.open').forEach(dd => dd.classList.remove('open'));
                }
            });

            // Toggle on trigger click
            container.addEventListener('click', (e) => {
                const dropdown = e.target.closest('.path-game-dropdown');
                if (dropdown && !e.target.closest('.custom-select-item')) {
                    document.querySelectorAll('.path-game-dropdown.open').forEach(dd => {
                        if (dd !== dropdown) dd.classList.remove('open');
                    });
                    dropdown.classList.toggle('open');
                }
            });

            // Escape key closes all
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    document.querySelectorAll('.path-game-dropdown.open').forEach(dd => dd.classList.remove('open'));
                }
            });
        },

        handleLevelChange: function(dropdownElement, selectedValue) {
            const level = parseInt(dropdownElement.dataset.level);
            
            // Check if the selection is correct
            if (selectedValue === this.pathSequence[level]) {
                // Correct choice - move to next step
                document.getElementById(`feedback-${level}`).innerHTML = '<span style="color: green;">✓ Correct!</span>';
                
                if (level < 4) {
                    // Move to next level
                    const nextLevel = level + 1;
                    document.getElementById(`level-${nextLevel}`).style.display = 'block';
                } else {
                    // All levels completed - show win message
                    this.showWinMessage();
                }
            } else {
                // Incorrect choice - reset progress
                document.getElementById(`feedback-${level}`).innerHTML = '<span style="color: red;">✗ Wrong! Try again.</span>';
                this.resetProgress();
            }
        },

        resetProgress: function() {
            // Reset all levels to initial state
            for (let i = 0; i < 5; i++) {
                const feedbackElement = document.getElementById(`feedback-${i}`);
                if (feedbackElement) {
                    feedbackElement.innerHTML = '';
                }
                
                const dropdownElement = document.querySelector(`#level-${i} .path-game-dropdown`);
                if (dropdownElement) {
                    dropdownElement.querySelector('.custom-select-trigger').textContent = 'Select...';
                    dropdownElement.querySelectorAll('.custom-select-item').forEach(item => item.classList.remove('selected'));
                }
                
                const levelElement = document.getElementById(`level-${i}`);
                if (levelElement && i > 0) {
                    levelElement.style.display = 'none';
                }
            }
            
            // Reset current step
            this.currentStep = 0;
        },

        showWinMessage: function() {
            alert('Congratulations! You found the path through all levels!');
        },

        restartGame: function() {
            this.resetProgress();
            this.renderLevels();
            this.addLevelEventListeners();
        }
    };

    // Expose globally
    window.findPathGame = findPathGame;
})();