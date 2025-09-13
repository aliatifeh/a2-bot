const CACHE_NAME = 'a2bot-v1';
const urlsToCache = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './license-manager.js',
  './strategy.js',
  './manifest.json',
  './404.html',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/axios/1.4.0/axios.min.js'
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', function(event) {
  // برای درخواست‌های مربوط به لایسنس، از کش استفاده نکن
  if (event.request.url.includes('license') || event.request.method !== 'GET') {
    return fetch(event.request);
  }
  
  event.respondWith(
    caches.match(event.request)
      .then(function(response) {
        // اگر فایل در کش بود، از کش برگردان
        if (response) {
          return response;
        }
        
        // در غیر این صورت از شبکه بگیر
        return fetch(event.request).then(function(response) {
          // بررسی کنید که پاسخ معتبر است
          if(!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          // پاسخ را کلون کنید
          var responseToCache = response.clone();

          caches.open(CACHE_NAME)
            .then(function(cache) {
              cache.put(event.request, responseToCache);
            });

          return response;
        }).catch(function() {
          // اگر خطا رخ داد، صفحه 404 را برگردان
          return caches.match('./404.html');
        });
      })
  );
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(cacheName) {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});