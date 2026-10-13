// Custom Select Component — Replaces native <select> with themeable div-based dropdowns
(function() {
    'use strict';

    function createCustomSelect(originalSelect) {
        // Create wrapper
        const wrapper = document.createElement('div');
        wrapper.className = 'custom-select' + (originalSelect.classList.contains('retro-custom-select') ? ' retro-custom-select' : '');
        
        // Get options
        const options = [];
        originalSelect.querySelectorAll('option').forEach(opt => {
            options.push({ value: opt.value, text: opt.textContent, disabled: opt.disabled });
        });

        // Create trigger
        const trigger = document.createElement('div');
        trigger.className = 'custom-select-trigger';
        trigger.setAttribute('role', 'combobox');
        trigger.setAttribute('aria-expanded', 'false');
        trigger.setAttribute('tabindex', '0');
        
        // Set initial display text
        const selectedOption = originalSelect.value 
            ? options.find(o => o.value === originalSelect.value) 
            : options[0];
        
        if (selectedOption) {
            trigger.textContent = selectedOption.text;
        } else {
            trigger.textContent = '-- Select --';
        }

        // Create menu
        const menu = document.createElement('div');
        menu.className = 'custom-select-menu';
        menu.setAttribute('role', 'listbox');
        
        options.forEach((opt, index) => {
            const item = document.createElement('div');
            item.className = 'custom-select-item' + (opt.disabled ? ' disabled' : '');
            if (opt.value === originalSelect.value && opt.value !== '') {
                item.classList.add('selected');
            }
            item.textContent = opt.text;
            item.setAttribute('role', 'option');
            item.setAttribute('aria-selected', opt.value === originalSelect.value ? 'true' : 'false');
            item.dataset.value = opt.value;
            
            item.addEventListener('click', function(e) {
                e.stopPropagation();
                handleOptionClick(opt, wrapper, originalSelect);
            });
            
            menu.appendChild(item);
        });

        // Toggle on trigger click
        trigger.addEventListener('click', function(e) {
            e.stopPropagation();
            const isOpen = wrapper.classList.contains('open');
            closeAllCustomSelects();
            if (!isOpen) {
                wrapper.classList.add('open');
                trigger.setAttribute('aria-expanded', 'true');
            } else {
                trigger.setAttribute('aria-expanded', 'false');
            }
        });

        // Assemble
        wrapper.appendChild(trigger);
        wrapper.appendChild(menu);
        
        // Replace original select (hide it but keep in DOM for form submission)
        originalSelect.style.display = 'none';
        originalSelect.parentNode.insertBefore(wrapper, originalSelect);
        
        return wrapper;
    }

    function handleOptionClick(option, wrapper, originalSelect) {
        const trigger = wrapper.querySelector('.custom-select-trigger');
        const menu = wrapper.querySelector('.custom-select-menu');
        
        // Update trigger text
        trigger.textContent = option.text;
        
        // Update selected state in menu
        menu.querySelectorAll('.custom-select-item').forEach(item => {
            item.classList.remove('selected');
            item.setAttribute('aria-selected', 'false');
            if (item.dataset.value === option.value) {
                item.classList.add('selected');
                item.setAttribute('aria-selected', 'true');
            }
        });
        
        // Update original select value
        originalSelect.value = option.value;
        originalSelect.dispatchEvent(new Event('change', { bubbles: true }));
        
        // Close menu
        wrapper.classList.remove('open');
        trigger.setAttribute('aria-expanded', 'false');
    }

    function closeAllCustomSelects() {
        document.querySelectorAll('.custom-select.open').forEach(sel => {
            sel.classList.remove('open');
            const trigger = sel.querySelector('.custom-select-trigger');
            if (trigger) trigger.setAttribute('aria-expanded', 'false');
        });
    }

    // Close on outside click
    document.addEventListener('click', function(e) {
        if (!e.target.closest('.custom-select')) {
            closeAllCustomSelects();
        }
    });

    // Close on Escape
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closeAllCustomSelects();
        }
    });

    // Initialize all selects on page load
    function init() {
        const selects = document.querySelectorAll('select:not([data-custom-select-processed])');
        selects.forEach(select => {
            select.setAttribute('data-custom-select-processed', 'true');
            createCustomSelect(select);
        });
    }

    // Run immediately if DOM is ready, otherwise wait
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Expose for dynamic content loading
    window.initCustomSelects = function() {
        const selects = document.querySelectorAll('select:not([data-custom-select-processed])');
        selects.forEach(select => {
            select.setAttribute('data-custom-select-processed', 'true');
            createCustomSelect(select);
        });
    };

})();
