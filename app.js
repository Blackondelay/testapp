// =============================================================
//  Nexus - Firebase版 (Authentication + Firestore + オフラインキャッシュ)
// =============================================================
import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
    getAuth, onAuthStateChanged, createUserWithEmailAndPassword,
    signInWithEmailAndPassword, signOut
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
    initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
    collection, doc, setDoc, updateDoc, onSnapshot, query, orderBy, limit,
    serverTimestamp, arrayUnion, arrayRemove, increment, writeBatch
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// ---------- Firebase 初期化 ----------
const fbApp = initializeApp(firebaseConfig);
const auth = getAuth(fbApp); // ログイン状態は端末内に保存され、ブラウザを閉じても維持
const db = initializeFirestore(fbApp, {
    // オフラインキャッシュ（IndexedDB）を有効化：オフラインでも閲覧・投稿可能
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});

// ユーザーIDを内部用メールアドレスに変換（利用者はメール不要）
const EMAIL_DOMAIN = 'nexus.app';
const toEmail = (handle) => `${handle.toLowerCase()}@${EMAIL_DOMAIN}`;
const HANDLE_RE = /^[a-zA-Z0-9_]{3,15}$/;
const MAX_LEN = 140;

// ---------- アイコン（インラインSVG：オフラインでも表示） ----------
const ICON_PATHS = {
    hexagon: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>',
    home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
    arrowLeft: '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
    search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
    x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    heart: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
    message: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
    wifiOff: '<line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/><path d="M10.71 5.05A16 16 0 0 1 22.58 9"/><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>'
};
const icon = (name) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON_PATHS[name] || ''}</svg>`;
const renderIcons = (root = document) =>
    root.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon); });

// ---------- ユーティリティ ----------
const $ = (id) => document.getElementById(id);
const escapeHTML = (str = '') => String(str).replace(/[&<>'"]/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));

// 名前から色付きイニシャルアバターを生成（外部サービス不要）
const avatarCache = new Map();
const makeAvatar = (name = '?', seed = '') => {
    const key = name + '|' + seed;
    if (avatarCache.has(key)) return avatarCache.get(key);
    let h = 0;
    for (const ch of seed || name) h = (h * 31 + ch.codePointAt(0)) >>> 0;
    const hue = h % 360;
    const initial = escapeHTML([...name.trim()][0] || '?').toUpperCase();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
        <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="hsl(${hue},75%,62%)"/><stop offset="1" stop-color="hsl(${(hue + 40) % 360},70%,45%)"/>
        </linearGradient></defs><rect width="100" height="100" fill="url(#g)"/>
        <text x="50" y="50" dy=".35em" text-anchor="middle" font-family="sans-serif" font-size="46" font-weight="700" fill="#fff">${initial}</text></svg>`;
    const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    avatarCache.set(key, url);
    return url;
};

// 画像を中央で正方形に切り抜き、指定サイズのJPEG(dataURL)に縮小する
// （Firestoreに直接保存するため 256px・約20〜40KB に抑える）
const resizeImage = (file, size) => new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
        const s = Math.min(img.width, img.height);
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, size, size); // 透過PNGの背景を白に
        ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image load failed')); };
    img.src = url;
});

const formatDate = (date) => {
    if (!date) return '';
    const diffMins = Math.floor((Date.now() - date.getTime()) / 60000);
    if (diffMins < 1) return '今';
    if (diffMins < 60) return `${diffMins}分`;
    const h = Math.floor(diffMins / 60);
    if (h < 24) return `${h}時間`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d}日`;
    return `${date.getMonth() + 1}月${date.getDate()}日`;
};

const AUTH_ERRORS = {
    'auth/email-already-in-use': 'このユーザーIDは既に使われています。',
    'auth/invalid-credential': 'ユーザーIDまたはパスワードが違います。',
    'auth/wrong-password': 'ユーザーIDまたはパスワードが違います。',
    'auth/user-not-found': 'ユーザーIDまたはパスワードが違います。',
    'auth/weak-password': 'パスワードは6文字以上にしてください。',
    'auth/too-many-requests': '試行回数が多すぎます。しばらくしてから再度お試しください。',
    'auth/network-request-failed': 'ログイン・新規登録にはインターネット接続が必要です。'
};

// =============================================================
//  App
// =============================================================
class App {
    constructor() {
        this.me = null;               // Firebase Auth ユーザー
        this.users = new Map();       // uid -> profile
        this.tweets = [];             // 全ツイート（新しい順）
        this.unsubs = [];
        this.view = 'home';
        this.profileUid = null;
        this.profileTab = 'posts';    // プロフィールのタブ（posts / likes）
        this.threadId = null;
        this.replyTargetId = null;
        this.authMode = 'login';
        this.searchTerm = '';
        this.pendingProfile = null;   // 新規登録直後のプロフィール（同期待ち中の表示用）

        renderIcons();
        this.bindAuthEvents();
        this.bindAppEvents();
        this.watchConnection();

        if (firebaseConfig.apiKey === 'YOUR_API_KEY') {
            this.showAuth();
            this.setAuthError('firebase-config.js に Firebase の設定値を貼り付けてください（SETUP.md 参照）。');
            return;
        }
        onAuthStateChanged(auth, (user) => user ? this.onLogin(user) : this.onLogout());
        setInterval(() => this.view !== 'thread' && this.render(), 60000); // 相対時刻の更新
    }

    // ---------- 画面切替 ----------
    hideSplash() { $('splash').classList.add('hidden'); }
    showAuth() { this.hideSplash(); $('app').hidden = true; $('auth-screen').hidden = false; }
    showApp() { this.hideSplash(); $('auth-screen').hidden = true; $('app').hidden = false; }

    watchConnection() {
        const update = () => $('offline-badge').classList.toggle('show', !navigator.onLine);
        window.addEventListener('online', update);
        window.addEventListener('offline', update);
        update();
    }

    toast(msg) {
        const t = $('toast');
        t.textContent = msg;
        t.classList.add('show');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => t.classList.remove('show'), 2500);
    }

    // ---------- 認証 ----------
    bindAuthEvents() {
        document.querySelectorAll('.auth-tab').forEach(tab =>
            tab.addEventListener('click', () => this.setAuthMode(tab.dataset.mode)));

        $('auth-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const handle = $('auth-handle').value.trim();
            const password = $('auth-password').value;
            const name = $('auth-name').value.trim();
            this.setAuthError('');

            if (!HANDLE_RE.test(handle)) return this.setAuthError('ユーザーIDは半角英数字と _ の3〜15文字で入力してください。');
            if (password.length < 6) return this.setAuthError('パスワードは6文字以上で入力してください。');
            if (this.authMode === 'register' && !name) return this.setAuthError('表示名を入力してください。');

            const btn = $('auth-submit');
            btn.disabled = true;
            try {
                if (this.authMode === 'register') {
                    this.pendingProfile = { username: name, handle: handle.toLowerCase(), bio: '' };
                    const cred = await createUserWithEmailAndPassword(auth, toEmail(handle), password);
                    await setDoc(doc(db, 'users', cred.user.uid), {
                        ...this.pendingProfile, createdAt: serverTimestamp()
                    });
                } else {
                    await signInWithEmailAndPassword(auth, toEmail(handle), password);
                }
                $('auth-form').reset();
            } catch (err) {
                console.error(err);
                this.pendingProfile = null;
                this.setAuthError(AUTH_ERRORS[err.code] || `エラーが発生しました（${err.code || err.message}）`);
            } finally {
                btn.disabled = false;
            }
        });
    }

    setAuthMode(mode) {
        this.authMode = mode;
        document.querySelectorAll('.auth-tab').forEach(t => t.classList.toggle('active', t.dataset.mode === mode));
        $('auth-form').classList.toggle('register', mode === 'register');
        $('auth-submit').textContent = mode === 'register' ? 'アカウントを作成' : 'ログイン';
        $('auth-password').autocomplete = mode === 'register' ? 'new-password' : 'current-password';
        this.setAuthError('');
    }

    setAuthError(msg) { $('auth-error').textContent = msg; }

    onLogin(user) {
        this.me = user;
        this.showApp();
        this.unsubs.forEach(u => u());

        // ユーザー一覧をリアルタイム購読
        this.unsubs = [
            onSnapshot(collection(db, 'users'), (snap) => {
                snap.docChanges().forEach(ch => {
                    if (ch.type === 'removed') this.users.delete(ch.doc.id);
                    else this.users.set(ch.doc.id, ch.doc.data());
                });
                this.updateMyUI();
                this.render();
            }, (err) => console.error(err)),

            // ツイートをリアルタイム購読（最新500件）
            onSnapshot(query(collection(db, 'tweets'), orderBy('timestamp', 'desc'), limit(500)),
                { includeMetadataChanges: true },
                (snap) => {
                    this.tweets = snap.docs.map(d => {
                        const data = d.data({ serverTimestamps: 'estimate' });
                        return {
                            id: d.id, ...data,
                            date: data.timestamp?.toDate?.() || new Date(),
                            pending: d.metadata.hasPendingWrites
                        };
                    });
                    this.render();
                }, (err) => console.error(err))
        ];

        this.updateMyUI();
        this.switchView('home');
    }

    onLogout() {
        this.unsubs.forEach(u => u());
        this.unsubs = [];
        this.me = null;
        this.users.clear();
        this.tweets = [];
        this.closeModals();
        this.setAuthMode('login');
        this.showAuth();
    }

    // ---------- ユーザー情報 ----------
    getUser(uid) {
        const u = this.users.get(uid)
            || (uid === this.me?.uid && this.pendingProfile)
            || (uid === this.me?.uid && { username: this.me.email.split('@')[0], handle: this.me.email.split('@')[0], bio: '' })
            || { username: '不明なユーザー', handle: 'unknown', bio: '' };
        // アップロード画像があればそれを、無ければイニシャルアバターを使う
        return { ...u, avatar: u.avatar || makeAvatar(u.username, uid) };
    }

    updateMyUI() {
        if (!this.me) return;
        const me = this.getUser(this.me.uid);
        ['nav-avatar', 'compose-avatar', 'reply-modal-avatar'].forEach(id => { $(id).src = me.avatar; });
        $('nav-username').textContent = me.username;
        $('nav-handle').textContent = '@' + me.handle;
    }

    // ---------- イベント ----------
    bindAppEvents() {
        document.querySelectorAll('.nav-item[data-view]').forEach(item =>
            item.addEventListener('click', () => {
                if (item.dataset.view === 'profile') this.profileUid = this.me.uid;
                this.switchView(item.dataset.view);
            }));
        $('nav-user').addEventListener('click', () => { this.profileUid = this.me.uid; this.switchView('profile'); });
        $('nav-logout').addEventListener('click', () => {
            if (confirm('ログアウトしますか？')) signOut(auth);
        });

        $('profile-back-btn').addEventListener('click', () => this.switchView('home'));
        $('thread-back-btn').addEventListener('click', () => this.switchView('home'));

        // 投稿
        const input = $('tweet-input'), postBtn = $('post-tweet-btn'), count = $('tweet-char-count');
        input.addEventListener('input', () => this.updateCharCount(input.value.trim().length, count, postBtn));
        postBtn.addEventListener('click', () => {
            const content = input.value.trim();
            if (!content || content.length > MAX_LEN) return;
            this.postTweet(content);
            input.value = '';
            this.updateCharCount(0, count, postBtn);
        });
        $('nav-tweet-btn').addEventListener('click', () => { this.switchView('home'); input.focus(); });

        // プロフィール編集
        $('edit-profile-btn').addEventListener('click', () => this.openEditProfile());
        $('edit-avatar-file').addEventListener('change', (e) => this.onAvatarSelected(e.target.files[0]));
        $('edit-avatar-remove').addEventListener('click', () => {
            this.editAvatar = '';
            const me = this.getUser(this.me.uid);
            $('edit-avatar-preview').src = makeAvatar($('edit-name').value.trim() || me.username, this.me.uid);
        });
        document.querySelectorAll('.profile-tabs .tab').forEach(tab =>
            tab.addEventListener('click', () => { this.profileTab = tab.dataset.tab; this.renderProfile(); }));
        $('close-profile-modal').addEventListener('click', () => this.closeModals());
        $('save-profile-btn').addEventListener('click', () => this.saveProfile());

        // 返信
        const rInput = $('reply-input'), rBtn = $('post-reply-btn'), rCount = $('reply-char-count');
        $('close-reply-modal').addEventListener('click', () => this.closeModals());
        rInput.addEventListener('input', () => this.updateCharCount(rInput.value.trim().length, rCount, rBtn));
        rBtn.addEventListener('click', () => {
            const content = rInput.value.trim();
            if (!content || !this.replyTargetId || content.length > MAX_LEN) return;
            this.postReply(content, this.replyTargetId);
            rInput.value = '';
            this.updateCharCount(0, rCount, rBtn);
            this.closeModals();
        });

        // モーダル外クリック / Esc で閉じる
        document.querySelectorAll('.modal-overlay').forEach(m =>
            m.addEventListener('click', (e) => { if (e.target === m) this.closeModals(); }));
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.closeModals(); });

        // 検索
        $('search-input').addEventListener('input', (e) => {
            this.searchTerm = e.target.value.trim().toLowerCase();
            if (this.view !== 'home') this.switchView('home'); else this.render();
        });

        // タイムライン内のクリック（イベント委譲）
        document.querySelector('.main-content').addEventListener('click', (e) => this.onTimelineClick(e));
        $('user-list').addEventListener('click', (e) => {
            const item = e.target.closest('[data-uid]');
            if (item) { this.profileUid = item.dataset.uid; this.switchView('profile'); }
        });
    }

    onTimelineClick(e) {
        const actionBtn = e.target.closest('.action-btn');
        if (actionBtn) {
            e.stopPropagation();
            const id = actionBtn.dataset.id;
            if (actionBtn.dataset.action === 'like') this.toggleLike(id, actionBtn);
            else if (actionBtn.dataset.action === 'reply') this.openReply(id);
            return;
        }
        const userLink = e.target.closest('[data-user-link]');
        if (userLink) {
            e.stopPropagation();
            this.profileUid = userLink.dataset.userLink;
            this.switchView('profile');
            return;
        }
        const tweetEl = e.target.closest('.tweet[data-id]');
        if (tweetEl && !tweetEl.classList.contains('thread-main')) {
            this.threadId = tweetEl.dataset.id;
            this.switchView('thread');
        }
    }

    updateCharCount(len, countEl, btn) {
        countEl.textContent = `${len}/${MAX_LEN}`;
        btn.disabled = len === 0 || len > MAX_LEN;
        countEl.className = 'char-count' + (len > MAX_LEN ? ' danger' : len > MAX_LEN - 20 ? ' warning' : '');
    }

    switchView(view) {
        if (view === 'profile') this.profileTab = 'posts';
        this.view = view;
        document.querySelectorAll('.nav-item[data-view]').forEach(item =>
            item.classList.toggle('active',
                item.dataset.view === view && (view !== 'profile' || this.profileUid === this.me?.uid)));
        document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active'));
        $('view-' + view).classList.add('active');
        this.render();
        window.scrollTo(0, 0);
    }

    // ---------- 書き込み（オフライン時はキューされ、接続時に自動送信） ----------
    postTweet(content) {
        const ref = doc(collection(db, 'tweets'));
        setDoc(ref, {
            authorId: this.me.uid, content, timestamp: serverTimestamp(),
            likes: [], replyCount: 0, parentId: null
        }).catch(err => this.writeError(err));
        if (!navigator.onLine) this.toast('オフラインのため、接続時に送信されます');
    }

    postReply(content, parentId) {
        const batch = writeBatch(db);
        batch.set(doc(collection(db, 'tweets')), {
            authorId: this.me.uid, content, timestamp: serverTimestamp(),
            likes: [], replyCount: 0, parentId
        });
        batch.update(doc(db, 'tweets', parentId), { replyCount: increment(1) });
        batch.commit().catch(err => this.writeError(err));
        this.toast(navigator.onLine ? '返信しました' : 'オフラインのため、接続時に送信されます');
    }

    toggleLike(id, btn) {
        const tweet = this.tweets.find(t => t.id === id);
        if (!tweet) return;
        const liked = (tweet.likes || []).includes(this.me.uid);
        if (!liked) { btn.classList.add('pop'); setTimeout(() => btn.classList.remove('pop'), 400); }
        updateDoc(doc(db, 'tweets', id), {
            likes: liked ? arrayRemove(this.me.uid) : arrayUnion(this.me.uid)
        }).catch(err => this.writeError(err));
    }

    writeError(err) {
        console.error(err);
        this.toast('保存に失敗しました：' + (err.code || err.message));
    }

    // ---------- 描画 ----------
    tweetHTML(t, isMain = false) {
        const u = this.getUser(t.authorId);
        const liked = (t.likes || []).includes(this.me.uid);
        const likeCount = (t.likes || []).length;
        const parent = t.parentId && this.tweets.find(p => p.id === t.parentId);
        const replyTo = parent ? `<div class="reply-to">返信先: <span data-user-link="${parent.authorId}">@${escapeHTML(this.getUser(parent.authorId).handle)}</span></div>` : '';
        return `
        <article class="tweet ${isMain ? 'thread-main' : ''} ${t.pending ? 'pending' : ''}" data-id="${t.id}">
            <img src="${u.avatar}" alt="" class="avatar-medium" data-user-link="${t.authorId}">
            <div class="tweet-content-wrapper">
                <div class="tweet-header">
                    <span class="tweet-name" data-user-link="${t.authorId}">${escapeHTML(u.username)}</span>
                    <span class="tweet-handle">@${escapeHTML(u.handle)}</span>
                    <span class="tweet-time">· ${formatDate(t.date)}</span>
                    ${t.pending ? `<span class="pending-badge" title="送信待ち">${icon('clock')}</span>` : ''}
                </div>
                ${replyTo}
                <div class="tweet-text">${escapeHTML(t.content)}</div>
                <div class="tweet-actions">
                    <button class="action-btn reply" data-action="reply" data-id="${t.id}" aria-label="返信">
                        ${icon('message')}<span>${t.replyCount || ''}</span>
                    </button>
                    <button class="action-btn like ${liked ? 'liked' : ''}" data-action="like" data-id="${t.id}" aria-label="いいね">
                        ${icon('heart')}<span>${likeCount || ''}</span>
                    </button>
                </div>
            </div>
        </article>`;
    }

    listHTML(list, emptyMsg) {
        return list.length ? list.map(t => this.tweetHTML(t)).join('') : `<p class="empty">${emptyMsg}</p>`;
    }

    render() {
        if (!this.me) return;
        this.renderUserList();
        if (this.view === 'home') this.renderHome();
        else if (this.view === 'profile') this.renderProfile();
        else if (this.view === 'thread') this.renderThread();
    }

    renderHome() {
        let list = this.tweets.filter(t => !t.parentId);
        if (this.searchTerm) {
            list = this.tweets.filter(t => {
                const u = this.getUser(t.authorId);
                return [t.content, u.username, u.handle].some(s => s?.toLowerCase().includes(this.searchTerm));
            });
        }
        $('timeline').innerHTML = this.listHTML(list,
            this.searchTerm ? '該当するポストはありません。' : 'まだポストがありません。最初のポストをしてみましょう！');
    }

    renderProfile() {
        const uid = this.profileUid || this.me.uid;
        const u = this.getUser(uid);
        const isMe = uid === this.me.uid;
        $('profile-avatar').src = u.avatar;
        $('profile-name').textContent = u.username;
        $('header-profile-name').textContent = u.username;
        $('profile-handle').textContent = '@' + u.handle;
        $('profile-bio').textContent = u.bio || '';
        $('edit-profile-btn').style.visibility = isMe ? 'visible' : 'hidden';
        const mine = this.tweets.filter(t => t.authorId === uid);
        const liked = this.tweets.filter(t => (t.likes || []).includes(uid));
        const likesGot = mine.reduce((s, t) => s + (t.likes?.length || 0), 0);
        $('profile-stats').innerHTML = `<b>${mine.length}</b> ポスト　<b>${liked.length}</b> いいね済み　<b>${likesGot}</b> いいね獲得`;
        document.querySelectorAll('.profile-tabs .tab').forEach(t =>
            t.classList.toggle('active', t.dataset.tab === this.profileTab));
        $('profile-timeline').innerHTML = this.profileTab === 'likes'
            ? this.listHTML(liked, isMe ? 'まだいいねしたポストはありません。' : 'いいねしたポストはありません。')
            : this.listHTML(mine, 'まだポストがありません。');
    }

    renderThread() {
        const main = this.tweets.find(t => t.id === this.threadId);
        if (!main) { $('thread-main-tweet').innerHTML = '<p class="empty">ポストが見つかりません。</p>'; $('thread-replies').innerHTML = ''; return; }
        $('thread-main-tweet').innerHTML = this.tweetHTML(main, true);
        const replies = this.tweets.filter(t => t.parentId === main.id).sort((a, b) => a.date - b.date);
        $('thread-replies').innerHTML = this.listHTML(replies, 'まだ返信はありません。');
    }

    renderUserList() {
        const html = [...this.users.entries()]
            .map(([uid]) => ({ uid, ...this.getUser(uid) }))
            .sort((a, b) => (a.uid === this.me.uid ? -1 : b.uid === this.me.uid ? 1 : a.username.localeCompare(b.username)))
            .slice(0, 30)
            .map(u => `
                <div class="trend-item user-item" data-uid="${u.uid}">
                    <img src="${u.avatar}" alt="" class="avatar-small">
                    <div class="user-item-info">
                        <span class="trend-name">${escapeHTML(u.username)}${u.uid === this.me.uid ? ' <small>(あなた)</small>' : ''}</span>
                        <span class="trend-count">@${escapeHTML(u.handle)}</span>
                    </div>
                </div>`).join('');
        $('user-list').innerHTML = html || '<p class="empty small">ユーザーがいません</p>';
    }

    // ---------- モーダル ----------
    openEditProfile() {
        const me = this.getUser(this.me.uid);
        $('edit-name').value = me.username;
        $('edit-bio').value = me.bio || '';
        this.editAvatar = undefined; // undefined=変更なし / ''=削除 / dataURL=新しい画像
        $('edit-avatar-preview').src = me.avatar;
        $('edit-avatar-file').value = '';
        $('edit-profile-modal').classList.add('active');
    }

    async onAvatarSelected(file) {
        if (!file) return;
        if (!file.type.startsWith('image/')) return this.toast('画像ファイルを選択してください');
        try {
            this.editAvatar = await resizeImage(file, 256);
            $('edit-avatar-preview').src = this.editAvatar;
        } catch (err) {
            console.error(err);
            this.toast('この画像は読み込めませんでした（JPEG / PNG を推奨）');
        }
    }

    saveProfile() {
        const username = $('edit-name').value.trim();
        const bio = $('edit-bio').value.trim();
        if (!username) return alert('名前を入力してください。');
        const me = this.getUser(this.me.uid);
        const data = { username, bio, handle: me.handle };
        if (this.editAvatar !== undefined) data.avatar = this.editAvatar;
        setDoc(doc(db, 'users', this.me.uid), data, { merge: true })
            .catch(err => this.writeError(err));
        this.closeModals();
        this.toast('プロフィールを保存しました');
    }

    openReply(id) {
        const t = this.tweets.find(x => x.id === id);
        if (!t) return;
        this.replyTargetId = id;
        const u = this.getUser(t.authorId);
        $('reply-target-content').innerHTML = `
            <div class="tweet-header">
                <span class="tweet-name">${escapeHTML(u.username)}</span>
                <span class="tweet-handle">@${escapeHTML(u.handle)}</span>
            </div>
            <div class="tweet-text">${escapeHTML(t.content)}</div>`;
        $('reply-modal').classList.add('active');
        $('reply-input').focus();
    }

    closeModals() {
        document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
        this.replyTargetId = null;
    }
}

window.app = new App();

// ---------- Service Worker（アプリ本体のオフラインキャッシュ） ----------
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () =>
        navigator.serviceWorker.register('./service-worker.js').catch(err => console.warn('SW登録失敗', err)));
}
