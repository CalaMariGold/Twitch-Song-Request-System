// Shared utility functions for the song request system

// Sort queue by priority and timestamp
export function sortQueue(queueItems) {
    return queueItems.sort((a, b) => {
        if (b.priority !== a.priority) {
            return b.priority - a.priority;
        }
        return new Date(a.timestamp) - new Date(b.timestamp);
    });
}

// Escape HTML to prevent XSS
export function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Create queue item element
export function createQueueItemElement(item) {
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
            <div class="channel-name">${escapeHtml(item.channel_name || 'Unknown Channel')}</div>
            <div class="requester">Requested by: ${escapeHtml(item.requester || 'Anonymous')}</div>
        </div>`;
        
    const requestTypeHtml = `
        <div class="metadata">
            <div class="request-type">${item.type === 'donation' ? 'Donation' : 'Channel Points'}</div>
        </div>`;
    
    queueItem.innerHTML = thumbnailHtml + songInfoHtml + requestTypeHtml;
    return queueItem;
}

// Update queue status display
export function updateQueueStatus(statusElement, status) {
    statusElement.textContent = status ? 'Active' : 'Paused';
    statusElement.className = status ? 'active' : 'paused';
}

// Render queue items
export function renderQueue(queueList, queueItems) {
    queueList.innerHTML = '';
    
    if (queueItems.length === 0) {
        queueList.innerHTML = '<div class="empty-queue">No songs in queue</div>';
        return;
    }

    queueItems.forEach(item => {
        queueList.appendChild(createQueueItemElement(item));
    });
} 