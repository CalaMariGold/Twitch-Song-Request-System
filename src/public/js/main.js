// Initialize socket connection
const socket = io();

// DOM Elements
const queueList = document.getElementById('queue-list');
const statusElement = document.getElementById('status');

// Queue state
let queueItems = [];

// Socket event listeners
socket.on('connect', () => {
    console.log('Connected to server');
});

socket.on('queueUpdate', (newQueue) => {
    queueItems = newQueue;
    renderQueue();
});

socket.on('queueStatus', (status) => {
    statusElement.textContent = status ? 'Active' : 'Paused';
    statusElement.className = status ? 'active' : 'paused';
});

// Render queue items
function renderQueue() {
    queueList.innerHTML = '';
    
    if (queueItems.length === 0) {
        queueList.innerHTML = '<div class="empty-queue">No songs in queue</div>';
        return;
    }

    queueItems.forEach((item, index) => {
        const queueItem = document.createElement('div');
        queueItem.className = 'queue-item';
        queueItem.innerHTML = `
            <div class="song-info">
                <div class="song-title">${item.song_title}</div>
                <div class="requester">Requested by: ${item.requester}</div>
            </div>
            <div class="request-type">${item.type}</div>
        `;
        queueList.appendChild(queueItem);
    });
}

// Initial queue render
renderQueue(); 