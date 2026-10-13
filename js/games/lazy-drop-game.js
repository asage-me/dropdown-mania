(function() {
    'use strict';

    const gameState = {
        score: 0,
        clickPowerMultiplier: 1,
        autoClickerCount: 0,
        clickPowerCost: 100,
        autoClickerCost: 500,
        tier: 1,
        tierCount: 1, // Number of dropdowns at current tier
        tierCost: 1000, // Cost to add a new tier/dropdown
    };

    const dropdownOptions = {
        "1": { basePoints: 10 },
        "2": { basePoints: 25 },
        "3": { basePoints: 50 }
    };
    
    // Tier configurations - each tier has different settings
    const tierConfig = {
        1: { sizePercent: 100, pointsBase: 10, move: false },
        2: { sizePercent: 75, pointsBase: 20, move: false },
        3: { sizePercent: 50, pointsBase: 40, move: false },
        4: { sizePercent: 25, pointsBase: 80, move: false },
        5: { sizePercent: 100, pointsBase: 160, move: true } // Tier 5 is full size and moves
    };

    let uiElements = {};
    let autoClickerInterval = null;
    const saveKey = 'lazyDropGameState';

    function init() {
        console.log('Lazy Drop game init called...');
        cacheElements();
        
        // On fresh start, render tier 1 dropdown
        const hasSavedState = loadGameState();
        if (!hasSavedState) {
            renderTieredDropdowns();
            updateUI();
        } else {
            // Loaded saved state - re-render dropdowns to match saved tierCount
            renderTieredDropdowns();
            if (gameState.autoClickerCount > 0 && !autoClickerInterval) {
                startAutoClicker();
            }
            updateUI();
        }
        
        setupEventListeners();
        
        // Setup reset button
        const resetBtn = document.getElementById('reset-game-btn');
        if (resetBtn) {
            resetBtn.addEventListener('click', resetGame);
            console.log('Reset button handler attached');
        }
        
        // Setup tier upgrade button
        const tierBtn = document.getElementById('upgrade-tier');
        if (tierBtn) {
            tierBtn.addEventListener('click', buyTierUpgrade);
            console.log('Tier upgrade button handler attached');
        }
        
        console.log('Lazy Drop game initialized! autoClickerInterval:', autoClickerInterval);
    }
    
    function resetGame() {
        console.log('Resetting Lazy Drop game...');
        
        // Clear saved state
        localStorage.removeItem(saveKey);
        
        // Reset game state
        gameState.score = 0;
        gameState.clickPowerMultiplier = 1;
        gameState.autoClickerCount = 0;
        gameState.clickPowerCost = 100;
        gameState.autoClickerCost = 500;
        gameState.tier = 1;
        gameState.tierCount = 1;
        gameState.tierCost = 1000;
        
        // Stop auto-clicker
        if (autoClickerInterval) {
            clearInterval(autoClickerInterval);
            autoClickerInterval = null;
        }
        
        renderTieredDropdowns();
        updateUI();
        setupEventListeners();
        console.log('Lazy Drop game reset complete!');
    }

    /**
     * Create dropdown elements for all tiers
     */
    function renderTieredDropdowns() {
        const container = document.getElementById('lazy-game-container');
        if (!container) return;
        
        // Prevent horizontal scroll from moving dropdowns
        container.style.overflowX = 'hidden';
        
        // Remove existing tier dropdowns (keep stats and upgrades)
        const oldDropdowns = container.querySelectorAll('.tier-dropdown-wrapper');
        oldDropdowns.forEach(el => el.remove());
        
        console.log('Rendering', gameState.tierCount, 'dropdown tiers...');
        
        // Create dropdown for each tier
        for (let t = 1; t <= gameState.tierCount; t++) {
            const config = getTierConfig(t);
            const wrapper = document.createElement('div');
            // Add animation for tier 5+ (move on screen, size back to tier 1)
            if (config.move) {
                wrapper.className = `tier-dropdown-wrapper tier-${t} tier-move`;
                // Speed up animation with each tier: tier 5 = 3.0s, tier 6 = 2.5s, tier 7 = 2.0s, tier 8 = 1.5s, tier 9 = 1.0s, tier 10 = 0.5s
                const duration = 3.0 - (t - 5) * 0.5;
                wrapper.style.animation = `moveTier5 ${duration}s infinite alternate ease-in-out`;
                wrapper.style.position = 'relative';
            } else {
                wrapper.className = `tier-dropdown-wrapper tier-${t}`;
            }
            
            const label = document.createElement('h3');
            label.textContent = `Tier ${t} - Click Me!`;
            wrapper.appendChild(label);
            
            // Create custom dropdown to control menu sizing
            const customDropdown = createCustomDropdown(t, config);
            
            wrapper.appendChild(customDropdown);
            
            // Insert after the first h3 in the container
            const firstH3 = container.querySelector('h3');
            if (firstH3 && firstH3.nextSibling) {
                container.insertBefore(wrapper, firstH3.nextSibling);
            } else if (firstH3) {
                container.appendChild(wrapper);
            } else {
                container.appendChild(wrapper);
            }
        }
    }
    
    /**
     * Create a custom dropdown (not native select) so we can control menu size
     */
    function createCustomDropdown(tier, config) {
        // Wrapper for custom dropdown
        const dropdownContainer = document.createElement('div');
        dropdownContainer.className = 'custom-dropdown-wrapper';
        dropdownContainer.style.position = 'relative';
        dropdownContainer.style.display = 'inline-block';
        dropdownContainer.style.width = config.displayWidth + 'px';
        dropdownContainer.style.overflow = 'visible';
        
        // Select container with border
        const selectContainer = document.createElement('div');
        selectContainer.style.position = 'relative';
        selectContainer.style.width = config.displayWidth + 'px';
        selectContainer.style.border = '2px solid #4A5899';
        selectContainer.style.borderRadius = '4px';
        selectContainer.style.backgroundColor = '#F5F2ED';
        selectContainer.style.fontSize = config.fontSize + 'px';
        selectContainer.style.overflow = 'visible';
        
        // Display area
        const selectDisplay = document.createElement('div');
        selectDisplay.className = 'custom-select-display';
        selectDisplay.style.width = '100%';
        selectDisplay.style.fontSize = 'inherit';
        selectDisplay.style.padding = '2px 18px 2px 4px';
        selectDisplay.style.minHeight = (config.fontSize * 1.8) + 'px';
        selectDisplay.style.lineHeight = 'normal';
        selectDisplay.style.textAlign = 'left';
        selectDisplay.style.cursor = 'pointer';
        selectDisplay.style.boxSizing = 'border-box';
        selectDisplay.style.overflow = 'hidden';
        selectDisplay.style.whiteSpace = 'nowrap';
        selectDisplay.style.textOverflow = 'ellipsis';
        selectDisplay.textContent = '-- Choose an option --';
        selectContainer.appendChild(selectDisplay);
        
        // Dropdown arrow
        const arrow = document.createElement('div');
        arrow.style.position = 'absolute';
        arrow.style.top = '50%';
        arrow.style.right = '4px';
        arrow.style.transform = 'translateY(-50%)';
        arrow.style.pointerEvents = 'none';
        arrow.innerHTML = '&#9660;'; // Down arrow
        arrow.style.fontSize = (config.fontSize * 0.8) + 'px';
        arrow.style.color = '#6B6B6B';
        selectContainer.appendChild(arrow);
        
        dropdownContainer.appendChild(selectContainer);
        
        // Options list
        const optionsList = document.createElement('div');
        optionsList.className = 'custom-options-list';
        optionsList.style.width = config.displayWidth + 'px';
        optionsList.style.fontSize = config.fontSize + 'px';
        optionsList.style.display = 'none';
        optionsList.style.boxSizing = 'border-box';
        optionsList.style.position = 'absolute';
        optionsList.style.top = '100%';
        optionsList.style.left = '0';
        optionsList.style.zIndex = '100';
        
        // Make options list a child of selectContainer for proper positioning
        selectContainer.appendChild(optionsList);
        
        const options = [
            { value: '1', points: config.pointsBase },
            { value: '2', points: Math.round(config.pointsBase * 2.5) },
            { value: '3', points: Math.round(config.pointsBase * 5) }
        ];
        
        options.forEach(opt => {
            const optionItem = document.createElement('div');
            optionItem.className = 'custom-option-item';
            optionItem.style.width = '100%';
            optionItem.style.padding = '2px 4px';
            optionItem.textContent = `Option ${opt.value} (+${opt.points} pts)`;
            optionItem.addEventListener('click', function(e) {
                e.stopPropagation();
                selectDisplay.textContent = `Option ${opt.value} (+${opt.points} pts)`;
                optionsList.style.display = 'none';
                
                // Apply tier-specific styling for this option
                selectDisplay.style.background = opt.value === '1' ? '#D4CFC7' : (opt.value === '2' ? '#4A5899' : '#2D3748');
                
                // Apply click power multiplier
                const pointsEarned = opt.points * gameState.clickPowerMultiplier;
                
                // Add points
                gameState.score += pointsEarned;
                saveGameState();
                updateUI();
            });
            optionsList.appendChild(optionItem);
        });
        
        dropdownContainer.appendChild(optionsList);
        
        // Toggle dropdown visibility
        selectDisplay.addEventListener('click', function(e) {
            e.stopPropagation();
            const isVisible = optionsList.style.display === 'block';
            optionsList.style.display = isVisible ? 'none' : 'block';
        });
        
        // Close dropdown when clicking outside
        document.addEventListener('click', function() {
            optionsList.style.display = 'none';
        });
        
        return dropdownContainer;
    }
    
    /**
     * Get tier configuration
     */
    function getTierConfig(tierNum) {
        // Custom dropdown dimensions per tier
        const tierDimensions = {
            1: { displayWidth: 200, fontSize: 14 },
            2: { displayWidth: 150, fontSize: 11 },
            3: { displayWidth: 100, fontSize: 8 },
            4: { displayWidth: 60, fontSize: 5 },
            5: { displayWidth: 200, fontSize: 14 },
            6: { displayWidth: 200, fontSize: 14 },
            7: { displayWidth: 200, fontSize: 14 },
            8: { displayWidth: 200, fontSize: 14 },
            9: { displayWidth: 200, fontSize: 14 },
            10: { displayWidth: 200, fontSize: 14 }
        };

        const dims = tierDimensions[tierNum] || tierDimensions[5];
        const move = tierNum >= 5;
        
        // Always merge dimensions with tier config
        return Object.assign(
            tierConfig[tierNum] || { sizePercent: 100, pointsBase: 10, move: false },
            { 
                displayWidth: dims.displayWidth,
                fontSize: dims.fontSize,
                move: move
            }
        );
    }

    function cacheElements() {
        uiElements.scoreDisplay = document.getElementById('lazy-score');
        uiElements.clickMultiplierDisplay = document.getElementById('click-per-select');
        uiElements.dropdown = document.getElementById('lazy-drop-down');
        uiElements.buyClickPowerBtn = document.getElementById('upgrade-click-power');
        uiElements.buyAutoClickerBtn = document.getElementById('upgrade-auto-clicker');
        uiElements.upgradeTierBtn = document.getElementById('upgrade-tier');
        uiElements.resetGameBtn = document.getElementById('reset-game-btn');
        
        console.log('Lazy Drop cacheElements result:', {
            scoreDisplay: !!uiElements.scoreDisplay,
            clickMultiplierDisplay: !!uiElements.clickMultiplierDisplay,
            dropdown: !!uiElements.dropdown,
            buyClickPowerBtn: !!uiElements.buyClickPowerBtn,
            buyAutoClickerBtn: !!uiElements.buyAutoClickerBtn,
            upgradeTierBtn: !!uiElements.upgradeTierBtn
        });
    }

    function setupEventListeners() {
        // Add listeners for all tier dropdowns
        const allDropdowns = document.querySelectorAll('.tier-dropdown-wrapper .custom-dropdown');
        console.log('Found', allDropdowns.length, 'dropdowns to attach listeners to');
        
        allDropdowns.forEach(dropdown => {
            if (dropdown) {
                dropdown.addEventListener('change', handleDropdownSelection);
            }
        });
        
        if (uiElements.buyClickPowerBtn) {
            uiElements.buyClickPowerBtn.addEventListener('click', buyClickPowerUpgrade);
        }
        
        if (uiElements.buyAutoClickerBtn) {
            uiElements.buyAutoClickerBtn.addEventListener('click', buyAutoClickerUpgrade);
        }
    }

    function handleDropdownSelection(e) {
        const dropdown = e.target;
        const value = dropdown.value;
        
        // Only process valid options (1, 2, or 3)
        if (!value || !['1', '2', '3'].includes(value)) {
            return;
        }
        
        // Calculate points based on option selected
        let basePoints = 0;
        switch (value) {
            case '1':
                basePoints = 10;
                break;
            case '2':
                basePoints = 25;
                break;
            case '3':
                basePoints = 50;
                break;
        }
        
        // Apply multiplier
        const pointsEarned = basePoints * gameState.clickPowerMultiplier;
        
        // Update score
        gameState.score += pointsEarned;
        
        // Reset dropdown selection
        dropdown.value = '';
        
        // Save and update UI
        saveGameState();
        updateUI();
    }

    /**
     * Purchase click power upgrade
     */
    function buyClickPowerUpgrade() {
        if (gameState.score >= gameState.clickPowerCost) {
            // Deduct cost
            gameState.score -= gameState.clickPowerCost;
            
            // Increase click power multiplier by 1
            gameState.clickPowerMultiplier++;
            
            // Double the cost for next upgrade
            gameState.clickPowerCost *= 2;
            
            saveGameState();
            updateUI();
        } else {
            alert(`Not enough points! You need ${gameState.clickPowerCost} points.`);
        }
    }

    /**
     * Purchase auto-clicker upgrade
     */
    function buyAutoClickerUpgrade() {
        if (gameState.score >= gameState.autoClickerCost) {
            // Deduct cost
            gameState.score -= gameState.autoClickerCost;
            
            // Increase auto-clicker count by 1
            gameState.autoClickerCount++;
            
            // Increase cost by 1.5x for next upgrade (rounded up)
            gameState.autoClickerCost = Math.ceil(gameState.autoClickerCost * 1.5);
            
            saveGameState();
            updateUI();
            
            // Make sure auto-clicker is running
            startAutoClicker();
        } else {
            alert(`Not enough points! You need ${gameState.autoClickerCost} points.`);
        }
    }

    /**
    * Purchase tier upgrade - adds a new dropdown tier that moves and stays full size from tier 5
     */
    function buyTierUpgrade() {
        const currentTier = gameState.tierCount + 1;
        
        if (gameState.score >= gameState.tierCost) {
            // Deduct cost
            gameState.score -= gameState.tierCost;
            
            // Increase tier count
            gameState.tierCount++;
            
            // Double the cost for next tier
            gameState.tierCost *= 2;
            
            // Add new tier to config if it doesn't exist
            if (!tierConfig[currentTier]) {
                tierConfig[currentTier] = getTierConfig(currentTier);
            }
            
            saveGameState();
            updateUI();
            renderTieredDropdowns(); // Re-render with new tier
            
            // Setup event listeners for new dropdown(s)
            setupEventListeners();
        } else {
            alert(`Not enough points! You need ${gameState.tierCost} points.`);
        }
    }

    /**
     * Start the auto-clicker functionality
     */
    function startAutoClicker() {
        if (autoClickerInterval) {
            clearInterval(autoClickerInterval);
        }
        
        console.log('Starting auto-clicker, count:', gameState.autoClickerCount);
        
        autoClickerInterval = setInterval(() => {
            console.log('Auto-click tick, count:', gameState.autoClickerCount);
            if (gameState.autoClickerCount > 0) {
                gameState.score += gameState.autoClickerCount;
                saveGameState();
                updateUI();
            }
        }, 1000);
        
        console.log('Auto-clicker interval started with ID:', autoClickerInterval);
    }

    /**
     * Save game state to localStorage
     */
    function saveGameState() {
        try {
            localStorage.setItem(saveKey, JSON.stringify(gameState));
        } catch (e) {
            console.error('Failed to save game state:', e);
        }
    }

    /**
     * Update UI elements based on current game state
     */
    function updateUI() {
        // Update score display
        if (uiElements.scoreDisplay) {
            uiElements.scoreDisplay.textContent = gameState.score;
        }
        
        // Update click per select display
        if (uiElements.clickMultiplierDisplay) {
            uiElements.clickMultiplierDisplay.textContent = gameState.clickPowerMultiplier;
        }
        
        // Update tier display
        const tierDisplay = document.getElementById('tier-display');
        if (tierDisplay) {
            tierDisplay.textContent = gameState.tierCount;
        }
        
        // Update upgrade buttons with current costs
        if (uiElements.buyClickPowerBtn) {
            uiElements.buyClickPowerBtn.innerHTML = 
                `Click Power (${gameState.clickPowerCost} pts)<br><small>+1 point per selection</small>`;
            
            // Disable button if can't afford it
            uiElements.buyClickPowerBtn.disabled = gameState.score < gameState.clickPowerCost;
        }
        
        if (uiElements.buyAutoClickerBtn) {
            uiElements.buyAutoClickerBtn.innerHTML = 
                `Auto-Clicker (${gameState.autoClickerCost} pts)<br><small>Generates 1 click/second</small>`;
            
            // Disable button if can't afford it
            uiElements.buyAutoClickerBtn.disabled = gameState.score < gameState.autoClickerCost;
        }
        
        // Update tier upgrade button cost
        if (uiElements.upgradeTierBtn) {
            if (gameState.tierCount >= 10) {
                uiElements.upgradeTierBtn.innerHTML = 'New tiers coming soon';
                uiElements.upgradeTierBtn.disabled = true;
            } else {
                uiElements.upgradeTierBtn.innerHTML = 
                    `Add Tier (${gameState.tierCost} pts)<br><small>+1 dropdown tier, smaller & harder</small>`;
                
                uiElements.upgradeTierBtn.disabled = gameState.score < gameState.tierCost;
            }
        }
    }

    /**
     * Load game state from localStorage
     */
    function loadGameState() {
        const savedState = localStorage.getItem('lazyDropGameState');
        
        if (savedState) {
            try {
                const parsedState = JSON.parse(savedState);
                
                // Update game state with loaded values
                gameState.score = parsedState.score || 0;
                gameState.clickPowerMultiplier = parsedState.clickPowerMultiplier || 1;
                gameState.autoClickerCount = parsedState.autoClickerCount || 0;
                gameState.clickPowerCost = parsedState.clickPowerCost || 100;
                gameState.autoClickerCost = parsedState.autoClickerCost || 500;
                gameState.tierCount = parsedState.tierCount || 1;
                gameState.tierCost = parsedState.tierCost || 1000;
                
                return true; // Successfully loaded
            } catch (e) {
                console.error('Failed to parse saved game state:', e);
                return false;
            }
        }
        
        return false; // No saved state found
    }

    // Expose the module globally so it can be accessed by app.js
    window.lazyDropGame = {
        init: init
    };
})();