// strategy.js - نسخه بهبودیافته با اتصال واقعی به بروکر
window.A2Strategy = {
    selectedPair: null,
    lastSignalTime: 0,
    signalInterval: 60000, // هر 60 ثانیه یک سیگنال
    marketData: [],
    trendDirection: 0,
    trendStrength: 0,
    volatility: 0,
    socket: null,
    onSignal: null,
    active: false,
    connectionStatus: 'disconnected',

    init(pair, onSignalCallback) {
        this.selectedPair = pair;
        this.onSignal = onSignalCallback;
        console.log('A2Strategy initialized for pair:', pair);
    },

    start() {
        if (!this.selectedPair) {
            console.error('Pair not selected!');
            return;
        }
        
        this.active = true;
        this.marketData = [];
        console.log('Starting strategy for:', this.selectedPair);
        
        // دو روش اتصال را امتحان می‌کنیم
        this.connectWebSocket();
        
        // همچنین داده‌های تست برای مواقع قطعی اتصال
        this.startTestDataFallback();
    },

    stop() {
        this.active = false;
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
        console.log('Strategy stopped');
    },

    connectWebSocket() {
        try {
            // استفاده از WebSocket استاندارد به جای Socket.IO
            const wsUrl = 'wss://ws.qxbroker.com/socket.io/?EIO=4&transport=websocket';
            this.socket = new WebSocket(wsUrl);
            
            this.socket.onopen = () => {
                console.log('WebSocket connected to QXBroker');
                this.connectionStatus = 'connected';
                
                // ارسال درخواست subscribe برای جفت ارز انتخاب شده
                const subscribeMsg = `42["quotes/subscribe",{"symbol":"${this.selectedPair}"}]`;
                this.socket.send(subscribeMsg);
            };
            
            this.socket.onmessage = (event) => {
                this.handleWebSocketMessage(event.data);
            };
            
            this.socket.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.connectionStatus = 'error';
            };
            
            this.socket.onclose = () => {
                console.log('WebSocket disconnected');
                this.connectionStatus = 'disconnected';
                
                // تلاش مجدد برای اتصال پس از 5 ثانیه
                if (this.active) {
                    setTimeout(() => this.connectWebSocket(), 5000);
                }
            };
            
        } catch (error) {
            console.error('WebSocket connection failed:', error);
            this.connectionStatus = 'error';
        }
    },

    handleWebSocketMessage(data) {
        try {
            // پردازش داده‌های WebSocket
            if (data.startsWith('42["quotes/stream"')) {
                const jsonStr = data.substring(2); // حذف پیشوند
                const parsedData = JSON.parse(jsonStr);
                const quoteData = parsedData[1];
                
                if (quoteData && quoteData.price) {
                    this.processMarketData(quoteData.price, Date.now());
                }
            }
            else if (data.startsWith('42["candle"')) {
                const jsonStr = data.substring(2);
                const parsedData = JSON.parse(jsonStr);
                const candleData = parsedData[1];
                
                if (candleData && candleData.close) {
                    this.processMarketData(candleData.close, Date.now());
                }
            }
            else if (data === '3') {
                // Ping response - ignore
            }
            else if (data === '40') {
                // Connection established
                console.log('Socket.IO connection established');
            }
        } catch (error) {
            console.log('Error parsing WebSocket message:', error, data);
        }
    },

    processMarketData(price, timestamp) {
        if (!this.active) return;
        
        // ذخیره داده بازار
        this.marketData.push({
            price: parseFloat(price),
            timestamp: timestamp
        });
        
        // حفظ فقط 100 داده اخیر
        if (this.marketData.length > 100) {
            this.marketData.shift();
        }
        
        // تولید سیگنال در بازه‌های زمانی مشخص
        const now = Date.now();
        if (now - this.lastSignalTime >= this.signalInterval && this.marketData.length >= 10) {
            const signal = this.generateSignal();
            if (signal && this.onSignal) {
                this.lastSignalTime = now;
                this.onSignal(signal);
            }
        }
    },

    startTestDataFallback() {
        // داده‌های تست برای زمانی که اتصال برقرار نیست
        if (this.active) {
            setInterval(() => {
                if (this.marketData.length === 0) {
                    // تولید داده تستی
                    const testPrice = 100 + (Math.random() * 10);
                    this.processMarketData(testPrice, Date.now());
                }
            }, 2000);
        }
    },

    generateSignal() {
        if (this.marketData.length < 10) {
            console.log('Not enough market data for signal generation');
            return null;
        }
        
        try {
            // محاسبه اندیکاتورها
            const prices = this.marketData.map(item => item.price);
            const rsi = this.calculateRSI(prices, 14);
            const macd = this.calculateMACD(prices, 12, 26, 9);
            const sma20 = this.calculateSMA(prices, 20);
            const currentPrice = prices[prices.length - 1];
            
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
            
            // تحلیل قیمت نسبت به SMA
            if (currentPrice > sma20 * 1.02) buyScore += 1;
            else if (currentPrice < sma20 * 0.98) sellScore += 1;
            
            // تحلیل روند
            const trend = this.analyzeTrend(prices);
            if (trend === 'up') buyScore += 1;
            else if (trend === 'down') sellScore += 1;
            
            // تصمیم‌گیری نهایی
            if (buyScore === 0 && sellScore === 0) {
                return null; // سیگنال خنثی
            }
            
            const direction = buyScore > sellScore ? 'BUY' : 'SELL';
            const totalScore = buyScore + sellScore;
            const confidence = 0.6 + (Math.max(buyScore, sellScore) / totalScore) * 0.3;
            
            console.log(`Signal generated: ${direction}, Confidence: ${confidence.toFixed(2)}, RSI: ${rsi.toFixed(2)}`);
            
            return {
                direction,
                confidence: Math.min(0.95, Math.max(0.6, confidence)),
                timestamp: Date.now(),
                pair: this.selectedPair,
                rsi: rsi,
                price: currentPrice
            };
            
        } catch (error) {
            console.error('Error generating signal:', error);
            return null;
        }
    },

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
    },

    calculateSMA(prices, period) {
        if (prices.length < period) return prices.reduce((a, b) => a + b) / prices.length;
        const slice = prices.slice(-period);
        return slice.reduce((a, b) => a + b) / period;
    },

    calculateEMA(prices, period) {
        if (prices.length < period) return this.calculateSMA(prices, prices.length);
        
        const k = 2 / (period + 1);
        let ema = this.calculateSMA(prices.slice(0, period), period);
        
        for (let i = period; i < prices.length; i++) {
            ema = (prices[i] * k) + (ema * (1 - k));
        }
        
        return ema;
    },

    calculateMACD(prices, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
        if (prices.length < slowPeriod + signalPeriod) return null;
        
        const fastEMA = this.calculateEMA(prices, fastPeriod);
        const slowEMA = this.calculateEMA(prices, slowPeriod);
        const macdLine = fastEMA - slowEMA;
        
        // برای signal line نیاز به محاسبه EMA از macdLine داریم
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
    },

    analyzeTrend(prices) {
        if (prices.length < 20) return 'neutral';
        
        const shortSMA = this.calculateSMA(prices, 5);
        const mediumSMA = this.calculateSMA(prices, 10);
        const longSMA = this.calculateSMA(prices, 20);
        
        if (shortSMA > mediumSMA && mediumSMA > longSMA) return 'up';
        if (shortSMA < mediumSMA && mediumSMA < longSMA) return 'down';
        return 'neutral';
    }
};