const { google } = require('googleapis');
const NodeCache = require('node-cache');
const db = require('../db/database');

// Initialize cache with automatic key deletion
const cache = new NodeCache({ 
    stdTTL: process.env.YOUTUBE_CACHE_TTL || 3600,
    checkperiod: 600 // Check for expired entries every 10 minutes
});

// Cache cleanup event
cache.on('expired', (key, value) => {
    console.log(`Cache entry expired for video: ${key}`);
    // Clean up database cache
    db.run('DELETE FROM video_cache WHERE video_id = ?', [key], (err) => {
        if (err) {
            console.error('Error cleaning up video cache:', err);
        }
    });
});

// Periodic database cache cleanup
setInterval(() => {
    const maxAge = process.env.YOUTUBE_CACHE_TTL || 3600;
    const cutoff = new Date(Date.now() - (maxAge * 1000)).toISOString();
    
    db.run('DELETE FROM video_cache WHERE timestamp < ?', [cutoff], function(err) {
        if (err) {
            console.error('Error during periodic cache cleanup:', err);
        } else if (this.changes > 0) {
            console.log(`Cleaned up ${this.changes} old cache entries`);
        }
    });
}, 3600000); // Run every hour

// Initialize YouTube API client
const youtube = google.youtube({
    version: 'v3',
    auth: process.env.YOUTUBE_API_KEY
});

// Extract video ID from YouTube URL
function extractVideoId(url) {
    try {
        const urlObj = new URL(url);
        if (urlObj.hostname.includes('youtube.com')) {
            return urlObj.searchParams.get('v');
        } else if (urlObj.hostname.includes('youtu.be')) {
            return urlObj.pathname.slice(1);
        }
    } catch (error) {
        // If URL parsing fails, check if the string might be a video ID
        if (/^[a-zA-Z0-9_-]{11}$/.test(url)) {
            return url;
        }
    }
    return null;
}

// Format duration from ISO 8601 to human readable
function formatDuration(isoDuration) {
    const match = isoDuration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
    const hours = (match[1] || '').replace('H', '');
    const minutes = (match[2] || '').replace('M', '');
    const seconds = (match[3] || '').replace('S', '');

    let result = '';
    if (hours) result += `${hours}:`;
    if (minutes) result += `${hours ? minutes.padStart(2, '0') : minutes}:`;
    else result += '0:';
    result += seconds.padStart(2, '0');

    return result;
}

// Convert ISO 8601 duration to seconds
function durationToSeconds(isoDuration) {
    const match = isoDuration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
    const hours = parseInt((match[1] || '').replace('H', '')) || 0;
    const minutes = parseInt((match[2] || '').replace('M', '')) || 0;
    const seconds = parseInt((match[3] || '').replace('S', '')) || 0;

    return hours * 3600 + minutes * 60 + seconds;
}

// Enhanced getVideoMetadata function
async function getVideoMetadata(videoUrl) {
    const videoId = extractVideoId(videoUrl);
    if (!videoId) {
        throw new Error('Invalid YouTube URL or video ID');
    }

    // Check memory cache first
    const cachedData = cache.get(videoId);
    if (cachedData) {
        return cachedData;
    }

    // Check database cache
    try {
        const dbCacheResult = await new Promise((resolve, reject) => {
            db.get('SELECT metadata FROM video_cache WHERE video_id = ?', [videoId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (dbCacheResult) {
            const metadata = JSON.parse(dbCacheResult.metadata);
            cache.set(videoId, metadata);
            return metadata;
        }
    } catch (error) {
        console.error('Error checking database cache:', error);
    }

    try {
        const response = await youtube.videos.list({
            part: ['snippet', 'contentDetails'],
            id: [videoId]
        });

        if (!response.data.items || response.data.items.length === 0) {
            throw new Error('Video not found or is private');
        }

        const video = response.data.items[0];
        const durationSecs = durationToSeconds(video.contentDetails.duration);
        
        // Check duration limit
        const maxDuration = process.env.YOUTUBE_MAX_DURATION || 600;
        if (durationSecs > maxDuration) {
            throw new Error(`Video duration exceeds limit of ${maxDuration} seconds`);
        }

        const metadata = {
            id: videoId,
            title: video.snippet.title,
            channelTitle: video.snippet.channelTitle,
            duration: formatDuration(video.contentDetails.duration),
            durationSecs,
            thumbnail: video.snippet.thumbnails.default.url
        };

        // Cache in memory
        cache.set(videoId, metadata);

        // Cache in database
        db.run(
            'INSERT OR REPLACE INTO video_cache (video_id, metadata) VALUES (?, ?)',
            [videoId, JSON.stringify(metadata)],
            (err) => {
                if (err) {
                    console.error('Error caching video metadata:', err);
                }
            }
        );

        return metadata;
    } catch (error) {
        if (error.code === 403) {
            throw new Error('YouTube API quota exceeded');
        }
        throw error;
    }
}

module.exports = {
    getVideoMetadata,
    extractVideoId,
    formatDuration
}; 