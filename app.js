// ========================================
// WATER + ELECTROLYTE BALANCE TOOL
// Production-Ready Application
// All JavaScript Integrated
// ========================================

(function() {
    'use strict';

    // ========================================
    // CONFIGURATION & CONSTANTS
    // ========================================

    const CONFIG = {
        // Storage keys
        STORAGE_KEY: 'hydration_data',
        
        // Calculation constants
        BASE_WATER_PER_KG: 35, // ml per kg body weight
        EXERCISE_WATER_PER_HOUR: 500, // ml per hour
        
        // Safety limits
        MIN_WATER: 1500, // ml/day
        MAX_WATER: 10000, // ml/day
        DANGER_WATER: 5000, // ml/day - hyponatremia warning threshold
        
        // Electrolyte limits (mg/day)
        SODIUM: { min: 1500, max: 2300, danger: 5000 },
        POTASSIUM: { min: 2600, max: 3400, danger: 6000 },
        MAGNESIUM: { male: 420, female: 320, danger: 700 },
        CALCIUM: { young: 1000, senior: 1200, danger: 2500 },
        
        // Toast settings
        TOAST_DURATION: 4000, // ms
        MAX_TOASTS: 3,
        
        // Debounce delay
        DEBOUNCE_DELAY: 300, // ms
        
        // Weight conversion
        KG_TO_LBS: 2.20462,
        LBS_TO_KG: 0.453592
    };

    // ========================================
    // UTILITY FUNCTIONS
    // ========================================

    const Utils = {
        /**
         * Debounce function to limit execution rate
         */
        debounce(func, wait) {
            let timeout;
            return function executedFunction(...args) {
                const later = () => {
                    clearTimeout(timeout);
                    func(...args);
                };
                clearTimeout(timeout);
                timeout = setTimeout(later, wait);
            };
        },

        /**
         * Sanitize user input to prevent XSS
         */
        sanitize(str) {
            const div = document.createElement('div');
            div.textContent = str;
            return div.innerHTML;
        },

        /**
         * Format number with commas
         */
        formatNumber(num) {
            return Math.round(num).toLocaleString();
        },

        /**
         * Get current timestamp in ISO format
         */
        getTimestamp() {
            return new Date().toISOString();
        },

        /**
         * Get current date string (YYYY-MM-DD)
         */
        getDateString() {
            const now = new Date();
            return now.toISOString().split('T')[0];
        },

        /**
         * Get current time string (HH:MM)
         */
        getTimeString() {
            const now = new Date();
            return now.toLocaleTimeString('en-US', { 
                hour: '2-digit', 
                minute: '2-digit',
                hour12: false
            });
        },

        /**
         * Validate number within range
         */
        validateNumber(value, min, max) {
            const num = parseFloat(value);
            if (isNaN(num)) return { valid: false, error: 'Please enter a valid number' };
            if (num < min) return { valid: false, error: `Minimum value is ${min}` };
            if (num > max) return { valid: false, error: `Maximum value is ${max}` };
            return { valid: true, value: num };
        },

        /**
         * Check if localStorage is available
         */
        isLocalStorageAvailable() {
            try {
                const test = '__localStorage_test__';
                localStorage.setItem(test, test);
                localStorage.removeItem(test);
                return true;
            } catch (e) {
                return false;
            }
        }
    };

    // ========================================
    // STORAGE MANAGER
    // ========================================

    const StorageManager = {
        /**
         * Get data from localStorage
         */
        getData() {
            if (!Utils.isLocalStorageAvailable()) {
                console.warn('localStorage not available');
                return this.getDefaultData();
            }

            try {
                const data = localStorage.getItem(CONFIG.STORAGE_KEY);
                return data ? JSON.parse(data) : this.getDefaultData();
            } catch (error) {
                console.error('Error reading from localStorage:', error);
                return this.getDefaultData();
            }
        },

        /**
         * Save data to localStorage
         */
        saveData(data) {
            if (!Utils.isLocalStorageAvailable()) {
                console.warn('localStorage not available - data not persisted');
                return false;
            }

            try {
                localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(data));
                return true;
            } catch (error) {
                if (error.name === 'QuotaExceededError') {
                    ToastManager.show('Storage limit reached. Clearing old data...', 'warning');
                    this.clearOldData();
                    try {
                        localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(data));
                        return true;
                    } catch (e) {
                        console.error('Failed to save even after cleanup:', e);
                        return false;
                    }
                }
                console.error('Error saving to localStorage:', error);
                return false;
            }
        },

        /**
         * Get default data structure
         */
        getDefaultData() {
            return {
                userProfile: {},
                dailyGoals: {},
                tracking: {}
            };
        },

        /**
         * Clear old tracking data (>30 days)
         */
        clearOldData() {
            const data = this.getData();
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - 30);
            const cutoffString = cutoffDate.toISOString().split('T')[0];

            const tracking = data.tracking || {};
            const newTracking = {};
            
            for (const date in tracking) {
                if (date >= cutoffString) {
                    newTracking[date] = tracking[date];
                }
            }

            data.tracking = newTracking;
            this.saveData(data);
        },

        /**
         * Save user profile
         */
        saveProfile(profile) {
            const data = this.getData();
            data.userProfile = {
                ...profile,
                lastUpdated: Utils.getTimestamp()
            };
            return this.saveData(data);
        },

        /**
         * Save daily goals
         */
        saveGoals(goals) {
            const data = this.getData();
            data.dailyGoals = goals;
            return this.saveData(data);
        },

        /**
         * Get today's tracking data
         */
        getTodayTracking() {
            const data = this.getData();
            const today = Utils.getDateString();
            return data.tracking[today] || { waterIntake: [] };
        },

        /**
         * Save today's tracking data
         */
        saveTodayTracking(trackingData) {
            const data = this.getData();
            const today = Utils.getDateString();
            data.tracking[today] = trackingData;
            return this.saveData(data);
        },

        /**
         * Reset today's tracking
         */
        resetTodayTracking() {
            const data = this.getData();
            const today = Utils.getDateString();
            delete data.tracking[today];
            return this.saveData(data);
        }
    };

    // ========================================
    // TOAST NOTIFICATION MANAGER
    // ========================================

    const ToastManager = {
        container: null,
        activeToasts: new Map(),

        /**
         * Initialize toast container
         */
        init() {
            this.container = document.getElementById('toast-container');
            if (!this.container) {
                console.error('Toast container not found');
            }
        },

        /**
         * Show toast notification
         */
        show(message, type = 'info', duration = CONFIG.TOAST_DURATION) {
            if (!this.container) return;

            // Remove duplicate messages
            this.removeDuplicate(message);

            // Limit number of toasts
            if (this.activeToasts.size >= CONFIG.MAX_TOASTS) {
                const firstKey = this.activeToasts.keys().next().value;
                this.remove(firstKey);
            }

            const toast = this.createToast(message, type);
            const toastId = Date.now().toString();
            
            this.container.appendChild(toast);
            this.activeToasts.set(toastId, toast);

            // Auto-dismiss
            if (duration > 0) {
                setTimeout(() => this.remove(toastId), duration);
            }

            return toastId;
        },

        /**
         * Create toast element
         */
        createToast(message, type) {
            const toast = document.createElement('div');
            toast.className = `toast ${type}`;
            toast.setAttribute('role', 'alert');
            toast.setAttribute('aria-live', 'polite');

            const iconSvg = this.getIconSvg(type);
            
            toast.innerHTML = `
                <img src="${iconSvg}" alt="" class="toast-icon" aria-hidden="true">
                <div class="toast-content">
                    <p class="toast-message">${Utils.sanitize(message)}</p>
                </div>
                <button class="toast-close" aria-label="Close notification">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
                    </svg>
                </button>
            `;

            // Add close button listener
            const closeBtn = toast.querySelector('.toast-close');
            closeBtn.addEventListener('click', () => {
                const toastId = Array.from(this.activeToasts.entries())
                    .find(([_, t]) => t === toast)?.[0];
                if (toastId) this.remove(toastId);
            });

            return toast;
        },

        /**
         * Get icon SVG path based on type
         */
        getIconSvg(type) {
            const icons = {
                success: './assets/svgs/check.svg',
                error: './assets/svgs/warning.svg',
                warning: './assets/svgs/warning.svg',
                info: './assets/svgs/info.svg'
            };
            return icons[type] || icons.info;
        },

        /**
         * Remove toast
         */
        remove(toastId) {
            const toast = this.activeToasts.get(toastId);
            if (!toast) return;

            toast.classList.add('removing');
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
                this.activeToasts.delete(toastId);
            }, 250);
        },

        /**
         * Remove duplicate toast by message
         */
        removeDuplicate(message) {
            for (const [toastId, toast] of this.activeToasts.entries()) {
                const toastMessage = toast.querySelector('.toast-message');
                if (toastMessage && toastMessage.textContent === message) {
                    this.remove(toastId);
                }
            }
        }
    };

    // ========================================
    // CALCULATION ENGINE
    // ========================================

    const Calculator = {
        /**
         * Calculate water requirements
         */
        calculateWater(params) {
            const {
                weight, // in kg
                activityLevel,
                exerciseDuration, // in minutes
                exerciseIntensity,
                climate,
                altitude,
                pregnant,
                breastfeeding,
                illness,
                kidneyDisease
            } = params;

            // Base water requirement
            let waterRequirement = weight * CONFIG.BASE_WATER_PER_KG;

            // Activity level multiplier
            const activityMultipliers = {
                sedentary: 1.0,
                light: 1.1,
                moderate: 1.2,
                active: 1.3,
                athlete: 1.4
            };
            waterRequirement *= activityMultipliers[activityLevel] || 1.0;

            // Exercise adjustment
            const exerciseHours = exerciseDuration / 60;
            const intensityMultipliers = {
                low: 0.8,
                medium: 1.0,
                high: 1.3
            };
            const exerciseWater = exerciseHours * CONFIG.EXERCISE_WATER_PER_HOUR * 
                (intensityMultipliers[exerciseIntensity] || 1.0);
            waterRequirement += exerciseWater;

            // Climate adjustment
            const climateMultipliers = {
                cool: 1.0,
                moderate: 1.0,
                hot: 1.2,
                'very-hot': 1.4
            };
            waterRequirement *= climateMultipliers[climate] || 1.0;

            // Altitude adjustment
            const altitudeAdditions = {
                'sea-level': 0,
                moderate: 500,
                high: 1000
            };
            waterRequirement += altitudeAdditions[altitude] || 0;

            // Health conditions
            if (pregnant) waterRequirement += 300;
            if (breastfeeding) waterRequirement += 700;
            if (illness) waterRequirement += 1000;
            if (kidneyDisease) {
                // Cap at 2000ml for kidney disease
                waterRequirement = Math.min(waterRequirement, 2000);
            }

            // Apply safety limits
            waterRequirement = Math.max(CONFIG.MIN_WATER, waterRequirement);
            waterRequirement = Math.min(CONFIG.MAX_WATER, waterRequirement);

            return Math.round(waterRequirement);
        },

        /**
         * Calculate electrolyte requirements
         */
        calculateElectrolytes(params) {
            const {
                gender,
                age,
                weight,
                exerciseDuration,
                exerciseIntensity,
                climate
            } = params;

            // Base requirements
            let sodium = 2000;
            let potassium = gender === 'male' ? 3400 : 2600;
            let magnesium = gender === 'male' ? CONFIG.MAGNESIUM.male : CONFIG.MAGNESIUM.female;
            let calcium = age >= 65 ? CONFIG.CALCIUM.senior : CONFIG.CALCIUM.young;

            // Exercise adjustments (sweat loss)
            const exerciseHours = exerciseDuration / 60;
            const intensityMultipliers = {
                low: 0.5,
                medium: 1.0,
                high: 1.5
            };
            const sweatMultiplier = intensityMultipliers[exerciseIntensity] || 1.0;
            
            // Sodium loss in sweat (500-7000mg per hour depending on intensity)
            sodium += exerciseHours * 1000 * sweatMultiplier;

            // Potassium loss in sweat
            potassium += exerciseHours * 200 * sweatMultiplier;

            // Climate adjustments
            const climateMultipliers = {
                cool: 1.0,
                moderate: 1.0,
                hot: 1.15,
                'very-hot': 1.3
            };
            const climateMultiplier = climateMultipliers[climate] || 1.0;
            sodium *= climateMultiplier;
            potassium *= climateMultiplier;

            // Cap at danger levels
            sodium = Math.min(sodium, CONFIG.SODIUM.danger - 100);
            potassium = Math.min(potassium, CONFIG.POTASSIUM.danger - 100);
            magnesium = Math.min(magnesium, CONFIG.MAGNESIUM.danger - 100);
            calcium = Math.min(calcium, CONFIG.CALCIUM.danger - 100);

            return {
                sodium: Math.round(sodium),
                potassium: Math.round(potassium),
                magnesium: Math.round(magnesium),
                calcium: Math.round(calcium)
            };
        },

        /**
         * Generate personalized recommendations
         */
        generateRecommendations(params, waterRequirement, electrolytes) {
            const recommendations = [];

            // Water distribution
            recommendations.push({
                type: 'info',
                text: `Distribute your ${Utils.formatNumber(waterRequirement)}ml throughout the day. Aim for ${Math.round(waterRequirement / 8)}ml every 1-2 hours while awake.`
            });

            // High water warning
            if (waterRequirement >= CONFIG.DANGER_WATER) {
                recommendations.push({
                    type: 'warning',
                    text: 'High water intake detected. Be mindful of electrolyte balance. Consider sports drinks or electrolyte supplements during intense exercise.'
                });
            }

            // Kidney disease warning
            if (params.kidneyDisease) {
                recommendations.push({
                    type: 'warning',
                    text: 'You indicated kidney disease. Water intake has been capped at 2000ml. Please consult your healthcare provider for personalized guidance.'
                });
            }

            // Exercise-specific advice
            if (params.exerciseDuration > 60) {
                recommendations.push({
                    type: 'info',
                    text: 'For exercise longer than 60 minutes, consume 150-250ml of water every 15-20 minutes. Consider electrolyte drinks.'
                });
            }

            // Climate advice
            if (params.climate === 'hot' || params.climate === 'very-hot') {
                recommendations.push({
                    type: 'warning',
                    text: 'Hot climate detected. Monitor for signs of dehydration: dark urine, dizziness, fatigue. Increase intake if needed.'
                });
            }

            // Sodium advice
            if (electrolytes.sodium > 3000) {
                recommendations.push({
                    type: 'info',
                    text: 'High sodium requirement due to exercise/climate. Good sources: sports drinks, salted nuts, pickles, broth.'
                });
            }

            // Potassium-rich foods
            recommendations.push({
                type: 'info',
                text: `Potassium sources: bananas, sweet potatoes, spinach, avocado, beans. Target: ${Utils.formatNumber(electrolytes.potassium)}mg/day.`
            });

            // Magnesium sources
            recommendations.push({
                type: 'info',
                text: `Magnesium sources: almonds, spinach, black beans, dark chocolate, pumpkin seeds. Target: ${electrolytes.magnesium}mg/day.`
            });

            return recommendations;
        },

        /**
         * Validate inconsistencies in user input
         */
        validateConsistency(params) {
            const warnings = [];

            // Sedentary with high exercise
            if (params.activityLevel === 'sedentary' && params.exerciseDuration > 60) {
                warnings.push('You selected "Sedentary" but indicated significant exercise. Consider selecting a higher activity level.');
            }

            // Very young with intense exercise
            if (params.age < 12 && params.exerciseIntensity === 'high') {
                warnings.push('High-intensity exercise for children under 12 should be supervised. Consult a pediatrician.');
            }

            // Multiple health conditions
            const healthConditions = [
                params.pregnant,
                params.breastfeeding,
                params.illness,
                params.kidneyDisease
            ].filter(Boolean).length;

            if (healthConditions >= 2) {
                warnings.push('Multiple health conditions detected. Please consult your healthcare provider for personalized hydration guidance.');
            }

            return warnings;
        }
    };

    // ========================================
    // FORM VALIDATOR
    // ========================================

    const FormValidator = {
        /**
         * Validate weight input
         */
        validateWeight(weight, unit) {
            const min = unit === 'kg' ? 20 : 44;
            const max = unit === 'kg' ? 300 : 661;
            return Utils.validateNumber(weight, min, max);
        },

        /**
         * Validate age input
         */
        validateAge(age) {
            return Utils.validateNumber(age, 1, 120);
        },

        /**
         * Validate exercise duration
         */
        validateExerciseDuration(duration) {
            return Utils.validateNumber(duration, 0, 1440);
        },

        /**
         * Show error message
         */
        showError(elementId, message) {
            const errorElement = document.getElementById(`${elementId}-error`);
            if (errorElement) {
                errorElement.textContent = message;
                errorElement.setAttribute('role', 'alert');
            }
        },

        /**
         * Clear error message
         */
        clearError(elementId) {
            const errorElement = document.getElementById(`${elementId}-error`);
            if (errorElement) {
                errorElement.textContent = '';
                errorElement.removeAttribute('role');
            }
        },

        /**
         * Validate all form inputs
         */
        validateForm() {
            let isValid = true;

            // Validate weight
            const weight = document.getElementById('weight').value;
            const weightUnit = document.querySelector('.unit-btn.active').dataset.unit;
            const weightValidation = this.validateWeight(weight, weightUnit);
            
            if (!weightValidation.valid) {
                this.showError('weight', weightValidation.error);
                isValid = false;
            } else {
                this.clearError('weight');
            }

            // Validate age
            const age = document.getElementById('age').value;
            const ageValidation = this.validateAge(age);
            
            if (!ageValidation.valid) {
                this.showError('age', ageValidation.error);
                isValid = false;
            } else {
                this.clearError('age');
            }

            // Required fields
            const requiredFields = ['gender', 'activity-level', 'climate'];
            requiredFields.forEach(fieldId => {
                const field = document.getElementById(fieldId);
                if (!field.value) {
                    ToastManager.show(`Please select ${field.previousElementSibling.textContent}`, 'error');
                    isValid = false;
                }
            });

            return isValid;
        }
    };

    // ========================================
    // UI MANAGER
    // ========================================

    const UIManager = {
        /**
         * Initialize UI event listeners
         */
        init() {
            this.setupWeightToggle();
            this.setupCalculateButton();
            this.setupTracking();
            this.loadSavedData();
        },

        /**
         * Setup weight unit toggle
         */
        setupWeightToggle() {
            const toggleButtons = document.querySelectorAll('.unit-btn');
            const weightInput = document.getElementById('weight');

            toggleButtons.forEach(btn => {
                btn.addEventListener('click', () => {
                    // Update active state
                    toggleButtons.forEach(b => {
                        b.classList.remove('active');
                        b.setAttribute('aria-pressed', 'false');
                    });
                    btn.classList.add('active');
                    btn.setAttribute('aria-pressed', 'true');

                    // Convert weight value
                    const currentValue = parseFloat(weightInput.value);
                    if (!isNaN(currentValue) && currentValue > 0) {
                        const newUnit = btn.dataset.unit;
                        const oldUnit = newUnit === 'kg' ? 'lbs' : 'kg';
                        
                        let convertedValue;
                        if (newUnit === 'kg') {
                            convertedValue = currentValue * CONFIG.LBS_TO_KG;
                        } else {
                            convertedValue = currentValue * CONFIG.KG_TO_LBS;
                        }
                        
                        weightInput.value = convertedValue.toFixed(1);
                    }
                });
            });
        },

        /**
         * Setup calculate button
         */
        setupCalculateButton() {
            const calculateBtn = document.getElementById('calculate-btn');
            
            calculateBtn.addEventListener('click', () => {
                this.handleCalculate();
            });
        },

        /**
         * Handle calculation
         */
        handleCalculate() {
            // Validate form
            if (!FormValidator.validateForm()) {
                return;
            }

            // Gather form data
            const params = this.gatherFormData();

            // Validate consistency
            const warnings = Calculator.validateConsistency(params);
            warnings.forEach(warning => {
                ToastManager.show(warning, 'warning', 6000);
            });

            // Calculate requirements
            const waterRequirement = Calculator.calculateWater(params);
            const electrolytes = Calculator.calculateElectrolytes(params);
            const recommendations = Calculator.generateRecommendations(params, waterRequirement, electrolytes);

            // Save to storage
            StorageManager.saveProfile(params);
            StorageManager.saveGoals({
                water: waterRequirement,
                ...electrolytes
            });

            // Display results
            this.displayResults(waterRequirement, electrolytes, recommendations);

            // Initialize tracking
            this.initializeTracking(waterRequirement);

            // Show success message
            ToastManager.show('Requirements calculated successfully!', 'success');

            // Scroll to results
            document.getElementById('results-section').scrollIntoView({ 
                behavior: 'smooth', 
                block: 'start' 
            });
        },

        /**
         * Gather form data
         */
        gatherFormData() {
            const weightInput = document.getElementById('weight').value;
            const weightUnit = document.querySelector('.unit-btn.active').dataset.unit;
            
            // Convert weight to kg
            let weight = parseFloat(weightInput);
            if (weightUnit === 'lbs') {
                weight *= CONFIG.LBS_TO_KG;
            }

            return {
                weight: weight,
                age: parseInt(document.getElementById('age').value),
                gender: document.getElementById('gender').value,
                activityLevel: document.getElementById('activity-level').value,
                exerciseDuration: parseInt(document.getElementById('exercise-duration').value) || 0,
                exerciseIntensity: document.getElementById('exercise-intensity').value,
                climate: document.getElementById('climate').value,
                altitude: document.getElementById('altitude').value,
                pregnant: document.getElementById('pregnant').checked,
                breastfeeding: document.getElementById('breastfeeding').checked,
                illness: document.getElementById('illness').checked,
                kidneyDisease: document.getElementById('kidney-disease').checked
            };
        },

        /**
         * Display calculation results
         */
        displayResults(waterRequirement, electrolytes, recommendations) {
            // Show results section
            const resultsSection = document.getElementById('results-section');
            resultsSection.style.display = 'block';

            // Display water requirement
            document.getElementById('water-amount').textContent = Utils.formatNumber(waterRequirement);
            const cups = Math.round(waterRequirement / 250);
            document.getElementById('water-cups').textContent = `${cups} cups (250ml each)`;

            // Display electrolytes
            document.getElementById('sodium-amount').textContent = Utils.formatNumber(electrolytes.sodium);
            document.getElementById('potassium-amount').textContent = Utils.formatNumber(electrolytes.potassium);
            document.getElementById('magnesium-amount').textContent = electrolytes.magnesium;
            document.getElementById('calcium-amount').textContent = Utils.formatNumber(electrolytes.calcium);

            // Display recommendations
            const recommendationsContainer = document.getElementById('recommendations');
            recommendationsContainer.innerHTML = recommendations.map(rec => `
                <div class="recommendation-item">
                    <img src="./assets/svgs/${rec.type}.svg" alt="" class="recommendation-icon ${rec.type}" aria-hidden="true">
                    <p class="recommendation-text">${Utils.sanitize(rec.text)}</p>
                </div>
            `).join('');
        },

        /**
         * Initialize tracking section
         */
        initializeTracking(waterRequirement) {
            const trackerSection = document.getElementById('tracker-section');
            trackerSection.style.display = 'block';

            // Update target
            document.getElementById('target-intake').textContent = `/ ${Utils.formatNumber(waterRequirement)} ml`;

            // Load today's tracking
            const todayData = StorageManager.getTodayTracking();
            this.updateTrackingUI(todayData, waterRequirement);
        },

        /**
         * Setup tracking functionality
         */
        setupTracking() {
            const addIntakeBtn = document.getElementById('add-intake-btn');
            const intakeInput = document.getElementById('intake-amount');
            const quickBtns = document.querySelectorAll('.quick-btn');
            const resetBtn = document.getElementById('reset-tracker-btn');

            // Add intake button
            addIntakeBtn.addEventListener('click', () => {
                const amount = parseInt(intakeInput.value);
                if (this.validateIntakeAmount(amount)) {
                    this.addIntake(amount);
                    intakeInput.value = '';
                }
            });

            // Enter key on input
            intakeInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    addIntakeBtn.click();
                }
            });

            // Quick add buttons
            quickBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    const amount = parseInt(btn.dataset.amount);
                    this.addIntake(amount);
                });
            });

            // Reset button
            resetBtn.addEventListener('click', () => {
                if (confirm('Are you sure you want to reset today\'s tracking?')) {
                    StorageManager.resetTodayTracking();
                    this.updateTrackingUI({ waterIntake: [] }, this.getCurrentGoal());
                    ToastManager.show('Tracking reset successfully', 'success');
                }
            });
        },

        /**
         * Validate intake amount
         */
        validateIntakeAmount(amount) {
            if (isNaN(amount) || amount <= 0) {
                ToastManager.show('Please enter a valid amount', 'error');
                return false;
            }

            if (amount > 5000) {
                ToastManager.show('Amount seems too large. Maximum 5000ml per entry', 'error');
                return false;
            }

            return true;
        },

        /**
         * Add water intake
         */
        addIntake(amount) {
            const todayData = StorageManager.getTodayTracking();
            
            const intakeEntry = {
                amount: amount,
                time: Utils.getTimeString(),
                timestamp: Utils.getTimestamp()
            };

            todayData.waterIntake = todayData.waterIntake || [];
            todayData.waterIntake.push(intakeEntry);

            StorageManager.saveTodayTracking(todayData);
            this.updateTrackingUI(todayData, this.getCurrentGoal());

            ToastManager.show(`Added ${amount}ml to your intake`, 'success');
        },

        /**
         * Delete water intake entry
         */
        deleteIntake(index) {
            const todayData = StorageManager.getTodayTracking();
            todayData.waterIntake.splice(index, 1);
            StorageManager.saveTodayTracking(todayData);
            this.updateTrackingUI(todayData, this.getCurrentGoal());
            ToastManager.show('Entry deleted', 'info');
        },

        /**
         * Update tracking UI
         */
        updateTrackingUI(todayData, goal) {
            const waterIntake = todayData.waterIntake || [];
            const totalIntake = waterIntake.reduce((sum, entry) => sum + entry.amount, 0);

            // Update progress
            document.getElementById('current-intake').textContent = `${Utils.formatNumber(totalIntake)} ml`;
            
            const progressPercentage = goal > 0 ? Math.min((totalIntake / goal) * 100, 100) : 0;
            document.getElementById('progress-percentage').textContent = `${Math.round(progressPercentage)}%`;
            
            const progressFill = document.getElementById('progress-fill');
            progressFill.style.width = `${progressPercentage}%`;
            progressFill.setAttribute('aria-valuenow', Math.round(progressPercentage));

            // Update intake list
            this.updateIntakeList(waterIntake);

            // Check if goal reached
            if (totalIntake >= goal && goal > 0) {
                ToastManager.show('Congratulations! You\'ve reached your daily water goal!', 'success', 6000);
            }
        },

        /**
         * Update intake list
         */
        updateIntakeList(waterIntake) {
            const intakeList = document.getElementById('intake-list');
            
            if (waterIntake.length === 0) {
                intakeList.innerHTML = '<p class="empty-state">No water intake recorded yet. Add your first entry!</p>';
                return;
            }

            // Sort by timestamp (newest first)
            const sortedIntake = [...waterIntake].sort((a, b) => 
                new Date(b.timestamp) - new Date(a.timestamp)
            );

            intakeList.innerHTML = sortedIntake.map((entry, index) => `
                <div class="intake-item">
                    <div class="intake-info">
                        <span class="intake-amount">${entry.amount}ml</span>
                        <span class="intake-time">${entry.time}</span>
                    </div>
                    <button class="delete-btn" data-index="${waterIntake.indexOf(entry)}" aria-label="Delete entry">
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                            <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/>
                        </svg>
                    </button>
                </div>
            `).join('');

            // Add delete listeners
            intakeList.querySelectorAll('.delete-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const index = parseInt(btn.dataset.index);
                    this.deleteIntake(index);
                });
            });
        },

        /**
         * Get current water goal
         */
        getCurrentGoal() {
            const data = StorageManager.getData();
            return data.dailyGoals?.water || 0;
        },

        /**
         * Load saved data on page load
         */
        loadSavedData() {
            const data = StorageManager.getData();
            
            if (data.userProfile && Object.keys(data.userProfile).length > 0) {
                this.populateForm(data.userProfile);
            }

            if (data.dailyGoals && data.dailyGoals.water) {
                this.displayResults(
                    data.dailyGoals.water,
                    {
                        sodium: data.dailyGoals.sodium || 0,
                        potassium: data.dailyGoals.potassium || 0,
                        magnesium: data.dailyGoals.magnesium || 0,
                        calcium: data.dailyGoals.calcium || 0
                    },
                    []
                );
                this.initializeTracking(data.dailyGoals.water);
            }
        },

        /**
         * Populate form with saved data
         */
        populateForm(profile) {
            // Weight - store in kg, display in user's preferred unit
            const weightUnit = document.querySelector('.unit-btn.active').dataset.unit;
            let displayWeight = profile.weight;
            if (weightUnit === 'lbs') {
                displayWeight *= CONFIG.KG_TO_LBS;
            }
            document.getElementById('weight').value = displayWeight.toFixed(1);

            // Other fields
            if (profile.age) document.getElementById('age').value = profile.age;
            if (profile.gender) document.getElementById('gender').value = profile.gender;
            if (profile.activityLevel) document.getElementById('activity-level').value = profile.activityLevel;
            if (profile.exerciseDuration !== undefined) document.getElementById('exercise-duration').value = profile.exerciseDuration;
            if (profile.exerciseIntensity) document.getElementById('exercise-intensity').value = profile.exerciseIntensity;
            if (profile.climate) document.getElementById('climate').value = profile.climate;
            if (profile.altitude) document.getElementById('altitude').value = profile.altitude;

            // Checkboxes
            document.getElementById('pregnant').checked = profile.pregnant || false;
            document.getElementById('breastfeeding').checked = profile.breastfeeding || false;
            document.getElementById('illness').checked = profile.illness || false;
            document.getElementById('kidney-disease').checked = profile.kidneyDisease || false;
        }
    };

    // ========================================
    // INITIALIZATION
    // ========================================

    /**
     * Initialize application when DOM is ready
     */
    function initializeApp() {
        // Initialize managers
        ToastManager.init();
        UIManager.init();

        // Check for midnight rollover
        checkMidnightRollover();

        console.log('Water + Electrolyte Balance Tool initialized successfully');
    }

    /**
     * Check for date change and reset tracking if needed
     */
    function checkMidnightRollover() {
        const lastDate = localStorage.getItem('last_active_date');
        const currentDate = Utils.getDateString();

        if (lastDate && lastDate !== currentDate) {
            // Date has changed - tracking will automatically use new date
            console.log('New day detected - tracking reset');
        }

        localStorage.setItem('last_active_date', currentDate);
    }

    // ========================================
    // EVENT LISTENERS
    // ========================================

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeApp);
    } else {
        initializeApp();
    }

    // Handle page visibility changes
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            checkMidnightRollover();
            
            // Refresh tracking UI if goals exist
            const goal = UIManager.getCurrentGoal();
            if (goal > 0) {
                const todayData = StorageManager.getTodayTracking();
                UIManager.updateTrackingUI(todayData, goal);
            }
        }
    });

    // Handle window beforeunload
    window.addEventListener('beforeunload', () => {
        // Cleanup if needed
        console.log('Page unloading - data saved');
    });

})();