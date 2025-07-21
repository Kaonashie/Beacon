class DynamicDnsClient {
    updateInterval = 60000; // 60 seconds
    intervalId = null;
    constructor() {
        this.init();
    }
    init() {
        this.setupEventListeners();
        this.loadInitialData();
        this.startPeriodicUpdates();
    }
    setupEventListeners() {
        // Settings icon click
        const settingsIcon = document.getElementById('settingsIcon');
        if (settingsIcon) {
            settingsIcon.addEventListener('click', () => this.openSettings());
        }
        // Modal backdrop click (close modal)
        const modalBackdrop = document.getElementById('modalBackdrop');
        if (modalBackdrop) {
            modalBackdrop.addEventListener('click', (e) => {
                if (e.target === modalBackdrop) {
                    this.closeSettings();
                }
            });
        }
        // Cancel button
        const cancelBtn = document.getElementById('cancelBtn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => this.closeSettings());
        }
        // Save button
        const saveBtn = document.getElementById('saveBtn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.saveSettings());
        }
        // Theme toggle
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', () => this.toggleTheme());
        }
        // Force update button
        const forceUpdateBtn = document.getElementById('forceUpdateBtn');
        if (forceUpdateBtn) {
            forceUpdateBtn.addEventListener('click', () => this.forceUpdate());
        }
        // Interval slider
        const intervalSlider = document.getElementById('intervalSlider');
        if (intervalSlider) {
            intervalSlider.addEventListener('input', () => this.updateSliderValue());
        }
    }
    async loadInitialData() {
        this.loadThemeFromCookie();
        await this.updateStatus();
        await this.updateHistory();
        await this.checkForceUpdateCooldown();
    }
    startPeriodicUpdates() {
        this.intervalId = setInterval(() => {
            this.updateStatus();
            this.updateHistory();
        }, this.updateInterval);
    }
    async updateStatus() {
        try {
            const response = await fetch('/api/status');
            if (response.status === 429) {
                console.warn('Rate limited, retrying in 30 seconds');
                return;
            }
            const data = await response.json();
            this.updateStatusDisplay(data);
        }
        catch (error) {
            console.error('Failed to update status:', error);
            this.setErrorState();
        }
    }
    updateStatusDisplay(data) {
        // Update IP display
        const ipDisplay = document.querySelector('.ip-display');
        if (ipDisplay) {
            ipDisplay.textContent = data.currentIp || 'No IP detected';
        }
        // Update last update time
        const lastUpdate = document.querySelector('.last-update');
        if (lastUpdate && data.lastUpdate) {
            const updateTime = new Date(data.lastUpdate);
            const now = new Date();
            const diffMinutes = Math.floor((now.getTime() - updateTime.getTime()) / (1000 * 60));
            let timeText = '';
            if (diffMinutes < 1) {
                timeText = 'Updated just now';
            }
            else if (diffMinutes === 1) {
                timeText = 'Updated 1 minute ago';
            }
            else if (diffMinutes < 60) {
                timeText = `Updated ${diffMinutes} minutes ago`;
            }
            else {
                const diffHours = Math.floor(diffMinutes / 60);
                timeText = diffHours === 1 ? 'Updated 1 hour ago' : `Updated ${diffHours} hours ago`;
            }
            lastUpdate.textContent = timeText;
        }
        // Update status indicator
        const statusIndicator = document.getElementById('statusIndicator');
        if (statusIndicator) {
            statusIndicator.className = `status-indicator ${data.status}`;
        }
    }
    async updateHistory() {
        try {
            const response = await fetch('/api/history');
            if (response.status === 429) {
                console.warn('Rate limited on history, retrying in 30 seconds');
                return;
            }
            const data = await response.json();
            this.updateHistoryDisplay(data.updates);
        }
        catch (error) {
            console.error('Failed to update history:', error);
        }
    }
    updateHistoryDisplay(updates) {
        const logEntries = document.getElementById('logEntries');
        const logPlaceholders = document.getElementById('logPlaceholders');
        if (!logEntries || !logPlaceholders)
            return;
        // Handle undefined updates array
        if (!updates || !Array.isArray(updates)) {
            console.warn('Updates array is undefined or invalid');
            return;
        }
        // Clear existing real entries
        logEntries.innerHTML = '';
        // Ensure placeholders are visible (remove any 'loaded' class)
        logPlaceholders.className = 'log-placeholder-container';
        // Add real entries with a small delay for smooth transition
        setTimeout(() => {
            // Hide placeholders with smooth transition
            logPlaceholders.className = 'log-placeholder-container loaded';
            // Add real entries
            updates.forEach((update, index) => {
                const entry = document.createElement('div');
                entry.className = 'log-entry';
                entry.style.animationDelay = `${index * 50}ms`; // Stagger animations
                const timestamp = new Date(update.timestamp).toLocaleString();
                const oldIp = update.oldIp || 'N/A';
                const statusClass = update.status === 'success' ? 'success' : 'failed';
                entry.innerHTML = `
          <span>${timestamp}</span>
          <span class="ip">${oldIp}</span>
          <span class="ip">${update.newIp}</span>
          <span class="status ${statusClass}">${update.status}</span>
        `;
                logEntries.appendChild(entry);
            });
        }, 100);
    }
    setErrorState() {
        const statusIndicator = document.getElementById('statusIndicator');
        if (statusIndicator) {
            statusIndicator.className = 'status-indicator error';
        }
    }
    openSettings() {
        const modalBackdrop = document.getElementById('modalBackdrop');
        if (modalBackdrop) {
            modalBackdrop.classList.remove('closing');
            modalBackdrop.classList.add('show');
        }
        this.loadCurrentSettings();
    }
    closeSettings() {
        const modalBackdrop = document.getElementById('modalBackdrop');
        if (modalBackdrop) {
            modalBackdrop.classList.add('closing');
            modalBackdrop.classList.remove('show');
            // Wait for animation to complete before hiding
            setTimeout(() => {
                modalBackdrop.classList.remove('closing');
            }, 300);
        }
    }
    async loadCurrentSettings() {
        try {
            const response = await fetch('/api/status');
            const data = await response.json();
            // Load interval from server
            const intervalSlider = document.getElementById('intervalSlider');
            if (intervalSlider) {
                intervalSlider.value = data.checkIntervalMinutes.toString();
                this.updateSliderValue();
            }
            // Load current theme from HTML attribute
            const html = document.documentElement;
            const currentTheme = html.getAttribute('data-theme') || 'light';
            // Theme toggle is now handled by CSS based on data-theme attribute
        }
        catch (error) {
            console.error('Failed to load settings:', error);
        }
    }
    loadThemeFromCookie() {
        const savedTheme = this.getCookie('theme') || 'light';
        const html = document.documentElement;
        html.setAttribute('data-theme', savedTheme);
        // Theme toggle icon is now handled by CSS based on data-theme attribute
    }
    setCookie(name, value, days = 365) {
        const expires = new Date();
        expires.setTime(expires.getTime() + (days * 24 * 60 * 60 * 1000));
        document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/`;
    }
    getCookie(name) {
        const nameEQ = name + "=";
        const ca = document.cookie.split(';');
        for (let i = 0; i < ca.length; i++) {
            let c = ca[i];
            while (c.charAt(0) === ' ')
                c = c.substring(1, c.length);
            if (c.indexOf(nameEQ) === 0)
                return c.substring(nameEQ.length, c.length);
        }
        return null;
    }
    updateSliderValue() {
        const intervalSlider = document.getElementById('intervalSlider');
        const sliderValue = document.getElementById('sliderValue');
        if (intervalSlider && sliderValue) {
            const minutes = parseInt(intervalSlider.value);
            sliderValue.textContent = `${minutes} minute${minutes !== 1 ? 's' : ''}`;
        }
    }
    toggleTheme() {
        const html = document.documentElement;
        const currentTheme = html.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        html.setAttribute('data-theme', newTheme);
        // Save theme to cookie
        this.setCookie('theme', newTheme);
        // Theme toggle icon is now handled by CSS based on data-theme attribute
    }
    async saveSettings() {
        try {
            const intervalSlider = document.getElementById('intervalSlider');
            const html = document.documentElement;
            if (!intervalSlider)
                return;
            const settings = {
                checkIntervalMinutes: parseInt(intervalSlider.value),
                theme: html.getAttribute('data-theme') || 'light'
            };
            // Also save theme to cookie for instant loading
            this.setCookie('theme', settings.theme);
            const response = await fetch('/api/settings', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(settings)
            });
            if (response.ok) {
                console.log('Settings saved successfully');
                this.closeSettings();
            }
            else {
                console.error('Failed to save settings');
            }
        }
        catch (error) {
            console.error('Error saving settings:', error);
        }
    }
    async forceUpdate() {
        const forceUpdateBtn = document.getElementById('forceUpdateBtn');
        if (!forceUpdateBtn)
            return;
        // Check if button is in cooldown
        if (forceUpdateBtn.disabled)
            return;
        // Disable button and show loading state
        forceUpdateBtn.disabled = true;
        forceUpdateBtn.textContent = 'Checking...';
        // Set status to checking
        const statusIndicator = document.getElementById('statusIndicator');
        if (statusIndicator) {
            statusIndicator.className = 'status-indicator checking';
        }
        try {
            const response = await fetch('/api/force-update', {
                method: 'POST'
            });
            const data = await response.json();
            console.log('Force update result:', data);
            if (response.status === 429 && data.cooldownRemaining) {
                // Server-side cooldown active, start countdown
                this.startForceUpdateCooldownFromServer(data.cooldownRemaining);
                return;
            }
            // Update displays immediately
            await this.updateStatus();
            await this.updateHistory();
            // Start 5-minute cooldown timer
            this.startForceUpdateCooldown();
        }
        catch (error) {
            console.error('Force update failed:', error);
            this.setErrorState();
            // Re-enable button on error
            forceUpdateBtn.disabled = false;
            forceUpdateBtn.textContent = 'Force Update';
        }
    }
    startForceUpdateCooldown() {
        const forceUpdateBtn = document.getElementById('forceUpdateBtn');
        if (!forceUpdateBtn)
            return;
        const cooldownSeconds = 5 * 60; // 5 minutes
        let remainingSeconds = cooldownSeconds;
        const updateButtonText = () => {
            if (remainingSeconds <= 0) {
                forceUpdateBtn.disabled = false;
                forceUpdateBtn.textContent = 'Force Update';
                return;
            }
            const minutes = Math.floor(remainingSeconds / 60);
            const seconds = remainingSeconds % 60;
            forceUpdateBtn.textContent = `Wait ${minutes}:${seconds.toString().padStart(2, '0')}`;
            remainingSeconds--;
        };
        // Initial update
        updateButtonText();
        // Update every second
        const intervalId = setInterval(() => {
            updateButtonText();
            if (remainingSeconds < 0) {
                clearInterval(intervalId);
            }
        }, 1000);
    }
    async checkForceUpdateCooldown() {
        try {
            const response = await fetch('/api/force-update/cooldown');
            const data = await response.json();
            if (data.inCooldown && data.remainingSeconds > 0) {
                this.startForceUpdateCooldownFromServer(data.remainingSeconds);
            }
        }
        catch (error) {
            console.error('Failed to check cooldown status:', error);
        }
    }
    startForceUpdateCooldownFromServer(remainingSeconds) {
        const forceUpdateBtn = document.getElementById('forceUpdateBtn');
        if (!forceUpdateBtn)
            return;
        let secondsLeft = remainingSeconds;
        const updateButtonText = () => {
            if (secondsLeft <= 0) {
                forceUpdateBtn.disabled = false;
                forceUpdateBtn.textContent = 'Force Update';
                return;
            }
            const minutes = Math.floor(secondsLeft / 60);
            const seconds = secondsLeft % 60;
            forceUpdateBtn.textContent = `Wait ${minutes}:${seconds.toString().padStart(2, '0')}`;
            forceUpdateBtn.disabled = true;
            secondsLeft--;
        };
        // Initial update
        updateButtonText();
        // Update every second
        const intervalId = setInterval(() => {
            updateButtonText();
            if (secondsLeft < 0) {
                clearInterval(intervalId);
            }
        }, 1000);
    }
}
// Initialize the client when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new DynamicDnsClient();
});
