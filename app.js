// --- Constants & Utilities ---
const STORAGE_KEY = 'nexus_data';
const DEFAULT_AVATAR = (name) => `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=8B5CF6&color=fff&size=150`;

const generateId = () => '_' + Math.random().toString(36).substr(2, 9);
const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return '今';
    if (diffMins < 60) return `${diffMins}分`;
    if (diffHours < 24) return `${diffHours}時間`;
    if (diffDays < 7) return `${diffDays}日`;
    
    return `${date.getMonth() + 1}月${date.getDate()}日`;
};

// --- Storage Management ---
class StorageManager {
    static loadData() {
        const data = localStorage.getItem(STORAGE_KEY);
        if (data) {
            return JSON.parse(data);
        }
        // Default initial data
        return {
            currentUser: {
                id: 'user_1',
                username: 'ゲスト',
                handle: 'guest',
                avatar: DEFAULT_AVATAR('ゲスト'),
                bio: 'Nexusへようこそ！これはあなたのプロフィールです。'
            },
            tweets: [
                {
                    id: 'tweet_1',
                    authorId: 'user_1',
                    content: 'Nexusへようこそ！オフラインでも動作するSNSアプリです。',
                    timestamp: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
                    likes: [],
                    replies: [] // Array of reply tweet IDs
                }
            ]
        };
    }

    static saveData(data) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }
}

// --- App Class ---
class App {
    constructor() {
        this.data = StorageManager.loadData();
        this.currentView = 'home';
        this.currentThreadTweetId = null;
        this.replyTargetId = null;

        this.initElements();
        this.bindEvents();
        this.updateCurrentUserUI();
        this.renderHome();
    }

    initElements() {
        // Views
        this.views = {
            home: document.getElementById('view-home'),
            profile: document.getElementById('view-profile'),
            thread: document.getElementById('view-thread')
        };
        
        // Navigation
        this.navItems = document.querySelectorAll('.nav-item');
        
        // UI Elements
        this.timelines = {
            home: document.getElementById('timeline'),
            profile: document.getElementById('profile-timeline'),
            threadMain: document.getElementById('thread-main-tweet'),
            threadReplies: document.getElementById('thread-replies')
        };
        
        // Modals
        this.editProfileModal = document.getElementById('edit-profile-modal');
        this.replyModal = document.getElementById('reply-modal');
    }

    bindEvents() {
        // Navigation
        this.navItems.forEach(item => {
            item.addEventListener('click', () => {
                const view = item.getAttribute('data-view');
                this.switchView(view);
            });
        });

        // Back buttons
        document.getElementById('profile-back-btn').addEventListener('click', () => this.switchView('home'));
        document.getElementById('thread-back-btn').addEventListener('click', () => this.switchView('home'));

        // Compose tweet
        const tweetInput = document.getElementById('tweet-input');
        const postTweetBtn = document.getElementById('post-tweet-btn');
        const tweetCharCount = document.getElementById('tweet-char-count');

        tweetInput.addEventListener('input', (e) => {
            const length = e.target.value.length;
            this.updateCharCount(length, 140, tweetCharCount, postTweetBtn);
        });

        postTweetBtn.addEventListener('click', () => {
            const content = tweetInput.value.trim();
            if (content) {
                this.postTweet(content);
                tweetInput.value = '';
                this.updateCharCount(0, 140, tweetCharCount, postTweetBtn);
            }
        });

        // Profile Edit
        document.getElementById('edit-profile-btn').addEventListener('click', () => this.openEditProfileModal());
        document.getElementById('close-profile-modal').addEventListener('click', () => this.closeModals());
        document.getElementById('save-profile-btn').addEventListener('click', () => this.saveProfile());

        // Reply Modal
        document.getElementById('close-reply-modal').addEventListener('click', () => this.closeModals());
        const replyInput = document.getElementById('reply-input');
        const postReplyBtn = document.getElementById('post-reply-btn');
        const replyCharCount = document.getElementById('reply-char-count');

        replyInput.addEventListener('input', (e) => {
            const length = e.target.value.length;
            this.updateCharCount(length, 140, replyCharCount, postReplyBtn);
        });

        postReplyBtn.addEventListener('click', () => {
            const content = replyInput.value.trim();
            if (content && this.replyTargetId) {
                this.postReply(content, this.replyTargetId);
                replyInput.value = '';
                this.updateCharCount(0, 140, replyCharCount, postReplyBtn);
                this.closeModals();
            }
        });

        // Global click for modals
        window.addEventListener('click', (e) => {
            if (e.target === this.editProfileModal || e.target === this.replyModal) {
                this.closeModals();
            }
        });
        
        // Nav Tweet Button
        document.getElementById('nav-tweet-btn').addEventListener('click', () => {
            this.switchView('home');
            document.getElementById('tweet-input').focus();
        });
    }

    updateCharCount(length, max, countElement, btnElement) {
        countElement.textContent = `${length}/${max}`;
        if (length === 0 || length > max) {
            btnElement.disabled = true;
            countElement.className = 'char-count ' + (length > max ? 'danger' : '');
        } else {
            btnElement.disabled = false;
            if (length > max - 20) {
                countElement.className = 'char-count warning';
            } else {
                countElement.className = 'char-count';
            }
        }
    }

    switchView(viewName) {
        this.currentView = viewName;
        
        // Update nav UI
        this.navItems.forEach(item => {
            if (item.getAttribute('data-view') === viewName) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });

        // Switch sections
        Object.values(this.views).forEach(view => view.classList.remove('active'));
        if (this.views[viewName]) {
            this.views[viewName].classList.add('active');
        }

        // Render content
        if (viewName === 'home') {
            this.renderHome();
        } else if (viewName === 'profile') {
            this.renderProfile();
        } else if (viewName === 'thread') {
            this.renderThread();
        }
        
        window.scrollTo(0, 0);
    }

    updateCurrentUserUI() {
        const user = this.data.currentUser;
        
        // Nav mini profile
        document.getElementById('nav-avatar').src = user.avatar;
        document.getElementById('nav-username').textContent = user.username;
        document.getElementById('nav-handle').textContent = `@${user.handle}`;
        
        // Compose avatar
        document.getElementById('compose-avatar').src = user.avatar;
        document.getElementById('reply-modal-avatar').src = user.avatar;
    }

    // --- Tweeting Logic ---
    postTweet(content) {
        const tweet = {
            id: generateId(),
            authorId: this.data.currentUser.id,
            content: content,
            timestamp: new Date().toISOString(),
            likes: [],
            replies: []
        };

        this.data.tweets.unshift(tweet); // Add to beginning
        StorageManager.saveData(this.data);
        this.renderHome();
    }

    postReply(content, targetTweetId) {
        const reply = {
            id: generateId(),
            authorId: this.data.currentUser.id,
            content: content,
            timestamp: new Date().toISOString(),
            likes: [],
            parentId: targetTweetId
        };

        this.data.tweets.unshift(reply);
        
        // Add to parent's replies array
        const parentTweet = this.data.tweets.find(t => t.id === targetTweetId);
        if (parentTweet) {
            if (!parentTweet.replies) parentTweet.replies = [];
            parentTweet.replies.push(reply.id);
        }

        StorageManager.saveData(this.data);
        
        if (this.currentView === 'home') this.renderHome();
        else if (this.currentView === 'thread') this.renderThread();
        else if (this.currentView === 'profile') this.renderProfile();
    }

    toggleLike(tweetId) {
        const tweet = this.data.tweets.find(t => t.id === tweetId);
        if (!tweet) return;

        const userId = this.data.currentUser.id;
        const index = tweet.likes.indexOf(userId);

        if (index > -1) {
            tweet.likes.splice(index, 1); // Unlike
        } else {
            tweet.likes.push(userId); // Like
        }

        StorageManager.saveData(this.data);
        
        // Re-render current view to update like count
        if (this.currentView === 'home') this.renderHome();
        else if (this.currentView === 'thread') this.renderThread();
        else if (this.currentView === 'profile') this.renderProfile();
    }

    // --- Rendering ---
    getUser(id) {
        // Currently we only have the current user locally. 
        if (id === this.data.currentUser.id) {
            return this.data.currentUser;
        }
        return { username: '不明なユーザー', handle: 'unknown', avatar: DEFAULT_AVATAR('U') };
    }

    createTweetHTML(tweet, isThreadMain = false) {
        const user = this.getUser(tweet.authorId);
        const isLiked = tweet.likes.includes(this.data.currentUser.id);
        const repliesCount = tweet.replies ? tweet.replies.length : 0;
        
        const html = `
            <div class="tweet" data-id="${tweet.id}" ${isThreadMain ? 'style="border-bottom-width: 2px;"' : ''}>
                <img src="${user.avatar}" alt="avatar" class="avatar-medium">
                <div class="tweet-content-wrapper">
                    <div class="tweet-header">
                        <span class="tweet-name">${user.username}</span>
                        <span class="tweet-handle">@${user.handle}</span>
                        <span class="tweet-time">· ${formatDate(tweet.timestamp)}</span>
                    </div>
                    <div class="tweet-text">${this.escapeHTML(tweet.content)}</div>
                    <div class="tweet-actions">
                        <button class="action-btn reply" data-action="reply" data-id="${tweet.id}">
                            <i data-feather="message-circle"></i>
                            <span>${repliesCount > 0 ? repliesCount : ''}</span>
                        </button>
                        <button class="action-btn like ${isLiked ? 'liked' : ''}" data-action="like" data-id="${tweet.id}">
                            <i data-feather="heart"></i>
                            <span>${tweet.likes.length > 0 ? tweet.likes.length : ''}</span>
                        </button>
                    </div>
                </div>
            </div>
        `;
        return html;
    }

    renderHome() {
        // Get top-level tweets (no parentId)
        const topTweets = this.data.tweets.filter(t => !t.parentId).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        this.timelines.home.innerHTML = topTweets.map(t => this.createTweetHTML(t)).join('');
        this.attachTweetEvents(this.timelines.home);
        if (window.feather) feather.replace();
    }

    renderProfile() {
        const user = this.data.currentUser;
        
        document.getElementById('profile-avatar').src = user.avatar;
        document.getElementById('profile-name').textContent = user.username;
        document.getElementById('header-profile-name').textContent = user.username;
        document.getElementById('profile-handle').textContent = `@${user.handle}`;
        document.getElementById('profile-bio').textContent = user.bio;

        // User's tweets
        const userTweets = this.data.tweets.filter(t => t.authorId === user.id).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        this.timelines.profile.innerHTML = userTweets.map(t => this.createTweetHTML(t)).join('');
        this.attachTweetEvents(this.timelines.profile);
        if (window.feather) feather.replace();
    }

    renderThread() {
        const mainTweet = this.data.tweets.find(t => t.id === this.currentThreadTweetId);
        if (!mainTweet) return this.switchView('home');

        this.timelines.threadMain.innerHTML = this.createTweetHTML(mainTweet, true);
        
        const replies = this.data.tweets.filter(t => t.parentId === mainTweet.id).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        this.timelines.threadReplies.innerHTML = replies.map(t => this.createTweetHTML(t)).join('');

        this.attachTweetEvents(this.timelines.threadMain);
        this.attachTweetEvents(this.timelines.threadReplies);
        if (window.feather) feather.replace();
    }

    attachTweetEvents(container) {
        // Tweet click (open thread)
        container.querySelectorAll('.tweet').forEach(el => {
            el.addEventListener('click', (e) => {
                // Ignore if clicked on an action button
                if (e.target.closest('.action-btn')) return;
                
                const tweetId = el.getAttribute('data-id');
                this.currentThreadTweetId = tweetId;
                this.switchView('thread');
            });
        });

        // Action buttons
        container.querySelectorAll('.action-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent tweet click
                const action = btn.getAttribute('data-action');
                const tweetId = btn.getAttribute('data-id');

                if (action === 'like') {
                    this.toggleLike(tweetId);
                } else if (action === 'reply') {
                    this.openReplyModal(tweetId);
                }
            });
        });
    }

    // --- Modals ---
    openEditProfileModal() {
        const user = this.data.currentUser;
        document.getElementById('edit-name').value = user.username;
        document.getElementById('edit-handle').value = user.handle;
        document.getElementById('edit-bio').value = user.bio || '';
        this.editProfileModal.classList.add('active');
    }

    saveProfile() {
        const name = document.getElementById('edit-name').value.trim();
        const handle = document.getElementById('edit-handle').value.trim();
        const bio = document.getElementById('edit-bio').value.trim();

        if (!name || !handle) {
            alert('名前とユーザーIDは必須です。');
            return;
        }

        const user = this.data.currentUser;
        user.username = name;
        user.handle = handle;
        user.bio = bio;
        // Only update avatar URL if name changed to get a new initial
        user.avatar = DEFAULT_AVATAR(name);

        StorageManager.saveData(this.data);
        this.updateCurrentUserUI();
        this.closeModals();
        
        if (this.currentView === 'profile') {
            this.renderProfile();
        } else if (this.currentView === 'home') {
            this.renderHome();
        }
    }

    openReplyModal(tweetId) {
        const tweet = this.data.tweets.find(t => t.id === tweetId);
        if (!tweet) return;

        this.replyTargetId = tweetId;
        const user = this.getUser(tweet.authorId);

        const targetHTML = `
            <div class="tweet-header">
                <span class="tweet-name">${user.username}</span>
                <span class="tweet-handle">@${user.handle}</span>
            </div>
            <div class="tweet-text">${this.escapeHTML(tweet.content)}</div>
        `;
        document.getElementById('reply-target-content').innerHTML = targetHTML;
        
        this.replyModal.classList.add('active');
        document.getElementById('reply-input').focus();
    }

    closeModals() {
        this.editProfileModal.classList.remove('active');
        this.replyModal.classList.remove('active');
        this.replyTargetId = null;
    }

    escapeHTML(str) {
        return str.replace(/[&<>'"]/g, 
            tag => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                "'": '&#39;',
                '"': '&quot;'
            }[tag] || tag)
        );
    }
}

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});

// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./service-worker.js')
            .then(registration => {
                console.log('ServiceWorker registration successful');
            })
            .catch(err => {
                console.log('ServiceWorker registration failed: ', err);
            });
    });
}
