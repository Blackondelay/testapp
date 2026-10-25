// アプリ本体と Firebase SDK をキャッシュし、オフラインでも起動できるようにする
const CACHE_NAME = 'nexus-cache-v2';
const FIREBASE_VER = '10.12.2';
const APP_SHELL = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './firebase-config.js',
    './manifest.json',
    './icon.svg',
    `https://www.gstatic.com/firebasejs/${FIREBASE_VER}/firebase-app.js`,
    `https://www.gstatic.com/firebasejs/${FIREBASE_VER}/firebase-auth.js`,
    `https://www.gstatic.com/firebasejs/${FIREBASE_VER}/firebase-firestore.js`
];

self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(APP_SHELL)));
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
    );
    self.clients.claim();
});

// 自サイトのファイル & Firebase SDK のみ扱う（Firestore/Auth の通信はSDKに任せる）
self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    const isSelf = url.origin === self.location.origin;
    const isSdk = url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/');
    if (!isSelf && !isSdk) return;

    // Stale-While-Revalidate：キャッシュを即返しつつ、裏で最新版に更新
    event.respondWith(
        caches.open(CACHE_NAME).then(async (cache) => {
            const cached = await cache.match(req, { ignoreSearch: isSelf });
            const network = fetch(req).then(res => {
                if (res && res.ok) cache.put(req, res.clone());
                return res;
            }).catch(() => cached || (req.mode === 'navigate' ? cache.match('./index.html') : undefined));
            return cached || network;
        })
    );
});
