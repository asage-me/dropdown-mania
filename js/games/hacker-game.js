// Hacker Puzzle Game Module
(function() {
    'use strict';

    const hackerGame = {
        password: 'H4CK3R_2026',
    
        init: function() {
            console.log('Hacker Puzzle game initializing...');
            
            // Store password in hidden data attributes and console log for the puzzle
            const container = document.getElementById('hacker-container');
            if (container) {
                container.setAttribute('data-hidden-pass', this.password);
                
                // Add hidden comment with first 3 chars
                const hiddenComment = document.createComment(' First 3 chars: H4C ');
                container.appendChild(hiddenComment);
            }
            
            // Log password parts to console (part of the puzzle)
            console.log('%c === HACKER PUZZLE CHEAT SHEET === ', 'background: black; color: green;');
            console.log('%c Password length: 10 characters ', 'background: #2d2d2d; color: cyan;');
            console.log('%c Pattern: H4CK3R_XXXX - starts with "H4C" and ends with "_26" ', 'background: black; color: yellow;');
            
            // Add the submit button listener
            this.addSubmitListener();
        },
    
        addSubmitListener: function() {
            const submitBtn = document.getElementById('submit-password-btn');
            const passwordInput = document.getElementById('password-input');
            const resultDisplay = document.getElementById('auth-result');
    
            if (submitBtn && passwordInput && resultDisplay) {
                submitBtn.addEventListener('click', () => this.checkPassword(passwordInput.value, resultDisplay));
                
                // Also allow Enter key
                passwordInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        this.checkPassword(passwordInput.value, resultDisplay);
                    }
                });
            }
        },
    
        checkPassword: function(input, resultDisplay) {
            const trimmed = input.trim();
            
            if (!trimmed) {
                resultDisplay.textContent = 'Please enter a password.';
                resultDisplay.style.color = 'orange';
                return;
            }
            
            if (trimmed === this.password) {
                resultDisplay.textContent = 'ACCESS GRANTED! You found the hidden password!';
                resultDisplay.style.color = 'green';
                resultDisplay.innerHTML += '<br><strong>Secret message: Welcome to the Matrix!</strong>';
            } else {
                resultDisplay.textContent = 'ACCESS DENIED. Try again.';
                resultDisplay.style.color = 'red';
                
                // Add hint for wrong passwords
                if (trimmed.length === this.password.length) {
                    resultDisplay.innerHTML += '<br><small>Hint: You\'re close! The password has the pattern "H4CK3R_XXXX"</small>';
                }
            }
        }
    };

    // Expose globally
    window.hackerGame = hackerGame;
})();