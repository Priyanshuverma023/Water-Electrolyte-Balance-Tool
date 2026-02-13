
(function() {
    'use strict';

    // configuration constants
    const CONFIG = {
        // Storage keys
        STORAGE_KEY: 'hydration_data',
        
        // Calculation constants
        BASE_WATER_PER_KG: 35,
        EXERCISE_WATER_PER_HOUR: 500,
        
        // Safety limits
        MIN_WATER: 1500,
        MAX_WATER: 10000,
        DANGER_WATER: 5000,
        
        // Electrolyte limits (mg/day)
        SODIUM: { min: 1500, max: 2300, danger: 5000 },
        POTASSIUM: { min: 2600, max: 3400, danger: 6000 },
        MAGNESIUM: { male: 420, female: 320, danger: 700 },
        CALCIUM: { young: 1000, senior: 1200, danger: 2500 },
        
        // Toast settings
        TOAST_DURATION: 4000,
        MAX_TOASTS: 3,
        
        // Debounce delay
        DEBOUNCE_DELAY: 300,
        
        // Weight conversion
        KG_TO_LBS: 2.20462,
        LBS_TO_KG: 0.453592
    };

    // utility functions
    const Utils = {
        // debounce function to limit execution rate
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

        // sanitize user input to prevent XSS
        sanitize(str) {
            const div = document.createElement('div');
            div.textContent = str;
            return div.innerHTML;
        },

        // format number with commas
        formatNumber(num) {
            return Math.round(num).toLocaleString();
        },

        // get current timestamp in ISO format
        getTimestamp() {
            return new Date().toISOString();
        },

        // get current date string (YYYY-MM-DD)
        getDateString() {
            const now = new Date();
            return now.toISOString().split('T')[0];
        },

        // get current time string (HH:MM)
        getTimeString() {
            const now = new Date();
            return now.toLocaleTimeString('en-US', { 
                hour: '2-digit', 
                minute: '2-digit',
                hour12: false
            });
        },

        // validate number within range
        validateNumber(value, min, max) {
            const num = parseFloat(value);
            if (isNaN(num)) return { valid: false, error: 'Please enter a valid number' };
            if (num < min) return { valid: false, error: `Minimum value is ${min}` };
            if (num > max) return { valid: false, error: `Maximum value is ${max}` };
            return { valid: true, value: num };
        },

        // check if localStorage is available
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

    // localStorage manager
    const StorageManager = {
        // get data from localStorage
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

        // save data to localStorage
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

        // get default data structure
        getDefaultData() {
            return {
                userProfile: {},
                dailyGoals: {},
                tracking: {}
            };
        },

        // clear old tracking data (>30 days)
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

        // save user profile
        saveProfile(profile) {
            const data = this.getData();
            data.userProfile = {
                ...profile,
                lastUpdated: Utils.getTimestamp()
            };
            return this.saveData(data);
        },

        // save daily goals
        saveGoals(goals) {
            const data = this.getData();
            data.dailyGoals = goals;
            return this.saveData(data);
        },

        // get today's tracking data
        getTodayTracking() {
            const data = this.getData();
            const today = Utils.getDateString();
            return data.tracking[today] || { waterIntake: [] };
        },

        // save today's tracking data
        saveTodayTracking(trackingData) {
            const data = this.getData();
            const today = Utils.getDateString();
            data.tracking[today] = trackingData;
            return this.saveData(data);
        },

        // reset today's tracking
        resetTodayTracking() {
            const data = this.getData();
            const today = Utils.getDateString();
            delete data.tracking[today];
            return this.saveData(data);
        }
    };

    // toast notification manager
    const ToastManager = {
        container: null,
        activeToasts: new Map(),
        toastQueue: [],

        // initialize toast container
        init() {
            this.container = document.getElementById('toast-container');
            if (!this.container) {
                console.error('Toast container not found');
            }
        },

        // show toast notification
        show(message, type = 'info', duration = CONFIG.TOAST_DURATION) {
            if (!this.container) return;

            // clear existing toasts
            this.container.innerHTML = '';
            this.activeToasts.clear();

            const toastId = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            const toast = this.createToast(message, type, toastId);
            
            this.container.appendChild(toast);
            this.activeToasts.set(toastId, { element: toast, message: message });

            // trigger show animation
            setTimeout(() => {
                toast.classList.add('show');
            }, 10);

            // auto-dismiss after duration
            if (duration > 0) {
                setTimeout(() => this.remove(toastId), duration);
            }

            return toastId;
        },

        // show confirmation toast with action buttons
        showConfirm(message, onConfirm, onCancel, type = 'info') {
            if (!this.container) return;

            this.container.innerHTML = '';
            this.activeToasts.clear();

            const toastId = `toast-confirm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            const toast = this.createConfirmToast(message, type, toastId, onConfirm, onCancel);
            
            this.container.appendChild(toast);
            this.activeToasts.set(toastId, { element: toast, message: message });

            setTimeout(() => {
                toast.classList.add('show');
            }, 10);

            return toastId;
        },

        // create toast element
        createToast(message, type, toastId) {
            const toast = document.createElement('div');
            toast.className = `toast ${type}`;
            toast.setAttribute('role', 'alert');
            toast.setAttribute('aria-live', 'polite');
            toast.setAttribute('data-toast-id', toastId);

            const iconSvg = this.getIconSvg(type);
            
            toast.innerHTML = `
                <img src="${iconSvg}" alt="" class="toast-icon" aria-hidden="true">
                <div class="toast-content">
                    <p class="toast-message">${Utils.sanitize(message)}</p>
                </div>
                <button type="button" class="toast-close" aria-label="Close notification">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
                    </svg>
                </button>
            `;

            const closeBtn = toast.querySelector('.toast-close');
            closeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.remove(toastId);
            });

            return toast;
        },

        // create confirmation toast with Yes/No buttons
        createConfirmToast(message, type, toastId, onConfirm, onCancel) {
            const toast = document.createElement('div');
            toast.className = `toast toast-confirm ${type}`;
            toast.setAttribute('role', 'alertdialog');
            toast.setAttribute('aria-live', 'assertive');
            toast.setAttribute('data-toast-id', toastId);

            const iconSvg = this.getIconSvg(type);
            
            toast.innerHTML = `
                <img src="${iconSvg}" alt="" class="toast-icon" aria-hidden="true">
                <div class="toast-content">
                    <p class="toast-message">${Utils.sanitize(message)}</p>
                    <div class="toast-actions">
                        <button type="button" class="toast-btn toast-btn-confirm">Yes</button>
                        <button type="button" class="toast-btn toast-btn-cancel">No</button>
                    </div>
                </div>
                <button type="button" class="toast-close" aria-label="Close notification">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
                    </svg>
                </button>
            `;

            const confirmBtn = toast.querySelector('.toast-btn-confirm');
            const cancelBtn = toast.querySelector('.toast-btn-cancel');
            const closeBtn = toast.querySelector('.toast-close');

            confirmBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.remove(toastId);
                if (onConfirm) onConfirm();
            });

            cancelBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.remove(toastId);
                if (onCancel) onCancel();
            });

            closeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.remove(toastId);
                if (onCancel) onCancel();
            });

            return toast;
        },

        // get icon SVG path based on type
        getIconSvg(type) {
            const icons = {
                success: './assets/svgs/check.svg',
                error: './assets/svgs/warning.svg',
                warning: './assets/svgs/warning.svg',
                info: './assets/svgs/info.svg'
            };
            return icons[type] || icons.info;
        },

        // remove toast by ID
        remove(toastId) {
            const toastData = this.activeToasts.get(toastId);
            if (!toastData) return;

            const toast = toastData.element;
            
            toast.classList.remove('show');
            toast.classList.add('removing');
            
            setTimeout(() => {
                if (toast && toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
                this.activeToasts.delete(toastId);
            }, 300);
        },

        // clear all toasts
        clearAll() {
            const toastIds = Array.from(this.activeToasts.keys());
            toastIds.forEach(id => this.remove(id));
        }
    };

    // PDF report generator
    const ReportGenerator = {
        // generate and download PDF report
        async generateReport() {
            try {
                const { jsPDF } = window.jspdf;
                
                if (!jsPDF) {
                    ToastManager.show('PDF library not loaded. Please refresh the page.', 'error');
                    return;
                }

                const data = StorageManager.getData();
                const profile = data.userProfile || {};
                const goals = data.dailyGoals || {};
                const tracking = StorageManager.getTodayTracking();

                if (!goals.water) {
                    ToastManager.show('Please calculate your requirements first', 'warning');
                    return;
                }

                ToastManager.show('Generating PDF report...', 'info', 2000);

                const doc = new jsPDF();
                const pageWidth = doc.internal.pageSize.getWidth();
                const pageHeight = doc.internal.pageSize.getHeight();
                let yPos = 20;

                // colors
                const primaryColor = [255, 198, 47];
                const textColor = [26, 26, 26];
                const secondaryColor = [107, 114, 128];
                const accentColor = [102, 126, 234];

                // header
                doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
                doc.rect(0, 0, pageWidth, 40, 'F');
                
                doc.setFontSize(28);
                doc.setTextColor(26, 26, 26);
                doc.setFont(undefined, 'bold');
                doc.text('Hydration+ Report', pageWidth / 2, 25, { align: 'center' });

                // subtitle
                doc.setFontSize(12);
                doc.setFont(undefined, 'normal');
                doc.text('Personalized Water & Electrolyte Balance', pageWidth / 2, 33, { align: 'center' });

                yPos = 50;

                // date and time
                doc.setFontSize(10);
                doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
                const reportDate = new Date().toLocaleDateString('en-US', { 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                });
                doc.text(`Generated: ${reportDate}`, 15, yPos);
                yPos += 15;

                // personal information section
                this.addSectionHeader(doc, 'Personal Information', yPos, accentColor);
                yPos += 10;

                doc.setFontSize(11);
                doc.setTextColor(textColor[0], textColor[1], textColor[2]);
                
                const personalInfo = [
                    `Weight: ${profile.weight ? profile.weight.toFixed(1) + ' kg' : 'N/A'}`,
                    `Age: ${profile.age || 'N/A'} years`,
                    `Gender: ${profile.gender ? profile.gender.charAt(0).toUpperCase() + profile.gender.slice(1) : 'N/A'}`,
                    `Activity Level: ${this.formatActivityLevel(profile.activityLevel)}`,
                    `Exercise: ${profile.exerciseDuration || 0} min/day (${profile.exerciseIntensity || 'medium'} intensity)`,
                    `Climate: ${this.formatClimate(profile.climate)}`,
                    `Altitude: ${this.formatAltitude(profile.altitude)}`
                ];

                personalInfo.forEach(info => {
                    doc.text(info, 20, yPos);
                    yPos += 7;
                });

                yPos += 5;

                // daily requirements section
                this.addSectionHeader(doc, 'Daily Requirements', yPos, accentColor);
                yPos += 10;

                // water requirement box
                doc.setFillColor(102, 126, 234, 0.1);
                doc.roundedRect(15, yPos - 5, pageWidth - 30, 25, 3, 3, 'F');
                
                doc.setFontSize(14);
                doc.setFont(undefined, 'bold');
                doc.setTextColor(accentColor[0], accentColor[1], accentColor[2]);
                doc.text('Water Intake', 20, yPos + 5);
                
                doc.setFontSize(20);
                doc.text(`${Utils.formatNumber(goals.water)} ml/day`, pageWidth - 20, yPos + 5, { align: 'right' });
                
                doc.setFontSize(10);
                doc.setFont(undefined, 'normal');
                doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
                const cups = Math.round(goals.water / 250);
                doc.text(`Approximately ${cups} cups (250ml each)`, 20, yPos + 14);

                yPos += 35;

                // electrolytes grid
                doc.setFontSize(12);
                doc.setFont(undefined, 'bold');
                doc.setTextColor(textColor[0], textColor[1], textColor[2]);
                doc.text('Electrolytes', 20, yPos);
                yPos += 8;

                const electrolytes = [
                    { name: 'Sodium', value: goals.sodium, unit: 'mg' },
                    { name: 'Potassium', value: goals.potassium, unit: 'mg' },
                    { name: 'Magnesium', value: goals.magnesium, unit: 'mg' },
                    { name: 'Calcium', value: goals.calcium, unit: 'mg' }
                ];

                const colWidth = (pageWidth - 40) / 2;
                let col = 0;

                electrolytes.forEach((electrolyte, index) => {
                    const xPos = 20 + (col * colWidth);
                    
                    doc.setFillColor(245, 244, 237);
                    doc.roundedRect(xPos, yPos - 4, colWidth - 5, 18, 2, 2, 'F');
                    
                    doc.setFontSize(11);
                    doc.setFont(undefined, 'bold');
                    doc.setTextColor(textColor[0], textColor[1], textColor[2]);
                    doc.text(electrolyte.name, xPos + 5, yPos + 4);
                    
                    doc.setFont(undefined, 'normal');
                    doc.text(`${Utils.formatNumber(electrolyte.value)} ${electrolyte.unit}`, xPos + 5, yPos + 11);
                    
                    col++;
                    if (col >= 2) {
                        col = 0;
                        yPos += 22;
                    }
                });

                if (col !== 0) yPos += 22;

                yPos += 5;

                // today's tracking section
                if (tracking.waterIntake && tracking.waterIntake.length > 0) {
                    this.addSectionHeader(doc, 'Today\'s Water Tracking', yPos, accentColor);
                    yPos += 10;

                    const totalIntake = tracking.waterIntake.reduce((sum, entry) => sum + entry.amount, 0);
                    const percentage = goals.water > 0 ? Math.min((totalIntake / goals.water) * 100, 100) : 0;

                    // progress bar
                    doc.setFillColor(224, 223, 213);
                    doc.roundedRect(20, yPos, pageWidth - 40, 12, 2, 2, 'F');
                    
                    doc.setFillColor(74, 222, 128);
                    const progressWidth = ((pageWidth - 40) * percentage) / 100;
                    doc.roundedRect(20, yPos, progressWidth, 12, 2, 2, 'F');
                    
                    doc.setFontSize(10);
                    doc.setTextColor(textColor[0], textColor[1], textColor[2]);
                    doc.text(`${Utils.formatNumber(totalIntake)} ml / ${Utils.formatNumber(goals.water)} ml (${Math.round(percentage)}%)`, 
                        pageWidth / 2, yPos + 8, { align: 'center' });

                    yPos += 20;

                    // all entries
                    doc.setFontSize(10);
                    doc.setFont(undefined, 'bold');
                    doc.text(`Today's Log (${tracking.waterIntake.length} entries):`, 20, yPos);
                    yPos += 7;

                    doc.setFont(undefined, 'normal');
                    doc.setFontSize(9);
                    
                    const allEntries = [...tracking.waterIntake].reverse();
                    
                    allEntries.forEach((entry, index) => {
                        if (yPos > pageHeight - 30) {
                            doc.addPage();
                            yPos = 20;
                            doc.setFontSize(10);
                            doc.setFont(undefined, 'bold');
                            doc.text('Today\'s Log (continued):', 20, yPos);
                            yPos += 7;
                            doc.setFont(undefined, 'normal');
                            doc.setFontSize(9);
                        }
                        
                        doc.text(`${index + 1}. ${entry.amount}ml at ${entry.time}`, 25, yPos);
                        yPos += 5;
                    });

                    yPos += 5;
                }

                // recommendations section
                const recommendations = Calculator.generateRecommendations(profile, goals.water, {
                    sodium: goals.sodium,
                    potassium: goals.potassium,
                    magnesium: goals.magnesium,
                    calcium: goals.calcium
                });

                if (recommendations.length > 0) {
                    if (yPos > pageHeight - 60) {
                        doc.addPage();
                        yPos = 20;
                    }

                    this.addSectionHeader(doc, 'Personalized Recommendations', yPos, accentColor);
                    yPos += 10;

                    doc.setFontSize(9);
                    doc.setFont(undefined, 'normal');
                    doc.setTextColor(textColor[0], textColor[1], textColor[2]);

                    recommendations.forEach((rec, index) => {
                        if (yPos > pageHeight - 40) {
                            doc.addPage();
                            yPos = 20;
                            doc.setFontSize(10);
                            doc.setFont(undefined, 'bold');
                            doc.text('Recommendations (continued):', 20, yPos);
                            yPos += 7;
                            doc.setFont(undefined, 'normal');
                            doc.setFontSize(9);
                        }

                        doc.setFillColor(rec.type === 'warning' ? 251 : 255, rec.type === 'warning' ? 191 : 198, rec.type === 'warning' ? 36 : 47);
                        doc.circle(22, yPos - 1.5, 1.5, 'F');
                        
                        const lines = doc.splitTextToSize(rec.text, pageWidth - 50);
                        lines.forEach((line, lineIndex) => {
                            doc.text(line, 27, yPos);
                            yPos += 5;
                        });
                        
                        yPos += 2;
                    });

                    yPos += 5;
                }

                // health conditions
                const healthConditions = [];
                if (profile.pregnant) healthConditions.push('Pregnant');
                if (profile.breastfeeding) healthConditions.push('Breastfeeding');
                if (profile.illness) healthConditions.push('Illness');
                if (profile.kidneyDisease) healthConditions.push('Kidney Disease');

                if (healthConditions.length > 0) {
                    if (yPos > pageHeight - 40) {
                        doc.addPage();
                        yPos = 20;
                    }

                    this.addSectionHeader(doc, 'Health Considerations', yPos, accentColor);
                    yPos += 10;

                    doc.setFontSize(11);
                    doc.setTextColor(textColor[0], textColor[1], textColor[2]);
                    doc.text(healthConditions.join(', '), 20, yPos);
                    yPos += 10;
                }

                // footer with disclaimer
                const footerY = pageHeight - 25;
                doc.setFontSize(8);
                doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
                doc.text('Medical Disclaimer: This report provides general hydration guidance only. Always consult with a healthcare', 
                    pageWidth / 2, footerY, { align: 'center' });
                doc.text('provider for personalized medical advice, especially if you have health concerns.', 
                    pageWidth / 2, footerY + 4, { align: 'center' });
                
                doc.setFontSize(7);
                doc.text('Generated by Hydration+ | hydration-tracker.app', 
                    pageWidth / 2, footerY + 10, { align: 'center' });

                // save PDF
                const fileName = `Hydration_Report_${new Date().toISOString().split('T')[0]}.pdf`;
                doc.save(fileName);

                ToastManager.show('Report downloaded successfully!', 'success');

            } catch (error) {
                console.error('Error generating report:', error);
                ToastManager.show('Failed to generate report. Please try again.', 'error');
            }
        },

        // add section header with styling
        addSectionHeader(doc, title, yPos, color) {
            doc.setFillColor(color[0], color[1], color[2], 0.1);
            doc.rect(15, yPos - 6, doc.internal.pageSize.getWidth() - 30, 12, 'F');
            
            doc.setFontSize(13);
            doc.setFont(undefined, 'bold');
            doc.setTextColor(color[0], color[1], color[2]);
            doc.text(title, 20, yPos);
        },

        // format activity level for display
        formatActivityLevel(level) {
            const levels = {
                sedentary: 'Sedentary',
                light: 'Light',
                moderate: 'Moderate',
                active: 'Very Active',
                athlete: 'Athlete'
            };
            return levels[level] || 'Not specified';
        },

        // format climate for display
        formatClimate(climate) {
            const climates = {
                cool: 'Cool (< 15°C)',
                moderate: 'Moderate (15-25°C)',
                hot: 'Hot (25-35°C)',
                'very-hot': 'Very Hot (> 35°C)'
            };
            return climates[climate] || 'Not specified';
        },

        // format altitude for display
        formatAltitude(altitude) {
            const altitudes = {
                'sea-level': 'Sea Level (0-500m)',
                moderate: 'Moderate (500-2000m)',
                high: 'High (> 2000m)'
            };
            return altitudes[altitude] || 'Not specified';
        }
    };

    // calculation engine
    const Calculator = {
        // calculate water requirements
        calculateWater(params) {
            const {
                weight,
                activityLevel,
                exerciseDuration,
                exerciseIntensity,
                climate,
                altitude,
                pregnant,
                breastfeeding,
                illness,
                kidneyDisease
            } = params;

            // base water requirement
            let waterRequirement = weight * CONFIG.BASE_WATER_PER_KG;

            // activity level multiplier
            const activityMultipliers = {
                sedentary: 1.0,
                light: 1.1,
                moderate: 1.2,
                active: 1.3,
                athlete: 1.4
            };
            waterRequirement *= activityMultipliers[activityLevel] || 1.0;

            // exercise adjustment
            const exerciseHours = exerciseDuration / 60;
            const intensityMultipliers = {
                low: 0.8,
                medium: 1.0,
                high: 1.3
            };
            const exerciseWater = exerciseHours * CONFIG.EXERCISE_WATER_PER_HOUR * 
                (intensityMultipliers[exerciseIntensity] || 1.0);
            waterRequirement += exerciseWater;

            // climate adjustment
            const climateMultipliers = {
                cool: 1.0,
                moderate: 1.0,
                hot: 1.2,
                'very-hot': 1.4
            };
            waterRequirement *= climateMultipliers[climate] || 1.0;

            // altitude adjustment
            const altitudeAdditions = {
                'sea-level': 0,
                moderate: 500,
                high: 1000
            };
            waterRequirement += altitudeAdditions[altitude] || 0;

            // health conditions
            if (pregnant) waterRequirement += 300;
            if (breastfeeding) waterRequirement += 700;
            if (illness) waterRequirement += 1000;
            if (kidneyDisease) {
                waterRequirement = Math.min(waterRequirement, 2000);
            }

            // apply safety limits
            waterRequirement = Math.max(CONFIG.MIN_WATER, waterRequirement);
            waterRequirement = Math.min(CONFIG.MAX_WATER, waterRequirement);

            return Math.round(waterRequirement);
        },

        // calculate electrolyte requirements
        calculateElectrolytes(params) {
            const {
                gender,
                age,
                exerciseDuration,
                exerciseIntensity,
                climate
            } = params;

            // base requirements
            let sodium = 2000;
            let potassium = gender === 'male' ? 3400 : 2600;
            let magnesium = gender === 'male' ? CONFIG.MAGNESIUM.male : CONFIG.MAGNESIUM.female;
            let calcium = age >= 65 ? CONFIG.CALCIUM.senior : CONFIG.CALCIUM.young;

            // exercise adjustments
            const exerciseHours = exerciseDuration / 60;
            const intensityMultipliers = {
                low: 0.5,
                medium: 1.0,
                high: 1.5
            };
            const sweatMultiplier = intensityMultipliers[exerciseIntensity] || 1.0;
            
            // sodium loss in sweat
            sodium += exerciseHours * 1000 * sweatMultiplier;
            potassium += exerciseHours * 200 * sweatMultiplier;

            // climate adjustments
            const climateMultipliers = {
                cool: 1.0,
                moderate: 1.0,
                hot: 1.15,
                'very-hot': 1.3
            };
            const climateMultiplier = climateMultipliers[climate] || 1.0;
            sodium *= climateMultiplier;
            potassium *= climateMultiplier;

            // cap at danger levels
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

        // generate personalized recommendations
        generateRecommendations(params, waterRequirement, electrolytes) {
            const recommendations = [];

            // water distribution
            recommendations.push({
                type: 'info',
                text: `Distribute your ${Utils.formatNumber(waterRequirement)}ml throughout the day. Aim for ${Math.round(waterRequirement / 8)}ml every 1-2 hours while awake.`
            });

            // high water warning
            if (waterRequirement >= CONFIG.DANGER_WATER) {
                recommendations.push({
                    type: 'warning',
                    text: 'High water intake detected. Be mindful of electrolyte balance. Consider sports drinks or electrolyte supplements during intense exercise.'
                });
            }

            // kidney disease warning
            if (params.kidneyDisease) {
                recommendations.push({
                    type: 'warning',
                    text: 'You indicated kidney disease. Water intake has been capped at 2000ml. Please consult your healthcare provider for personalized guidance.'
                });
            }

            // exercise-specific advice
            if (params.exerciseDuration > 60) {
                recommendations.push({
                    type: 'info',
                    text: 'For exercise longer than 60 minutes, consume 150-250ml of water every 15-20 minutes. Consider electrolyte drinks.'
                });
            }

            // climate advice
            if (params.climate === 'hot' || params.climate === 'very-hot') {
                recommendations.push({
                    type: 'warning',
                    text: 'Hot climate detected. Monitor for signs of dehydration: dark urine, dizziness, fatigue. Increase intake if needed.'
                });
            }

            // sodium advice
            if (electrolytes.sodium > 3000) {
                recommendations.push({
                    type: 'info',
                    text: 'High sodium requirement due to exercise/climate. Good sources: sports drinks, salted nuts, pickles, broth.'
                });
            }

            // potassium-rich foods
            recommendations.push({
                type: 'info',
                text: `Potassium sources: bananas, sweet potatoes, spinach, avocado, beans. Target: ${Utils.formatNumber(electrolytes.potassium)}mg/day.`
            });

            // magnesium sources
            recommendations.push({
                type: 'info',
                text: `Magnesium sources: almonds, spinach, black beans, dark chocolate, pumpkin seeds. Target: ${electrolytes.magnesium}mg/day.`
            });

            return recommendations;
        },

        // validate inconsistencies in user input
        validateConsistency(params) {
            const warnings = [];

            // sedentary with high exercise
            if (params.activityLevel === 'sedentary' && params.exerciseDuration > 60) {
                warnings.push('You selected "Sedentary" but indicated significant exercise. Consider selecting a higher activity level.');
            }

            // very young with intense exercise
            if (params.age < 12 && params.exerciseIntensity === 'high') {
                warnings.push('High-intensity exercise for children under 12 should be supervised. Consult a pediatrician.');
            }

            // multiple health conditions
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

    // form validator
    const FormValidator = {
        // validate weight input
        validateWeight(weight, unit) {
            const min = unit === 'kg' ? 20 : 44;
            const max = unit === 'kg' ? 300 : 661;
            return Utils.validateNumber(weight, min, max);
        },

        // validate age input
        validateAge(age) {
            return Utils.validateNumber(age, 1, 120);
        },

        // validate exercise duration
        validateExerciseDuration(duration) {
            return Utils.validateNumber(duration, 0, 1440);
        },

        // show error message
        showError(elementId, message) {
            const errorElement = document.getElementById(`${elementId}-error`);
            if (errorElement) {
                errorElement.textContent = message;
                errorElement.setAttribute('role', 'alert');
            }
        },

        // clear error message
        clearError(elementId) {
            const errorElement = document.getElementById(`${elementId}-error`);
            if (errorElement) {
                errorElement.textContent = '';
                errorElement.removeAttribute('role');
            }
        },

        // validate all form inputs
        validateForm() {
            let isValid = true;

            // validate weight
            const weight = document.getElementById('weight').value;
            const weightUnit = document.querySelector('.unit-btn.active').dataset.unit;
            const weightValidation = this.validateWeight(weight, weightUnit);
            
            if (!weightValidation.valid) {
                this.showError('weight', weightValidation.error);
                isValid = false;
            } else {
                this.clearError('weight');
            }

            // validate age
            const age = document.getElementById('age').value;
            const ageValidation = this.validateAge(age);
            
            if (!ageValidation.valid) {
                this.showError('age', ageValidation.error);
                isValid = false;
            } else {
                this.clearError('age');
            }

            // required fields
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

    // UI manager
    const UIManager = {
        // initialize UI event listeners
        init() {
            this.setupWeightToggle();
            this.setupCalculateButton();
            this.setupTracking();
            this.loadSavedData();
        },

        // setup weight unit toggle
        setupWeightToggle() {
            const toggleButtons = document.querySelectorAll('.unit-btn');
            const weightInput = document.getElementById('weight');

            toggleButtons.forEach(btn => {
                btn.addEventListener('click', () => {
                    toggleButtons.forEach(b => {
                        b.classList.remove('active');
                        b.setAttribute('aria-pressed', 'false');
                    });
                    btn.classList.add('active');
                    btn.setAttribute('aria-pressed', 'true');

                    const currentValue = parseFloat(weightInput.value);
                    if (!isNaN(currentValue) && currentValue > 0) {
                        const newUnit = btn.dataset.unit;
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

        // setup calculate button
        setupCalculateButton() {
            const calculateBtn = document.getElementById('calculate-btn');
            const clearFormBtn = document.getElementById('clear-form-btn');
            const resetSettingsBtn = document.getElementById('reset-settings-btn');
            const downloadReportBtn = document.getElementById('download-report-btn');
            
            calculateBtn.addEventListener('click', () => {
                this.handleCalculate();
            });

            // clear form button
            clearFormBtn.addEventListener('click', () => {
                ToastManager.showConfirm(
                    'Clear all form inputs? This will not delete your saved data.',
                    () => {
                        this.clearForm();
                        ToastManager.show('Form cleared successfully', 'success');
                    },
                    null,
                    'info'
                );
            });

            // reset settings button
            resetSettingsBtn.addEventListener('click', () => {
                ToastManager.showConfirm(
                    'Reset all settings and clear saved data? This action cannot be undone.',
                    () => {
                        this.resetAllSettings();
                    },
                    null,
                    'warning'
                );
            });

            // download report button
            downloadReportBtn.addEventListener('click', () => {
                ReportGenerator.generateReport();
            });
        },

        // clear form inputs only
        clearForm() {
            document.getElementById('weight').value = '';
            document.getElementById('age').value = '';
            document.getElementById('gender').value = '';
            document.getElementById('activity-level').value = '';
            document.getElementById('exercise-duration').value = '0';
            document.getElementById('exercise-intensity').value = 'medium';
            document.getElementById('climate').value = 'moderate';
            document.getElementById('altitude').value = 'sea-level';
            
            // uncheck all health conditions
            document.getElementById('pregnant').checked = false;
            document.getElementById('breastfeeding').checked = false;
            document.getElementById('illness').checked = false;
            document.getElementById('kidney-disease').checked = false;

            // reset weight unit to kg
            const kgBtn = document.querySelector('.unit-btn[data-unit="kg"]');
            const lbsBtn = document.querySelector('.unit-btn[data-unit="lbs"]');
            kgBtn.classList.add('active');
            kgBtn.setAttribute('aria-pressed', 'true');
            lbsBtn.classList.remove('active');
            lbsBtn.setAttribute('aria-pressed', 'false');

            // clear error messages
            FormValidator.clearError('weight');
            FormValidator.clearError('age');

            // hide results and tracker sections
            document.getElementById('results-section').style.display = 'none';
            document.getElementById('tracker-section').style.display = 'none';
        },

        // reset all settings and clear all data
        resetAllSettings() {
            this.clearForm();
            StorageManager.saveData(StorageManager.getDefaultData());
            ToastManager.clearAll();
            document.getElementById('results-section').style.display = 'none';
            document.getElementById('tracker-section').style.display = 'none';
            ToastManager.show('All settings and data have been reset', 'success');
            window.scrollTo({ top: 0, behavior: 'smooth' });
        },

        // handle calculation
        handleCalculate() {
            if (!FormValidator.validateForm()) {
                return;
            }

            const params = this.gatherFormData();

            // validate consistency
            const warnings = Calculator.validateConsistency(params);
            warnings.forEach(warning => {
                ToastManager.show(warning, 'warning', 6000);
            });

            // calculate requirements
            const waterRequirement = Calculator.calculateWater(params);
            const electrolytes = Calculator.calculateElectrolytes(params);
            const recommendations = Calculator.generateRecommendations(params, waterRequirement, electrolytes);

            // save to storage
            StorageManager.saveProfile(params);
            StorageManager.saveGoals({
                water: waterRequirement,
                ...electrolytes
            });

            // display results
            this.displayResults(waterRequirement, electrolytes, recommendations);
            this.initializeTracking(waterRequirement);

            ToastManager.show('Requirements calculated successfully!', 'success');
            document.getElementById('results-section').scrollIntoView({ 
                behavior: 'smooth', 
                block: 'start' 
            });
        },

        // gather form data
        gatherFormData() {
            const weightInput = document.getElementById('weight').value;
            const weightUnit = document.querySelector('.unit-btn.active').dataset.unit;
            
            // convert weight to kg
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

        // display calculation results
        displayResults(waterRequirement, electrolytes, recommendations) {
            const resultsSection = document.getElementById('results-section');
            resultsSection.style.display = 'block';

            // display water requirement
            document.getElementById('water-amount').textContent = Utils.formatNumber(waterRequirement);
            const cups = Math.round(waterRequirement / 250);
            document.getElementById('water-cups').textContent = `${cups} cups (250ml each)`;

            // display electrolytes
            document.getElementById('sodium-amount').textContent = Utils.formatNumber(electrolytes.sodium);
            document.getElementById('potassium-amount').textContent = Utils.formatNumber(electrolytes.potassium);
            document.getElementById('magnesium-amount').textContent = electrolytes.magnesium;
            document.getElementById('calcium-amount').textContent = Utils.formatNumber(electrolytes.calcium);

            // display recommendations
            const recommendationsContainer = document.getElementById('recommendations');
            recommendationsContainer.innerHTML = recommendations.map(rec => `
                <div class="recommendation-item">
                    <img src="./assets/svgs/${rec.type}.svg" alt="" class="recommendation-icon ${rec.type}" aria-hidden="true">
                    <p class="recommendation-text">${Utils.sanitize(rec.text)}</p>
                </div>
            `).join('');
        },

        // initialize tracking section
        initializeTracking(waterRequirement) {
            const trackerSection = document.getElementById('tracker-section');
            trackerSection.style.display = 'block';

            // update target
            document.getElementById('target-intake').textContent = `/ ${Utils.formatNumber(waterRequirement)} ml`;

            // load today's tracking
            const todayData = StorageManager.getTodayTracking();
            this.updateTrackingUI(todayData, waterRequirement);
        },

        // setup tracking functionality
        setupTracking() {
            const addIntakeBtn = document.getElementById('add-intake-btn');
            const intakeInput = document.getElementById('intake-amount');
            const quickBtns = document.querySelectorAll('.quick-btn');
            const resetBtn = document.getElementById('reset-tracker-btn');

            // add intake button
            addIntakeBtn.addEventListener('click', () => {
                const amount = parseInt(intakeInput.value);
                if (this.validateIntakeAmount(amount)) {
                    this.addIntake(amount);
                    intakeInput.value = '';
                }
            });

            // enter key on input
            intakeInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    addIntakeBtn.click();
                }
            });

            // quick add buttons
            quickBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    const amount = parseInt(btn.dataset.amount);
                    this.addIntake(amount);
                });
            });

            // reset button
            resetBtn.addEventListener('click', () => {
                ToastManager.showConfirm(
                    'Are you sure you want to reset today\'s tracking?',
                    () => {
                        StorageManager.resetTodayTracking();
                        this.updateTrackingUI({ waterIntake: [] }, this.getCurrentGoal());
                        ToastManager.show('Tracking reset successfully', 'success');
                    },
                    null,
                    'warning'
                );
            });
        },

        // validate intake amount
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

        // add water intake
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

        // delete water intake entry
        deleteIntake(index) {
            const todayData = StorageManager.getTodayTracking();
            todayData.waterIntake.splice(index, 1);
            StorageManager.saveTodayTracking(todayData);
            this.updateTrackingUI(todayData, this.getCurrentGoal());
            ToastManager.show('Entry deleted', 'info');
        },

        // update tracking UI
        updateTrackingUI(todayData, goal) {
            const waterIntake = todayData.waterIntake || [];
            const totalIntake = waterIntake.reduce((sum, entry) => sum + entry.amount, 0);

            // update progress
            document.getElementById('current-intake').textContent = `${Utils.formatNumber(totalIntake)} ml`;
            
            const progressPercentage = goal > 0 ? Math.min((totalIntake / goal) * 100, 100) : 0;
            document.getElementById('progress-percentage').textContent = `${Math.round(progressPercentage)}%`;
            
            const progressFill = document.getElementById('progress-fill');
            progressFill.style.width = `${progressPercentage}%`;
            progressFill.setAttribute('aria-valuenow', Math.round(progressPercentage));

            // update intake list
            this.updateIntakeList(waterIntake);

            // check if goal reached
            if (totalIntake >= goal && goal > 0) {
                ToastManager.show('Congratulations! You\'ve reached your daily water goal!', 'success', 6000);
            }
        },

        // update intake list
        updateIntakeList(waterIntake) {
            const intakeList = document.getElementById('intake-list');
            
            if (waterIntake.length === 0) {
                intakeList.innerHTML = '<p class="empty-state">No water intake recorded yet. Add your first entry!</p>';
                return;
            }

            // sort by timestamp (newest first)
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

            // add delete listeners
            intakeList.querySelectorAll('.delete-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const index = parseInt(btn.dataset.index);
                    this.deleteIntake(index);
                });
            });
        },

        // get current water goal
        getCurrentGoal() {
            const data = StorageManager.getData();
            return data.dailyGoals?.water || 0;
        },

        // load saved data on page load
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

        // populate form with saved data
        populateForm(profile) {
            // weight
            const weightUnit = document.querySelector('.unit-btn.active').dataset.unit;
            let displayWeight = profile.weight;
            if (weightUnit === 'lbs') {
                displayWeight *= CONFIG.KG_TO_LBS;
            }
            document.getElementById('weight').value = displayWeight.toFixed(1);

            // other fields
            if (profile.age) document.getElementById('age').value = profile.age;
            if (profile.gender) document.getElementById('gender').value = profile.gender;
            if (profile.activityLevel) document.getElementById('activity-level').value = profile.activityLevel;
            if (profile.exerciseDuration !== undefined) document.getElementById('exercise-duration').value = profile.exerciseDuration;
            if (profile.exerciseIntensity) document.getElementById('exercise-intensity').value = profile.exerciseIntensity;
            if (profile.climate) document.getElementById('climate').value = profile.climate;
            if (profile.altitude) document.getElementById('altitude').value = profile.altitude;

            // checkboxes
            document.getElementById('pregnant').checked = profile.pregnant || false;
            document.getElementById('breastfeeding').checked = profile.breastfeeding || false;
            document.getElementById('illness').checked = profile.illness || false;
            document.getElementById('kidney-disease').checked = profile.kidneyDisease || false;
        }
    };

    // initialization
    function initializeApp() {
        ToastManager.init();
        UIManager.init();
        checkMidnightRollover();
        console.log('Water + Electrolyte Balance Tool initialized successfully');
    }

    // check for date change and reset tracking if needed
    function checkMidnightRollover() {
        const lastDate = localStorage.getItem('last_active_date');
        const currentDate = Utils.getDateString();

        if (lastDate && lastDate !== currentDate) {
            console.log('New day detected - tracking reset');
        }

        localStorage.setItem('last_active_date', currentDate);
    }

    // event listeners
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeApp);
    } else {
        initializeApp();
    }

    // handle page visibility changes
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            checkMidnightRollover();
            
            const goal = UIManager.getCurrentGoal();
            if (goal > 0) {
                const todayData = StorageManager.getTodayTracking();
                UIManager.updateTrackingUI(todayData, goal);
            }
        }
    });

})();
