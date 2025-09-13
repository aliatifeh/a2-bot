// app.js - نسخه بهبود یافته با اتصال پایدارتر و مدیریت جفت ارزها
class A2WebBot {
    constructor() {
        this.initializeElements();
        this.loadSettings();
        this.initializeEventListeners();
        this.loadTradingPairs();
        this.updateCountdown();
        this.brokerTime = null;
        
        // تنظیمات پیشفرض تحلیل تکنیکال
        this.technicalAnalysis = {
            rsiPeriod: 14,
            emaShortPeriod: 12,
            emaLongPeriod: 26,
            macdSignalPeriod: 9,
            bollingerPeriod: 20,
            bollingerStdDev: 2
        };
        
        // داده‌های تاریخی برای تحلیل
        this.marketData = {};
    }

    initializeElements() {
        // Elements
        this.pairSelect = document.getElementById('pairSelect');
        this.btnStart = document.getElementById('btnStart');
        this.btnStop = document.getElementById('btnStop');
        this.btnSettings = document.getElementById('btnSettings');
        this.saveSettings = document.getElementById('saveSettings');
        this.closeSettings = document.getElementById('closeSettings');
        this.settingsPanel = document.getElementById('settingsPanel');
        
        // Display elements
        this.statusEl = document.getElementById('status');
        this.sigEl = document.getElementById('signal');
        this.pairEl = document.getElementById('currentPair');
        this.confEl = document.getElementById('confidence');
        this.barsEl = document.getElementById('bars');
        this.countdownEl = document.getElementById('countdown');
        this.modeEl = document.getElementById('mode');
        this.connectionStatusEl = document.getElementById('connectionStatus');
        this.todaySignalsEl = document.getElementById('todaySignals');
        this.brokerStatusEl = document.getElementById('brokerStatus');
        
        // Settings elements
        this.minConfidenceSlider = document.getElementById('minConfidence');
        this.minConfidenceValue = document.getElementById('minConfidenceValue');
        this.strategySensitivitySlider = document.getElementById('strategySensitivity');
        this.sensitivityValue = document.getElementById('sensitivityValue');
        this.soundEnabledCheckbox = document.getElementById('soundEnabled');
        this.notificationsEnabledCheckbox = document.getElementById('notificationsEnabled');
        
        // License elements
        this.licenseSection = document.getElementById('licenseSection');
        this.licenseInput = document.getElementById('licenseInput');
        this.activateLicenseBtn = document.getElementById('activateLicense');
        this.licenseStatus = document.getElementById('licenseStatus');
        
        // State
        this.active = false;
        this.selectedPair = null;
        this.todayStats = { signals: 0, profitable: 0, total: 0 };
        this.connectionStatus = { connected: false, brokerConnected: false };
        this.countdownInterval = null;
        this.audioContext = null;
        this.licenseActive = false;
        this.licenseKey = null;
        this.brokerTime = null;
        this.brokerTimeInterval = null;
        this.signalInterval = null;
        this.lastSignal = null;
    }

    loadSettings() {
        const savedSettings = JSON.parse(localStorage.getItem('a2_settings')) || {};
        this.settings = {
            minConfidence: savedSettings.minConfidence || 0.75,
            strategySensitivity: savedSettings.strategySensitivity || 6,
            soundEnabled: savedSettings.soundEnabled !== false,
            notificationsEnabled: savedSettings.notificationsEnabled !== false,
            licenseKey: savedSettings.licenseKey || null
        };

        // Update UI with saved settings
        this.minConfidenceSlider.value = this.settings.minConfidence * 100;
        this.minConfidenceValue.textContent = Math.round(this.settings.minConfidence * 100) + '%';
        this.strategySensitivitySlider.value = this.settings.strategySensitivity;
        this.sensitivityValue.textContent = this.settings.strategySensitivity;
        this.soundEnabledCheckbox.checked = this.settings.soundEnabled;
        this.notificationsEnabledCheckbox.checked = this.settings.notificationsEnabled;

        // Load license
        if (this.settings.licenseKey) {
            this.licenseInput.value = this.settings.licenseKey;
            this.activateLicense(true); // true یعنی از localStorage بارگذاری شده
        }

        // Load stats
        const savedStats = JSON.parse(localStorage.getItem('a2_stats'));
        if (savedStats) {
            this.todayStats = savedStats;
            this.updateStatsDisplay();
        }
    }

    initializeEventListeners() {
        // Button events
        this.btnStart.addEventListener('click', () => this.startBot());
        this.btnStop.addEventListener('click', () => this.stopBot());
        this.btnSettings.addEventListener('click', () => this.toggleSettings());
        this.saveSettings.addEventListener('click', () => this.saveSettingsToStorage());
        this.closeSettings.addEventListener('click', () => this.toggleSettings());

        // Settings sliders
        this.minConfidenceSlider.addEventListener('input', () => {
            this.minConfidenceValue.textContent = this.minConfidenceSlider.value + '%';
        });

        this.strategySensitivitySlider.addEventListener('input', () => {
            this.sensitivityValue.textContent = this.strategySensitivitySlider.value;
        });

        // Pair selection
        this.pairSelect.addEventListener('change', (e) => {
            const oldPair = this.selectedPair;
            this.selectedPair = e.target.value;
            
            // اگر ربات فعال است، تغییر سابسکریب
            if (this.active && oldPair) {
                window.quotexAPI.unsubscribeFromPair(oldPair);
                window.quotexAPI.subscribeToPair(this.selectedPair);
            }
        });

        // License activation
        this.activateLicenseBtn.addEventListener('click', () => this.activateLicense());

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.settingsPanel.style.display = 'none';
            }
        });

        // Page visibility
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && this.active) {
                this.updateConnectionStatus(true);
            }
        });
    }

    async loadTradingPairs() {
        try {
            // بارگذاری جفت ارزها از فایل JSON
            const response = await fetch('./data/pairs.json');
            if (!response.ok) {
                throw new Error('Failed to load pairs.json');
            }
            
            const pairs = await response.json();
            
            // پاک کردن گزینه‌های موجود
            this.pairSelect.innerHTML = '<option value="">لطفاً انتخاب کنید</option>';
            
            // اضافه کردن جفت ارزها به dropdown
            pairs.forEach(pair => {
                const option = document.createElement('option');
                option.value = pair.replace(' ', '_'); // جایگزینی فاصله با underline برای سازگاری
                option.textContent = pair;
                this.pairSelect.appendChild(option);
            });
        } catch (error) {
            console.error('Error loading trading pairs:', error);
            
            // اگر فایل بارگذاری نشد، از لیست پیش‌فرض استفاده کن
            const defaultPairs = [
                "USD/BRL OTC", 
                "USD/ARS OTC", 
                "USD/IDR OTC", 
                "USD/INR OTC",
                "NZD/CAD OTC", 
                "EUR/CHF OTC", 
                "CAD/JPY OTC", 
                "USD/BDT OTC",
                "AUD/USD OTC", 
                "EUR/GBP OTC",
                "GBP/JPY OTC",
                "EUR/JPY OTC",
                "USD/TRY OTC",
                "EUR/USD OTC",
                "USD/MXN OTC"
            ];
            
            this.pairSelect.innerHTML = '<option value="">لطفاً انتخاب کنید</option>';
            defaultPairs.forEach(pair => {
                const option = document.createElement('option');
                option.value = pair.replace(' ', '_');
                option.textContent = pair;
                this.pairSelect.appendChild(option);
            });
        }
    }

    activateLicense(fromStorage = false) {
        const key = this.licenseInput.value.trim().toUpperCase();
        if (!key && !fromStorage) {
            this.showNotification('لطفاً کلید لایسنس را وارد کنید', 'error');
            return false;
        }
        
        // Validate license using License Manager
        if (window.licenseManager.activateLicense(key)) {
            this.settings.licenseKey = key;
            localStorage.setItem('a2_settings', JSON.stringify(this.settings));
            this.licenseActive = true;
            this.licenseStatus.textContent = 'فعال';
            this.licenseStatus.className = 'status-active';
            
            if (!fromStorage) {
                this.showNotification('لایسنس با موفقیت فعال شد', 'success');
            }
            
            return true;
        } else {
            this.licenseActive = false;
            this.licenseStatus.textContent = 'نامعتبر';
            this.licenseStatus.className = 'status-inactive';
            
            if (!fromStorage) {
                this.showNotification('لایسنس نامعتبر است', 'error');
            }
            
            return false;
        }
    }

    async startBot() {
        if (!this.selectedPair) {
            this.showNotification('لطفاً یک جفت ارز انتخاب کنید', 'error');
            return;
        }

        // بررسی لایسنس - استفاده مستقیم از License Manager
        if (!window.licenseManager.isActive()) {
            this.showNotification('لطفاً لایسنس را فعال کنید', 'error');
            return;
        }

        try {
            // اتصال به WebSocket بروکر
            if (!window.quotexAPI.isConnected()) {
                this.showNotification('در حال اتصال به بروکر...', 'info');
                await window.quotexAPI.connect();
                
                // تنظیم callback برای دریافت قیمت‌ها
                window.quotexAPI.onPriceUpdate = (pair, price) => {
                    this.handlePriceUpdate(pair, price);
                };
                
                // تنظیم callback برای تغییر وضعیت اتصال
                window.quotexAPI.onConnectionChange = (connected) => {
                    this.connectionStatus.brokerConnected = connected;
                    this.brokerStatusEl.textContent = connected ? 'متصل' : 'قطع';
                    this.brokerStatusEl.className = connected ? 'status-active' : 'status-inactive';
                    
                    if (!connected) {
                        this.showNotification('اتصال به بروکر قطع شد', 'error');
                    } else {
                        this.showNotification('اتصال به بروکر برقرار شد', 'success');
                    }
                };
            }
            
            // سابسکریب به جفت ارز انتخاب شده
            const subscribed = window.quotexAPI.subscribeToPair(this.selectedPair);
            
            if (!subscribed) {
                this.showNotification('خطا در سابسکریب به جفت ارز', 'error');
                return;
            }
            
            this.active = true;
            this.statusEl.textContent = 'وصل';
            this.connectionStatusEl.classList.add('connected');
            this.pairEl.textContent = this.selectedPair.replace('_', ' '); // نمایش با فاصله
            
            this.btnStart.disabled = true;
            this.btnStop.disabled = false;
            
            this.updateConnectionStatus(true);
            this.startBrokerTimeSync();
            
            this.showNotification(`ربات برای ${this.selectedPair.replace('_', ' ')} فعال شد`, 'success');
            
        } catch (error) {
            console.error('Failed to start bot:', error);
            this.showNotification('خطا در اتصال به بروکر', 'error');
        }
    }

    stopBot() {
        this.active = false;
        this.statusEl.textContent = 'قطع';
        this.connectionStatusEl.classList.remove('connected');
        this.sigEl.textContent = '...';
        this.sigEl.className = 'signal neutral';
        this.confEl.textContent = 'اعتبار: —';
        
        // آنسابسکریب از جفت ارز
        if (this.selectedPair) {
            window.quotexAPI.unsubscribeFromPair(this.selectedPair);
        }
        
        if (this.countdownInterval) {
            clearInterval(this.countdownInterval);
            this.countdownInterval = null;
        }
        
        if (this.brokerTimeInterval) {
            clearInterval(this.brokerTimeInterval);
            this.brokerTimeInterval = null;
        }
        
        if (this.signalInterval) {
            clearInterval(this.signalInterval);
            this.signalInterval = null;
        }
        
        this.btnStart.disabled = false;
        this.btnStop.disabled = true;
        
        this.updateConnectionStatus(false);
        this.showNotification('ربات متوقف شد', 'info');
    }

    handlePriceUpdate(pair, price) {
        if (!this.active || pair !== this.selectedPair) return;
        
        // ذخیره داده‌های بازار برای تحلیل
        if (!this.marketData[pair]) {
            this.marketData[pair] = [];
        }
        
        this.marketData[pair].push({
            price: price,
            timestamp: Date.now()
        });
        
        // حفظ فقط 100 داده اخیر
        if (this.marketData[pair].length > 100) {
            this.marketData[pair].shift();
        }
        
        // تحلیل تکنیکال و تولید سیگنال
        if (this.marketData[pair].length >= 20) { // حداقل داده برای تحلیل
            const signal = this.generateSignal(pair);
            if (signal) {
                this.displaySignal(signal);
                this.playNotificationSound();
                
                if (this.settings.notificationsEnabled) {
                    this.showBrowserNotification(signal);
                }
            }
        }
    }

    generateSignal(pair) {
        const prices = this.marketData[pair].map(item => item.price);
        
        // محاسبه اندیکاتورهای تکنیکال
        const rsi = this.calculateRSI(prices, this.technicalAnalysis.rsiPeriod);
        const macd = this.calculateMACD(
            prices, 
            this.technicalAnalysis.emaShortPeriod, 
            this.technicalAnalysis.emaLongPeriod, 
            this.technicalAnalysis.macdSignalPeriod
        );
        
        const bollinger = this.calculateBollingerBands(
            prices,
            this.technicalAnalysis.bollingerPeriod,
            this.technicalAnalysis.bollingerStdDev
        );
        
        const currentPrice = prices[prices.length - 1];
        const previousPrice = prices[prices.length - 2];
        
        // تحلیل سیگنال بر اساس اندیکاتورها
        let buyScore = 0;
        let sellScore = 0;
        
        // تحلیل RSI
        if (rsi < 30) buyScore += 2;
        else if (rsi < 40) buyScore += 1;
        else if (rsi > 70) sellScore += 2;
        else if (rsi > 60) sellScore += 1;
        
        // تحلیل MACD
        if (macd && macd.histogram > 0) buyScore += 1.5;
        else if (macd && macd.histogram < 0) sellScore += 1.5;
        
        // تحلیل Bollinger Bands
        if (bollinger && currentPrice < bollinger.lower) buyScore += 1.5;
        else if (bollinger && currentPrice > bollinger.upper) sellScore += 1.5;
        
        // تحلیل روند قیمت
        if (currentPrice > previousPrice) buyScore += 0.5;
        else if (currentPrice < previousPrice) sellScore += 0.5;
        
        // اگر سیگنال قوی نیست، بازگشت
        if (buyScore < 3 && sellScore < 3) return null;
        
        const direction = buyScore > sellScore ? 'BUY' : 'SELL';
        const totalScore = buyScore + sellScore;
        const confidence = 0.6 + (Math.max(buyScore, sellScore) / totalScore) * 0.35;
        
        return {
            direction: direction,
            confidence: Math.min(0.95, Math.max(0.6, confidence)),
            timestamp: Date.now(),
            pair: pair,
            rsi: rsi,
            price: currentPrice
        };
    }

    calculateRSI(prices, period = 14) {
        if (prices.length < period + 1) return 50;
        
        let gains = 0;
        let losses = 0;
        
        for (let i = prices.length - period; i < prices.length; i++) {
            const change = prices[i] - prices[i - 1];
            if (change > 0) {
                gains += change;
            } else {
                losses -= change;
            }
        }
        
        gains /= period;
        losses /= period;
        
        if (losses === 0) return 100;
        const rs = gains / losses;
        return 100 - (100 / (1 + rs));
    }

    calculateEMA(prices, period) {
        if (prices.length < period) return prices.reduce((a, b) => a + b) / prices.length;
        
        const k = 2 / (period + 1);
        let ema = prices.slice(0, period).reduce((a, b) => a + b) / period;
        
        for (let i = period; i < prices.length; i++) {
            ema = (prices[i] * k) + (ema * (1 - k));
        }
        
        return ema;
    }

    calculateMACD(prices, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
        if (prices.length < slowPeriod + signalPeriod) return null;
        
        const fastEMA = this.calculateEMA(prices, fastPeriod);
        const slowEMA = this.calculateEMA(prices, slowPeriod);
        const macdLine = fastEMA - slowEMA;
        
        // محاسبه خط سیگنال
        const macdValues = [];
        for (let i = slowPeriod; i < prices.length; i++) {
            const fastE = this.calculateEMA(prices.slice(0, i + 1), fastPeriod);
            const slowE = this.calculateEMA(prices.slice(0, i + 1), slowPeriod);
            macdValues.push(fastE - slowE);
        }
        
        const signalLine = this.calculateEMA(macdValues.slice(-signalPeriod), signalPeriod);
        const histogram = macdLine - signalLine;
        
        return {
            macd: macdLine,
            signal: signalLine,
            histogram: histogram
        };
    }

    calculateBollingerBands(prices, period = 20, stdDev = 2) {
        if (prices.length < period) {
            return { upper: null, middle: null, lower: null };
        }
        
        const slice = prices.slice(-period);
        const sum = slice.reduce((a, b) => a + b, 0);
        const mean = sum / period;
        
        const squaredDiffs = slice.map(price => Math.pow(price - mean, 2));
        const variance = squaredDiffs.reduce((a, b) => a + b, 0) / period;
        const standardDeviation = Math.sqrt(variance);
        
        return {
            upper: mean + (standardDeviation * stdDev),
            middle: mean,
            lower: mean - (standardDeviation * stdDev)
        };
    }

    displaySignal(signal) {
        this.pairEl.textContent = this.selectedPair.replace('_', ' ');
        this.sigEl.textContent = signal.direction.toUpperCase() === 'BUY' ? 'BUY' : 'SELL';
        this.sigEl.className = `signal ${signal.direction.toLowerCase()}`;
        this.confEl.textContent = `اعتبار: ${Math.round(signal.confidence * 100)}%`;
        
        this.setBars(signal.confidence);
        this.modeEl.textContent = 'real';

        // Update stats
        this.todayStats.signals++;
        this.lastSignal = signal;
        this.updateStatsDisplay();
        this.saveToStorage();
    }

    setBars(score) {
        this.barsEl.innerHTML = '';
        const ups = Math.round(score * 5);
        
        for (let i = 0; i < 5; i++) {
            const bar = document.createElement('div');
            bar.className = `bar ${i < ups ? 'up' : 'down'}`;
            
            // Dynamic height based on confidence
            if (i < ups) {
                bar.style.height = `${20 + (i * 4)}px`;
            } else {
                bar.style.height = `${10 + ((i - ups) * 2)}px`;
            }
            
            this.barsEl.appendChild(bar);
        }
    }

    playNotificationSound() {
        if (!this.settings.soundEnabled) return;

        try {
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }

            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();

            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(800, this.audioContext.currentTime);
            gainNode.gain.setValueAtTime(0.1, this.audioContext.currentTime);
            
            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            oscillator.start();
            oscillator.stop(this.audioContext.currentTime + 0.3);
            
        } catch (error) {
            console.log('Sound playback not supported:', error);
        }
    }

    showBrowserNotification(signal) {
        if (!('Notification' in window)) return;

        if (Notification.permission === 'granted') {
            new Notification(`سیگنال ${signal.direction} - ${this.selectedPair.replace('_', ' ')}`, {
                body: `اعتبار: ${Math.round(signal.confidence * 100)}%`,
                icon: './assets/icons/icon48.png'
            });
        } else if (Notification.permission !== 'denied') {
            Notification.requestPermission();
        }
    }

    updateStatsDisplay() {
        this.todaySignalsEl.textContent = this.todayStats.signals;
    }

    updateConnectionStatus(connected) {
        this.connectionStatus.connected = connected;
        this.connectionStatusEl.classList.toggle('connected', connected);
    }

    toggleSettings() {
        this.settingsPanel.style.display = this.settingsPanel.style.display === 'block' ? 'none' : 'block';
    }

    saveSettingsToStorage() {
        this.settings = {
            minConfidence: parseInt(this.minConfidenceSlider.value) / 100,
            strategySensitivity: parseInt(this.strategySensitivitySlider.value),
            soundEnabled: this.soundEnabledCheckbox.checked,
            notificationsEnabled: this.notificationsEnabledCheckbox.checked,
            licenseKey: this.settings.licenseKey
        };

        localStorage.setItem('a2_settings', JSON.stringify(this.settings));
        this.settingsPanel.style.display = 'none';
        
        this.showNotification('تنظیمات ذخیره شد', 'success');
    }

    saveToStorage() {
        localStorage.setItem('a2_stats', JSON.stringify(this.todayStats));
    }

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <i class="fas fa-${this.getNotificationIcon(type)}"></i>
            <span>${message}</span>
        `;

        // Add to body
        document.body.appendChild(notification);

        // Remove after delay
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }

    getNotificationIcon(type) {
        const icons = {
            success: 'check-circle',
            error: 'exclamation-circle',
            warning: 'exclamation-triangle',
            info: 'info-circle'
        };
        return icons[type] || 'info-circle';
    }

    startBrokerTimeSync() {
        // زمان بروکر
        this.brokerTime = new Date();
        this.brokerTimeInterval = setInterval(() => {
            this.brokerTime = new Date(this.brokerTime.getTime() + 1000);
            this.updateCountdown();
        }, 1000);
    }

    updateCountdown() {
        if (!this.active) {
            this.countdownEl.textContent = '--:--';
            this.modeEl.textContent = '--';
            return;
        }

        const now = this.brokerTime || new Date();
        const secondsRemain = 60 - now.getSeconds();
        const mm = String(Math.floor(secondsRemain / 60)).padStart(2, '0');
        const ss = String(secondsRemain % 60).padStart(2, '0');
        
        this.countdownEl.textContent = `${mm}:${ss}`;
    }
}

// Initialize the bot when page loads
document.addEventListener('DOMContentLoaded', () => {
    window.a2Bot = new A2WebBot();
});

// Service Worker registration for PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(() => console.log('Service Worker registered'))
            .catch(err => console.log('Service Worker registration failed:', err));
    });
}