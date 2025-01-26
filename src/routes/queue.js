const express = require('express');
const router = express.Router();
const db = require('../db/database');

// Helper function to sanitize input
function sanitizeInput(input) {
    if (typeof input !== 'string') return '';
    return input
        .trim()
        .replace(/[<>]/g, '') // Remove potential HTML tags
        .slice(0, 1000); // Limit length
}

// Helper function to validate YouTube URL
function isValidYouTubeUrl(url) {
    if (typeof url !== 'string') return false;
    return url.match(/^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\/.+$/i) !== null;
}

// Helper function to check if queue is enabled
async function isQueueEnabled() {
    return new Promise((resolve, reject) => {
        db.get('SELECT value FROM settings WHERE key = "queue_enabled"', [], (err, row) => {
            if (err) {
                console.error('Error checking queue status:', err);
                return reject(err);
            }
            resolve(row ? row.value === '1' : true);
        });
    });
}

// Helper function to ensure test user exists
async function ensureTestUser(userId, userName) {
    // Sanitize inputs
    userId = sanitizeInput(userId);
    userName = sanitizeInput(userName);
    
    if (!userId) {
        throw new Error('Invalid user ID');
    }
    
    return new Promise((resolve, reject) => {
        db.get('SELECT id FROM users WHERE twitch_id = ?', [userId], (err, row) => {
            if (err) {
                console.error('Error checking user:', err);
                return reject(err);
            }
            
            if (row) {
                resolve(row.id);
            } else {
                db.run('INSERT INTO users (twitch_id, name) VALUES (?, ?)',
                    [userId, userName || userId],
                    function(err) {
                        if (err) {
                            console.error('Error creating user:', err);
                            return reject(err);
                        }
                        resolve(this.lastID);
                    }
                );
            }
        });
    });
}

// Get current queue
router.get('/', async (req, res) => {
    console.log('Fetching queue');
    try {
        db.all(`
            SELECT r.*, u.name as requester,
                   r.video_duration, r.duration_seconds,
                   r.thumbnail_url, r.channel_name
            FROM requests r
            LEFT JOIN users u ON r.user_id = u.id
            ORDER BY r.priority DESC, r.timestamp ASC
        `, [], (err, rows) => {
            if (err) {
                console.error('Error fetching queue:', err);
                return res.status(500).json({ error: 'Failed to fetch queue' });
            }
            console.log('Queue fetched:', rows);
            res.json({ queue: rows });
        });
    } catch (error) {
        console.error('Error in GET /:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Add channel point request
router.post('/channel-point', async (req, res) => {
    console.log('Adding channel point request:', req.body);
    
    try {
        // Check if queue is enabled
        const enabled = await isQueueEnabled();
        if (!enabled) {
            return res.status(403).json({ error: 'Queue is currently paused' });
        }

        const { 
            user_id, song_title, song_link,
            video_duration, duration_seconds,
            thumbnail_url, channel_name
        } = req.body;
        
        // Validate and sanitize inputs
        if (!user_id || !song_link || !song_title) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        if (!isValidYouTubeUrl(song_link)) {
            return res.status(400).json({ error: 'Invalid YouTube URL' });
        }
        
        const sanitizedData = {
            song_title: sanitizeInput(song_title),
            song_link: sanitizeInput(song_link),
            video_duration: sanitizeInput(video_duration),
            thumbnail_url: sanitizeInput(thumbnail_url),
            channel_name: sanitizeInput(channel_name),
            duration_seconds: typeof duration_seconds === 'number' ? Math.max(0, duration_seconds) : 0
        };

        const userId = await ensureTestUser(user_id);
        
        db.run(`
            INSERT INTO requests (
                user_id, song_title, song_link,
                type, priority,
                video_duration, duration_seconds,
                thumbnail_url, channel_name
            )
            VALUES (?, ?, ?, 'channel_point', 1, ?, ?, ?, ?)
        `, [
            userId, sanitizedData.song_title, sanitizedData.song_link,
            sanitizedData.video_duration, sanitizedData.duration_seconds,
            sanitizedData.thumbnail_url, sanitizedData.channel_name
        ], function(err) {
            if (err) {
                console.error('Error adding request:', err);
                return res.status(500).json({ error: 'Failed to add request' });
            }
            
            console.log('Channel point request added:', this.lastID);
            
            // Notify connected clients about the queue update
            req.app.get('io').emit('queueUpdate', { type: 'add', request: {
                id: this.lastID,
                user_id: userId,
                ...sanitizedData,
                type: 'channel_point',
                requester: user_id
            }});
            
            res.status(201).json({ message: 'Request added successfully' });
        });
    } catch (error) {
        console.error('Error in POST /channel-point:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Add donation request
router.post('/donation', async (req, res) => {
    console.log('Adding donation request:', req.body);
    
    try {
        // Check if queue is enabled
        const enabled = await isQueueEnabled();
        if (!enabled) {
            return res.status(403).json({ error: 'Queue is currently paused' });
        }

        const { 
            user_id, song_title, song_link, donation_amount,
            video_duration, duration_seconds,
            thumbnail_url, channel_name
        } = req.body;
        
        // Validate and sanitize inputs
        if (!user_id || !song_link || !song_title || !donation_amount) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        if (!isValidYouTubeUrl(song_link)) {
            return res.status(400).json({ error: 'Invalid YouTube URL' });
        }
        
        if (typeof donation_amount !== 'number' || donation_amount <= 0) {
            return res.status(400).json({ error: 'Invalid donation amount' });
        }
        
        const sanitizedData = {
            song_title: sanitizeInput(song_title),
            song_link: sanitizeInput(song_link),
            video_duration: sanitizeInput(video_duration),
            thumbnail_url: sanitizeInput(thumbnail_url),
            channel_name: sanitizeInput(channel_name),
            duration_seconds: typeof duration_seconds === 'number' ? Math.max(0, duration_seconds) : 0,
            donation_amount: Math.max(0, donation_amount)
        };

        const userId = await ensureTestUser(user_id);
        
        db.run(`
            INSERT INTO requests (
                user_id, song_title, song_link,
                type, priority,
                video_duration, duration_seconds,
                thumbnail_url, channel_name
            )
            VALUES (?, ?, ?, 'donation', 2, ?, ?, ?, ?)
        `, [
            userId, sanitizedData.song_title, sanitizedData.song_link,
            sanitizedData.video_duration, sanitizedData.duration_seconds,
            sanitizedData.thumbnail_url, sanitizedData.channel_name
        ], function(err) {
            if (err) {
                console.error('Error adding donation request:', err);
                return res.status(500).json({ error: 'Failed to add request' });
            }
            
            console.log('Donation request added:', this.lastID);
            
            req.app.get('io').emit('queueUpdate', { type: 'add', request: {
                id: this.lastID,
                user_id: userId,
                ...sanitizedData,
                type: 'donation',
                requester: user_id
            }});
            
            res.status(201).json({ message: 'Donation request added successfully' });
        });
    } catch (error) {
        console.error('Error in POST /donation:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Remove request from queue
router.delete('/:requestId', async (req, res) => {
    const { requestId } = req.params;
    console.log('Removing request:', requestId);
    
    try {
        db.run('DELETE FROM requests WHERE id = ?', [requestId], function(err) {
            if (err) {
                console.error('Error removing request:', err);
                return res.status(500).json({ error: 'Failed to remove request' });
            }
            
            if (this.changes === 0) {
                return res.status(404).json({ error: 'Request not found' });
            }
            
            console.log('Request removed:', requestId);
            req.app.get('io').emit('queueUpdate', { type: 'remove', requestId: parseInt(requestId) });
            res.json({ message: 'Request removed successfully' });
        });
    } catch (error) {
        console.error('Error in DELETE /:requestId:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Clear entire queue
router.delete('/', async (req, res) => {
    console.log('Clearing entire queue');
    
    try {
        db.run('DELETE FROM requests', function(err) {
            if (err) {
                console.error('Error clearing queue:', err);
                return res.status(500).json({ error: 'Failed to clear queue' });
            }
            
            console.log('Queue cleared');
            req.app.get('io').emit('queueUpdate', []);
            res.json({ message: 'Queue cleared successfully' });
        });
    } catch (error) {
        console.error('Error in DELETE /:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Toggle queue status
router.post('/status', async (req, res) => {
    const { enabled } = req.body;
    console.log('Toggling queue status:', enabled);
    
    if (typeof enabled !== 'boolean') {
        return res.status(400).json({ error: 'Invalid status value' });
    }

    try {
        db.run(`
            INSERT OR REPLACE INTO settings (key, value)
            VALUES ('queue_enabled', ?)
        `, [enabled ? '1' : '0'], (err) => {
            if (err) {
                console.error('Error updating queue status:', err);
                return res.status(500).json({ error: 'Failed to update queue status' });
            }
            
            console.log('Queue status updated:', enabled);
            req.app.get('io').emit('queueStatus', enabled);
            res.json({ message: 'Queue status updated successfully' });
        });
    } catch (error) {
        console.error('Error in POST /status:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get queue status
router.get('/status', async (req, res) => {
    try {
        const enabled = await isQueueEnabled();
        res.json({ enabled });
    } catch (error) {
        console.error('Error in GET /status:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get queue history
router.get('/history', async (req, res) => {
    const { page = 1, limit = 10, type = 'all' } = req.query;
    const offset = (page - 1) * limit;
    
    try {
        let query = `
            SELECT r.*, u.name as requester,
                   datetime(r.timestamp, 'localtime') as local_time
            FROM requests r
            LEFT JOIN users u ON r.user_id = u.id
        `;
        
        const params = [];
        if (type !== 'all') {
            query += ' WHERE r.type = ?';
            params.push(type);
        }
        
        query += ' ORDER BY r.timestamp DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);

        db.all(query, params, (err, rows) => {
            if (err) {
                console.error('Error fetching queue history:', err);
                return res.status(500).json({ error: 'Failed to fetch queue history' });
            }

            // Get total count for pagination
            let countQuery = 'SELECT COUNT(*) as total FROM requests';
            if (type !== 'all') {
                countQuery += ' WHERE type = ?';
            }

            db.get(countQuery, type !== 'all' ? [type] : [], (err, count) => {
                if (err) {
                    console.error('Error getting total count:', err);
                    return res.status(500).json({ error: 'Failed to get total count' });
                }

                res.json({
                    history: rows,
                    total: count.total,
                    hasMore: offset + rows.length < count.total
                });
            });
        });
    } catch (error) {
        console.error('Error in GET /history:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router; 