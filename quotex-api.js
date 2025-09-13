// quotex-api.js - نسخه کاملاً پایدار با اتصال دائمی
class QuotexAPI {
    constructor() {
        this.socket = null;
        this.connected = false;
        this.prices = {};
        this.subscribedPairs = new Set();
        this.onPriceUpdate = null;
        this.onConnectionChange = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 100;
        this.heartbeatInterval = null;
        this.reconnectTimeout = null;
        this.isManuallyDisconnected = false;
        this.currentWsUrlIndex = 0;
        this.sessionId = null;
        this.lastPongTime = Date.now();
        this.connectionTimeout = null;
        this.connectionMonitorInterval = null;
        
        // لیست آدرس‌های WebSocket برای امتحان - بر اساس اطلاعات واقعی
        this.wsUrls = [
            'wss://ws2.qxbroker.com/socket.io/?EIO=3&transport=websocket',
            'wss://ws.qxbroker.com/socket.io/?EIO=3&transport=websocket',
            'wss://quotex.io/socket.io/?EIO=3&transport=websocket',
            'wss://ws3.qxbroker.com/socket.io/?EIO=3&transport=websocket',
            'wss://ws2.qxbroker.com/socket.io/?EIO=4&transport=websocket',
            'wss://ws.qxbroker.com/socket.io/?EIO=4&transport=websocket',
            'wss://qxbroker.com/socket.io/?EIO=3&transport=websocket'
        ];
    }

    async connect() {
        return new Promise((resolve, reject) => {
            try {
                if (this.isManuallyDisconnected) {
                    reject(new Error('اتصال به صورت دستی قطع شده است'));
                    return;
                }

                // اگر قبلاً متصل هستیم، resolve کن
                if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                    resolve();
                    return;
                }

                // انتخاب آدرس WebSocket از لیست
                const wsUrl = this.wsUrls[this.currentWsUrlIndex];
                console.log('🔌 در حال اتصال به:', wsUrl);
                
                this.socket = new WebSocket(wsUrl);
                
                // تنظیم timeout برای اتصال
                this.connectionTimeout = setTimeout(() => {
                    if (!this.connected) {
                        console.log('⏰ timeout اتصال');
                        this.socket.close();
                        this.handleConnectionError(new Error('اتصال timeout خورد'), reject);
                    }
                }, 15000);

                this.socket.onopen = () => {
                    clearTimeout(this.connectionTimeout);
                    console.log('✅ اتصال WebSocket موفقیت‌آمیز بود');
                    this.connected = true;
                    this.reconnectAttempts = 0;
                    this.lastPongTime = Date.now();
                    
                    if (this.onConnectionChange) {
                        this.onConnectionChange(true);
                    }
                    
                    this.startHeartbeat();
                    this.startConnectionMonitor();
                    
                    // ارسال پیام اولیه برای شروع session
                    setTimeout(() => {
                        if (this.connected) {
                            this.sendInitialHandshake();
                        }
                    }, 1000);
                    
                    resolve();
                };
                
                this.socket.onmessage = (event) => {
                    this.lastPongTime = Date.now();
                    this.handleMessage(event.data);
                };
                
                this.socket.onerror = (error) => {
                    clearTimeout(this.connectionTimeout);
                    console.log('❌ خطای WebSocket');
                    this.handleConnectionError(error, reject);
                };
                
                this.socket.onclose = (event) => {
                    clearTimeout(this.connectionTimeout);
                    console.log('🔌 اتصال بسته شد:', event.code);
                    this.handleConnectionClose();
                };
                
            } catch (error) {
                clearTimeout(this.connectionTimeout);
                console.log('❌ خطا در اتصال:', error);
                this.handleConnectionError(error, reject);
            }
        });
    }

    sendInitialHandshake() {
        try {
            // ارسال پیام‌های handshake برای شروع session
            const handshakeMessages = [
                '40',
                '42["authenticate",{"token":"guest"}]',
                '42["subscribe",{"name":"connection"}]'
            ];
            
            handshakeMessages.forEach((msg, index) => {
                setTimeout(() => {
                    if (this.connected) {
                        this.socket.send(msg);
                    }
                }, index * 300);
            });
            
        } catch (error) {
            console.log('⚠️ خطا در ارسال handshake:', error);
        }
    }

    handleMessage(data) {
        try {
            if (typeof data !== 'string') return;

            // پردازش پیام‌های heartbeat
            if (data === '2') {
                this.socket.send('3');
                return;
            }
            
            if (data === '3') {
                this.socket.send('2');
                return;
            }

            // پردازش اتصال Socket.IO
            if (data.startsWith('0')) {
                try {
                    const sessionData = JSON.parse(data.substring(1));
                    this.sessionId = sessionData.sid;
                    console.log('🔑 Session ID دریافت شد');
                } catch (e) {
                    console.log('⚠️ خطا در پردازش session');
                }
                return;
            }

            if (data === '40') {
                console.log('✅ اتصال Socket.IO برقرار شد');
                setTimeout(() => this.resubscribeAll(), 500);
                return;
            }

            // پردازش پیام‌های مختلف
            if (data.startsWith('42')) {
                this.processDataMessage(data);
            }

        } catch (error) {
            console.log('⚠️ خطا در پردازش پیام:', error);
        }
    }

    processDataMessage(data) {
        try {
            const jsonStr = data.substring(2);
            const parsedData = JSON.parse(jsonStr);
            
            if (!Array.isArray(parsedData)) return;

            const messageType = parsedData[0];
            const messageData = parsedData[1];

            switch (messageType) {
                case 'quotes':
                case 'quotes/stream':
                case 'price':
                case 'tick':
                case 'candle':
                    this.processPriceData(messageData);
                    break;
                    
                case 'authenticate':
                    console.log('🔑 احراز هویت انجام شد');
                    break;
                    
                case 'connection':
                    console.log('📡 وضعیت اتصال:', messageData);
                    break;
                    
                default:
                    console.log('📨 پیام ناشناخته:', messageType);
            }

        } catch (error) {
            console.log('⚠️ خطا در پردازش داده:', error);
        }
    }

    processPriceData(priceData) {
        try {
            let symbol = null;
            let price = null;

            // پردازش فرمت‌های مختلف داده قیمت
            if (priceData.data) {
                symbol = priceData.data.symbol;
                price = priceData.data.price;
            } else if (priceData.symbol) {
                symbol = priceData.symbol;
                price = priceData.price || priceData.close || priceData.bid || priceData.ask;
            }

            // ذخیره و ارسال قیمت
            if (symbol && price !== null && price !== undefined) {
                const numericPrice = parseFloat(price);
                if (!isNaN(numericPrice)) {
                    this.prices[symbol] = {
                        price: numericPrice,
                        timestamp: Date.now()
                    };

                    if (this.onPriceUpdate) {
                        this.onPriceUpdate(symbol, numericPrice);
                    }
                }
            }

        } catch (error) {
            console.log('⚠️ خطا در پردازش قیمت:', error);
        }
    }

    handleConnectionError(error, reject) {
        this.connected = false;
        this.stopAllIntervals();
        
        if (this.onConnectionChange) {
            this.onConnectionChange(false);
        }
        
        this.tryNextWsUrl();
        if (reject) reject(error);
        
        this.scheduleReconnect();
    }

    handleConnectionClose() {
        this.connected = false;
        this.stopAllIntervals();
        
        if (this.onConnectionChange) {
            this.onConnectionChange(false);
        }

        if (!this.isManuallyDisconnected) {
            this.scheduleReconnect();
        }
    }

    scheduleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.log('🚫 حداکثر تلاش برای اتصال مجدد');
            return;
        }

        this.reconnectAttempts++;
        const delay = Math.min(2000 * Math.pow(1.1, this.reconnectAttempts), 15000);
        
        console.log(`🔄 تلاش مجدد پس از ${delay}ms (تلاش ${this.reconnectAttempts})`);
        
        clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = setTimeout(() => {
            if (!this.connected && !this.isManuallyDisconnected) {
                this.connect().catch(err => console.log('⚠️ اتصال مجدد:', err.message));
            }
        }, delay);
    }

    tryNextWsUrl() {
        this.currentWsUrlIndex = (this.currentWsUrlIndex + 1) % this.wsUrls.length;
        console.log(`🔄 امتحان آدرس جدید: ${this.wsUrls[this.currentWsUrlIndex]}`);
    }

    startHeartbeat() {
        this.stopHeartbeat();
        
        this.heartbeatInterval = setInterval(() => {
            if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                try {
                    this.socket.send('2');
                } catch (error) {
                    console.log('⚠️ خطا در heartbeat');
                }
            }
        }, 8000); // هر 8 ثانیه
    }

    startConnectionMonitor() {
        this.stopConnectionMonitor();
        
        this.connectionMonitorInterval = setInterval(() => {
            if (this.connected) {
                const timeSinceLastPong = Date.now() - this.lastPongTime;
                if (timeSinceLastPong > 20000) { // 20 ثانیه بدون پاسخ
                    console.log('⚠️ عدم پاسخ از سرور، اتصال مجدد...');
                    this.handleConnectionClose();
                }
            }
        }, 3000); // چک هر 3 ثانیه
    }

    stopAllIntervals() {
        this.stopHeartbeat();
        this.stopConnectionMonitor();
    }

    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    stopConnectionMonitor() {
        if (this.connectionMonitorInterval) {
            clearInterval(this.connectionMonitorInterval);
            this.connectionMonitorInterval = null;
        }
    }

    subscribeToPair(pair) {
        const brokerPair = pair.replace('_', ' ');
        
        if (!this.connected) {
            this.subscribedPairs.add(brokerPair);
            if (!this.isManuallyDisconnected) {
                setTimeout(() => this.connect().catch(console.error), 1000);
            }
            return false;
        }

        try {
            const subscribeMessages = [
                `42["quotes/subscribe",{"symbol":"${brokerPair}"}]`,
                `42["subscribe/quotes",{"symbol":"${brokerPair}"}]`,
                `42["price/subscribe",{"symbol":"${brokerPair}"}]`,
                `42["subscribe",{"name":"quotes","symbol":"${brokerPair}"}]`
            ];

            subscribeMessages.forEach((msg, index) => {
                setTimeout(() => {
                    if (this.connected) {
                        try {
                            this.socket.send(msg);
                        } catch (error) {
                            console.log('⚠️ خطا در سابسکریب');
                        }
                    }
                }, index * 150);
            });

            this.subscribedPairs.add(brokerPair);
            console.log(`✅ سابسکریب به: ${brokerPair}`);
            return true;

        } catch (error) {
            console.log('❌ سابسکریب ناموفق:', error);
            return false;
        }
    }

    unsubscribeFromPair(pair) {
        if (!this.connected) return false;

        try {
            const brokerPair = pair.replace('_', ' ');
            const unsubscribeMessages = [
                `42["quotes/unsubscribe",{"symbol":"${brokerPair}"}]`,
                `42["unsubscribe",{"name":"quotes","symbol":"${brokerPair}"}]`
            ];

            unsubscribeMessages.forEach(msg => {
                try {
                    this.socket.send(msg);
                } catch (error) {
                    console.log('⚠️ خطا در آنسابسکریب');
                }
            });

            this.subscribedPairs.delete(brokerPair);
            console.log(`✅ آنسابسکریب از: ${brokerPair}`);
            return true;

        } catch (error) {
            console.log('❌ آنسابسکریب ناموفق:', error);
            return false;
        }
    }

    resubscribeAll() {
        if (!this.connected || this.subscribedPairs.size === 0) return;

        console.log('🔄 سابسکریب مجدد به همه جفت ارزها');
        const pairs = Array.from(this.subscribedPairs);
        
        pairs.forEach((pair, index) => {
            setTimeout(() => {
                if (this.connected) {
                    const subscribeMsg = `42["quotes/subscribe",{"symbol":"${pair}"}]`;
                    try {
                        this.socket.send(subscribeMsg);
                    } catch (error) {
                        console.log('⚠️ خطا در سابسکریب مجدد');
                    }
                }
            }, index * 100);
        });
    }

    disconnect() {
        console.log('🛑 قطع اتصال دستی');
        this.isManuallyDisconnected = true;
        this.stopAllIntervals();
        
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
        
        this.connected = false;
        this.subscribedPairs.clear();
        this.reconnectAttempts = 0;
        
        if (this.onConnectionChange) {
            this.onConnectionChange(false);
        }
    }

    reconnect() {
        console.log('🔄 اتصال مجدد دستی');
        this.isManuallyDisconnected = false;
        this.currentWsUrlIndex = 0;
        
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
        
        this.connect().catch(err => console.log('❌ اتصال مجدد دستی:', err.message));
    }

    getCurrentPrice(pair) {
        const brokerPair = pair.replace('_', ' ');
        return this.prices[brokerPair] || null;
    }

    isConnected() {
        return this.connected && this.socket && this.socket.readyState === WebSocket.OPEN;
    }

    getConnectionStatus() {
        return {
            connected: this.connected,
            reconnectAttempts: this.reconnectAttempts,
            currentUrl: this.wsUrls[this.currentWsUrlIndex],
            subscribedPairs: Array.from(this.subscribedPairs),
            sessionId: this.sessionId
        };
    }

    // اضافه کردن آدرس جدید
    addWebSocketUrl(url) {
        if (!this.wsUrls.includes(url)) {
            this.wsUrls.push(url);
            console.log(`➕ آدرس جدید اضافه شد: ${url}`);
        }
    }
}

// ایجاد instance جهانی
window.quotexAPI = new QuotexAPI();