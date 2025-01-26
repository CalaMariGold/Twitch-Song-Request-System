import { sortQueue, updateQueueStatus, renderQueue, escapeHtml } from './utils.js';

// Initialize socket connection
const socket = io();

// DOM Elements
const queueList = document.getElementById('queue-list');
const statusElement = document.getElementById('status');
const loginButton = document.getElementById('login-button');
const userProfile = document.getElementById('user-profile');
const userName = document.getElementById('user-name');
const logoutButton = document.getElementById('logout-button');

// Queue state
let queueItems = [];

// History state
let currentPage = 1;
let currentFilter = 'all';
let hasMore = true;

// Additional DOM Elements
const historyList = document.getElementById('history-list');
const historyFilter = document.getElementById('history-filter');
const loadMoreButton = document.getElementById('load-more');

// Check authentication status
async function checkAuth() {
    try {
        const response = await fetch('/auth/user');
        if (response.ok) {
            const user = await response.json();
            showUserProfile(user);
            // Future: Enable user-specific features here
        } else {
            showLoginButton();
        }
    } catch (error) {
        console.error('Error checking auth status:', error);
        showLoginButton();
    }
}

// Show user profile
function showUserProfile(user) {
    loginButton.style.display = 'none';
    userProfile.style.display = 'flex';
    userName.textContent = user.name;
}

// Show login button
function showLoginButton() {
    loginButton.style.display = 'flex';
    userProfile.style.display = 'none';
}

// Handle logout
logoutButton.addEventListener('click', async () => {
    try {
        const response = await fetch('/auth/logout', { method: 'POST' });
        if (response.ok) {
            showLoginButton();
            window.location.reload(); // Reload to reset state
        }
    } catch (error) {
        console.error('Error during logout:', error);
    }
});

// Socket event listeners
socket.on('connect', () => {
    console.log('Connected to server');
    fetchInitialQueue();
});

socket.on('queueUpdate', (data) => {
    handleQueueUpdate(data);
});

socket.on('queueStatus', (status) => {
    updateQueueStatus(statusElement, status);
});

// Error handling
socket.on('connect_error', (error) => {
    console.error('Connection error:', error);
    showError('Connection to server lost. Retrying...');
});

socket.on('error', (error) => {
    console.error('Socket error:', error);
    showError('An error occurred. Please refresh the page.');
});

// Queue update handler
function handleQueueUpdate(data) {
    if (Array.isArray(data)) {
        queueItems = data;
    } else if (data.type === 'add') {
        queueItems.push(data.request);
        queueItems = sortQueue(queueItems);
    } else if (data.type === 'remove') {
        queueItems = queueItems.filter(item => item.id !== data.requestId);
    }
    renderQueue(queueList, queueItems);
}

// Fetch initial queue state
async function fetchInitialQueue() {
    try {
        const response = await fetch('/api/queue');
        if (response.ok) {
            const data = await response.json();
            queueItems = data.queue;
            renderQueue(queueList, queueItems);
        } else {
            showError('Failed to load queue. Please refresh the page.');
        }
    } catch (error) {
        console.error('Error fetching queue:', error);
        showError('Failed to load queue. Please refresh the page.');
    }
}

// Show error message
function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    document.querySelector('.container').insertBefore(errorDiv, document.querySelector('main'));
    setTimeout(() => errorDiv.remove(), 5000);
}

// Create queue item element
function createQueueItemElement(item) {
    const queueItem = document.createElement('div');
    queueItem.className = 'queue-item';
    
    const thumbnailHtml = `
        <div class="thumbnail">
            <img src="${escapeHtml(item.thumbnail_url || '/images/default-thumbnail.png')}" 
                 alt="Video thumbnail"
                 onerror="this.src='/images/default-thumbnail.png'">
            ${item.video_duration ? `<span class="duration">${escapeHtml(item.video_duration)}</span>` : ''}
        </div>`;
        
    const songInfoHtml = `
        <div class="song-info">
            <div class="song-title">${escapeHtml(item.song_title)}</div>
            <div class="requester">Requested by: ${escapeHtml(item.requester || 'Anonymous')}</div>
            ${item.channel_name ? `<div class="channel">Channel: ${escapeHtml(item.channel_name)}</div>` : ''}
        </div>`;
        
    const requestTypeHtml = `
        <div class="request-type">${item.type === 'donation' ? 'Donation' : 'Channel Points'}</div>`;
    
    queueItem.innerHTML = thumbnailHtml + songInfoHtml + requestTypeHtml;
    return queueItem;
}

// Initial queue render
renderQueue(queueList, queueItems);

// Initialize
fetchInitialQueue(); // Fetch queue first
checkAuth(); // Then check auth status for user features

// Handle history filter change
historyFilter.addEventListener('change', (e) => {
    currentFilter = e.target.value;
    currentPage = 1;
    hasMore = true;
    historyList.innerHTML = '';
    fetchHistory();
});

// Handle load more
loadMoreButton.addEventListener('click', () => {
    if (hasMore) {
        currentPage++;
        fetchHistory();
    }
});

// Fetch history
async function fetchHistory() {
    try {
        const response = await fetch(`/api/queue/history?page=${currentPage}&type=${currentFilter}`);
        if (response.ok) {
            const data = await response.json();
            renderHistory(data.history, currentPage === 1);
            hasMore = data.hasMore;
            loadMoreButton.style.display = hasMore ? 'block' : 'none';
        } else {
            showError('Failed to load history. Please try again.');
        }
    } catch (error) {
        console.error('Error fetching history:', error);
        showError('Failed to load history. Please try again.');
    }
}

// Render history items
function renderHistory(items, replace = false) {
    if (replace) {
        historyList.innerHTML = '';
    }

    if (items.length === 0 && replace) {
        historyList.innerHTML = '<div class="empty-queue">No requests in history</div>';
        return;
    }

    const fragment = document.createDocumentFragment();
    items.forEach(item => {
        const historyItem = createHistoryItemElement(item);
        fragment.appendChild(historyItem);
    });
    historyList.appendChild(fragment);
}

// Create history item element
function createHistoryItemElement(item) {
    const historyItem = document.createElement('div');
    historyItem.className = 'history-item';
    
    const thumbnailHtml = `
        <div class="thumbnail">
            <img src="${escapeHtml(item.thumbnail_url || '/images/default-thumbnail.png')}" 
                 alt="Video thumbnail"
                 onerror="this.src='/images/default-thumbnail.png'">
            ${item.video_duration ? `<span class="duration">${escapeHtml(item.video_duration)}</span>` : ''}
        </div>`;
        
    const songInfoHtml = `
        <div class="song-info">
            <div class="song-title">${escapeHtml(item.song_title)}</div>
            <div class="requester">Requested by: ${escapeHtml(item.requester || 'Anonymous')}</div>
            ${item.channel_name ? `<div class="channel">Channel: ${escapeHtml(item.channel_name)}</div>` : ''}
            <div class="timestamp">Requested on: ${new Date(item.local_time).toLocaleString()}</div>
        </div>`;
        
    const requestTypeHtml = `
        <div class="request-type">${item.type === 'donation' ? 'Donation' : 'Channel Points'}</div>`;
    
    historyItem.innerHTML = thumbnailHtml + songInfoHtml + requestTypeHtml;
    return historyItem;
}

// Initialize history
fetchHistory(); 