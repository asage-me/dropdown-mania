// Dropdown Mania - Main Application
// Handles mode switching and dynamic content loading

(function() {
    'use strict';

    // Store references to common elements
    const mainContent = document.getElementById('main-content');
    const modeSelect = document.getElementById('main-mode-select');
    
    // Mode configurations with their corresponding files
    const modes = {
        education: {
            title: 'Education',
            fileName: 'education.html',
            cssFile: 'css/education.css'
        },
        games: {
            title: 'Games',
            fileName: 'games.html', 
            cssFile: 'css/games.css'
        },
        'retro': {
            title: '1999 Retro',
            fileName: 'retro-1999.html',
            cssFile: 'css/retro-1999.css'
        }
    };

    // Initialize the application
    function init() {
        console.log('Dropdown Mania initialized!');
        
        // Restore saved theme or default to light
        var savedTheme = localStorage.getItem('dropdown-mania-theme') || 'light';
        setTheme(savedTheme);

        // Set up event listener for mode selection
        if (modeSelect) {
            modeSelect.addEventListener('change', function(e) {
                const newMode = e.target.value;
                loadMode(newMode);
            });
        }

        // Theme toggle button
        var themeBtn = document.getElementById('theme-toggle-btn');
        if (themeBtn) {
            themeBtn.addEventListener('click', toggleTheme);
        }

        // Attach listeners to hero buttons (replaces inline onclick handlers)
        var heroButtons = document.querySelectorAll('[data-mode]');
        heroButtons.forEach(function(btn) {
            btn.addEventListener('click', function() {
                var mode = this.getAttribute('data-mode');
                if (modeSelect && modes[mode]) {
                    modeSelect.value = mode;
                    modeSelect.dispatchEvent(new Event('change'));
                }
            });
        });

        // Hero dropdown — interactive demo + auto-animation on load
        initHeroDropdown();

        // Only load initial mode if no mode is currently selected or if we want a default
        // For now, let's not call loadMode('education') automatically to keep index.html as the home page
    }

    // Load a specific mode
    function loadMode(modeName) {
        console.log(`Loading mode: ${modeName}`);
        
        if (!modes[modeName]) {
            console.error(`Unknown mode: ${modeName}`);
            return;
        }

        // Update body class for styling purposes
        document.body.className = `mode-${modeName}`;
        
        // Load the CSS file for this mode
        loadStylesheet(modes[modeName].cssFile);
        
        // Fetch and display the page content
        fetchContent(modes[modeName].fileName)
            .then(function(content) {
                mainContent.innerHTML = content;
                
                // Log success
                console.log(`Successfully loaded ${modes[modeName].title} mode`);
                
                // If games mode, initialize game scripts BEFORE running inline scripts
                // so window.onGamesReady is available when games.html script executes
                if (modeName === 'games') {
                    initGames();
                }

                // Execute any embedded scripts in the HTML safely
                const scripts = mainContent.querySelectorAll('script');
                scripts.forEach(function(script) {
                    if (script.src) {
                        // External script - already handled by <script src>
                    } else if (script.textContent.trim()) {
                        // Inline script - create a new script element to preserve execution context
                        const newScript = document.createElement('script');
                        newScript.textContent = script.textContent;
                        document.head.appendChild(newScript);
                        document.head.removeChild(newScript);
                    }
                });

                // Convert any native <select> elements to custom themeable dropdowns
                if (typeof window.initCustomSelects === 'function') {
                    window.initCustomSelects();
                }
            })
            .catch(function(error) {
                console.error('Error loading mode content:', error);
                mainContent.innerHTML = `<div class="error-message">
                    <h2>Error Loading ${modes[modeName].title} Mode</h2>
                    <p>Failed to load content. Please check the files.</p>
                </div>`;
            });
    }

    // Load CSS stylesheet dynamically
    function loadStylesheet(href) {
        const styles = document.getElementById('page-style');
        if (styles) {
            styles.href = href;
        } else {
            console.warn('Page style element not found for dynamic loading');
        }
    }

    // Fetch HTML content for the specified page
    function fetchContent(fileName) {
        return new Promise(function(resolve, reject) {
            const xhr = new XMLHttpRequest();
            
            xhr.open('GET', fileName, true);
            xhr.onreadystatechange = function() {
                if (xhr.readyState === 4) {
                    if (xhr.status === 200) {
                        resolve(xhr.responseText);
                    } else {
                        reject(new Error(`Failed to load ${fileName}: ${xhr.status}`));
                    }
                }
            };
            
            xhr.onerror = function() {
                reject(new Error(`Network error while loading ${fileName}`));
            };
            
            xhr.send();
        });
    }

    // Game initialization (called when games mode loads)
    function initGames() {
        console.log('Initializing games...');
        
        // Create game module object
        window.gameModules = window.gameModules || {};
        
        // List of game scripts to load
        const gameScripts = [
            { name: 'findPath', scriptUrl: 'js/games/find-path-game.js' },
            { name: 'hacker', scriptUrl: 'js/games/hacker-game.js' },
            { name: 'lazyDrop', scriptUrl: 'js/games/lazy-drop-game.js' }
        ];
        
        console.log('Game scripts to load:', gameScripts);
        
        let loadedCount = 0;
        const totalScripts = gameScripts.length;
        
        // Store the callback for games.html to know when scripts are ready
        var onScriptsLoaded = null;
        window.onGamesReady = function(callback) {
            if (typeof callback === 'function') {
                if (onScriptsLoaded) {
                    callback();
                } else {
                    onScriptsLoaded = callback;
                }
            } else if (onScriptsLoaded) {
                onScriptsLoaded();
            }
        };
        
        function checkAllLoaded() {
            console.log(`Loaded ${loadedCount}/${totalScripts} games`);
            if (loadedCount === totalScripts) {
                // Notify games.html that all scripts are loaded
                if (typeof onScriptsLoaded === 'function') {
                    onScriptsLoaded();
                } else {
                    console.log('All game scripts loaded.');
                }
            }
        }
        
        // Load each game script
        gameScripts.forEach(function(game) {
            console.log('Checking for ' + game.name + 'Game:', typeof window[game.name + 'Game']);
            
            // Check if already loaded (via games.html script tags)
            if (typeof window[game.name + 'Game'] !== 'undefined') {
                window.gameModules[game.name] = window[game.name + 'Game'];
                console.log(game.name + ' game loaded from global');
                loadedCount++;
                checkAllLoaded();
                return;
            }
            
            // Load script dynamically
            const script = document.createElement('script');
            script.src = game.scriptUrl;
            script.async = false; // Load in order
            
            script.onload = function() {
                const globalName = game.name + 'Game';
                console.log(game.name + ' script loaded, checking module:', typeof window[globalName]);
                if (typeof window[globalName] !== 'undefined') {
                    window.gameModules[game.name] = window[globalName];
                    console.log(game.name + ' game loaded from script');
                    loadedCount++;
                } else {
                    console.warn(game.name + ' game module not found after loading script. Expected: ' + globalName);
                    loadedCount++; // Count it anyway to avoid hanging
                }
                checkAllLoaded();
            };
            
            script.onerror = function() {
                console.error('Failed to load ' + game.scriptUrl);
                loadedCount++;
                checkAllLoaded();
            };
            
            document.head.appendChild(script);
        });
        
        // Edge case: if no scripts to load
        if (totalScripts === 0) {
            console.log('No games to load.');
        }
    }

    // Initialize all loaded games (not called automatically anymore)
    function initializeAllGames() {
        console.log('Initializing all loaded games...');
        console.log('Game modules:', window.gameModules);
        
        Object.keys(window.gameModules).forEach(function(gameName) {
            try {
                const gameModule = window.gameModules[gameName];
                if (typeof gameModule.init === 'function') {
                    gameModule.init();
                    console.log(gameName + ' game initialized');
                }
            } catch (e) {
                console.error('Error initializing ' + gameName + ' game:', e);
            }
        });
        
        // If no games loaded, show a placeholder
        if (Object.keys(window.gameModules).length === 0) {
            console.warn('No game modules detected. Ensure js/games/ folder has the game files.');
        }
    }

    // Theme management - applies dark/light mode across all pages
    function setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('dropdown-mania-theme', theme);
        
        var btn = document.getElementById('theme-toggle-btn');
        if (btn) {
            btn.textContent = theme === 'dark' ? '☀️' : '🌙';
            btn.title = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
        }
    }

    function toggleTheme() {
        var current = document.documentElement.getAttribute('data-theme');
        setTheme(current === 'dark' ? 'light' : 'dark');
    }

    // Hero dropdown — animated demo that cycles through collections on load
    function initHeroDropdown() {
        var heroDemo = document.getElementById('hero-dropdown');
        var heroLabel = document.getElementById('hero-dropdown-label');
        var trigger = document.getElementById('hero-dropdown-trigger');
        var items = heroDemo ? heroDemo.querySelectorAll('.dropdown-item') : [];

        if (!heroDemo || items.length === 0) return;

        // Toggle open/close on click
        if (trigger) {
            trigger.addEventListener('click', function(e) {
                e.stopPropagation();
                var isOpen = heroDemo.classList.contains('open');
                if (isOpen) {
                    heroDemo.classList.remove('open');
                } else {
                    heroDemo.classList.add('open');
                }
            });
        }

        // Close dropdown when clicking outside
        document.addEventListener('click', function() {
            heroDemo.classList.remove('open');
        });
        heroDemo.addEventListener('click', function(e) {
            e.stopPropagation();
        });

        // Item click — navigate to mode
        items.forEach(function(item) {
            item.addEventListener('click', function() {
                var mode = this.getAttribute('data-mode');
                if (modeSelect && modes[mode]) {
                    heroDemo.classList.remove('open');
                    modeSelect.value = mode;
                    modeSelect.dispatchEvent(new Event('change'));
                }
            });
        });

        // Auto-animation: open, cycle through items, close — on page load
        var modesList = ['education', 'games', 'retro'];
        var modeLabels = {
            education: 'Education — Learn the patterns',
            games: 'Games — Play with them',
            retro: 'Retro 1999 — Remember them'
        };
        var currentIndex = 0;

        function runAutoDemo() {
            // Open dropdown
            heroDemo.classList.add('open');

            function cycleNext() {
                // Deselect all, select current
                items.forEach(function(item) { item.classList.remove('active'); });
                var currentItem = items[currentIndex];
                if (currentItem) {
                    currentItem.classList.add('active');
                    heroLabel.textContent = modeLabels[modesList[currentIndex]] || modesList[currentIndex];
                }

                currentIndex = (currentIndex + 1) % modesList.length;

                // Close after showing last item, or repeat
                if (currentIndex === 0) {
                    setTimeout(function() {
                        heroDemo.classList.remove('open');
                        heroLabel.textContent = 'Select a collection…';
                        items.forEach(function(item) { item.classList.remove('active'); });
                        // Reset and replay after a pause
                        currentIndex = 0;
                        setTimeout(runAutoDemo, 4000);
                    }, 1200);
                } else {
                    setTimeout(cycleNext, 900);
                }
            }

            setTimeout(cycleNext, 600);
        }

        // Start animation after a short delay
        setTimeout(runAutoDemo, 800);
    }

    // Export public functions
    window.dropdownMania = {
        loadMode: loadMode,
        init: init
    };

    // Auto-initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();