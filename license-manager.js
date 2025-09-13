class LicenseManager {
    constructor() {
        this.validLicenses = new Map();
        this.currentLicense = null;
        this.init();
    }

    init() {
        // لایسنس‌های معتبر - کاملاً ۲۰ کاراکتری
        this.validLicenses.set('A2PRO2024888ABCDEF12', {
            id: '001',
            customer: 'مشتری ویژه',
            expiresAt: null, // دائمی
            plan: 'premium',
            isActive: true,
            createdAt: new Date('2024-01-01')
        });

        this.validLicenses.set('TESTLICENSE123456789', {
            id: '002',
            customer: 'تست کاربر',
            expiresAt: null,
            plan: 'standard',
            isActive: true,
            createdAt: new Date('2024-01-01')
        });

        // لایسنس‌های اضافی برای تست
        this.validLicenses.set('A2BOT2024PROABCDEF12', {
            id: '003',
            customer: 'کاربر تستی',
            expiresAt: null,
            plan: 'premium',
            isActive: true,
            createdAt: new Date('2024-01-01')
        });


        // بارگذاری لایسنس از localStorage
        this.loadFromStorage();
        
        // بررسی کنسول برای دیباگ
        console.log('License Manager initialized');
        console.log('Available licenses:', Array.from(this.validLicenses.keys()));
    }

    validateLicense(key) {
        console.log('Validating license:', key);
        
        // بررسی دقیق فرمت لایسنس
        if (typeof key !== 'string' || key.length !== 20 || !/^[A-Z0-9]+$/.test(key)) {
            console.log('Invalid license format - must be 20 uppercase alphanumeric characters');
            return false;
        }

        const license = this.validLicenses.get(key);
        if (!license) {
            console.log('License not found in database');
            return false;
        }
        
        if (!license.isActive) {
            console.log('License is inactive');
            return false;
        }
        
        if (license.expiresAt && new Date() > new Date(license.expiresAt)) {
            console.log('License has expired');
            return false;
        }

        console.log('License is valid');
        return true;
    }

    activateLicense(key) {
        console.log('Activating license:', key);
        
        if (this.validateLicense(key)) {
            this.currentLicense = {
                key: key,
                data: this.validLicenses.get(key),
                activatedAt: new Date()
            };

            this.saveToStorage();
            console.log('License activated successfully');
            return true;
        }
        
        console.log('License activation failed');
        return false;
    }

    deactivateLicense() {
        console.log('Deactivating current license');
        this.currentLicense = null;
        localStorage.removeItem('a2_license');
    }

    getLicenseInfo() {
        return this.currentLicense;
    }

    saveToStorage() {
        if (this.currentLicense) {
            const licenseData = {
                key: this.currentLicense.key,
                activatedAt: this.currentLicense.activatedAt
            };
            localStorage.setItem('a2_license', JSON.stringify(licenseData));
            console.log('License saved to storage');
        }
    }

    loadFromStorage() {
        try {
            const saved = localStorage.getItem('a2_license');
            if (saved) {
                const data = JSON.parse(saved);
                console.log('Loaded license from storage:', data.key);
                
                if (this.validateLicense(data.key)) {
                    this.currentLicense = {
                        key: data.key,
                        data: this.validLicenses.get(data.key),
                        activatedAt: new Date(data.activatedAt)
                    };
                    console.log('License loaded successfully from storage');
                } else {
                    console.log('Stored license is invalid, removing from storage');
                    localStorage.removeItem('a2_license');
                }
            } else {
                console.log('No license found in storage');
            }
        } catch (error) {
            console.error('Error loading license:', error);
        }
    }

    isActive() {
        return this.currentLicense !== null;
    }

    // برای افزودن لایسنس جدید
    addLicense(key, customerData) {
        if (key.length !== 20 || !/^[A-Z0-9]+$/.test(key)) {
            throw new Error('لایسنس باید 20 کاراکتر و فقط شامل حروف بزرگ و اعداد باشد');
        }

        this.validLicenses.set(key, {
            id: String(this.validLicenses.size + 1).padStart(3, '0'),
            customer: customerData.name || 'مشتری جدید',
            expiresAt: customerData.expiresAt || null,
            plan: customerData.plan || 'premium',
            isActive: true,
            createdAt: new Date()
        });
        
        console.log('New license added:', key);
        return true;
    }

    // برای حذف لایسنس
    removeLicense(key) {
        const result = this.validLicenses.delete(key);
        console.log('License removed:', key, result);
        return result;
    }

    // دریافت همه لایسنس‌ها
    getAllLicenses() {
        return Array.from(this.validLicenses.entries());
    }
}

// ایجاد instance جهانی
window.licenseManager = new LicenseManager();