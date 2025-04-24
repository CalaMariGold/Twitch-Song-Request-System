const chalk = require('chalk');
const { formatDuration, parseIsoDuration } = require('./helpers');

/**
 * Fetches details about a YouTube video from the YouTube API
 * @param {string} videoId - YouTube video ID
 * @returns {Promise<Object>} Video details including title, channel, duration, etc.
 */
async function fetchYouTubeDetails(videoId) {
    try {
        if (!process.env.YOUTUBE_API_KEY) {
            console.error(chalk.red('[YouTube] API key not configured in environment variables'))
            throw new Error('YouTube API key not configured')
        }

        const apiUrl = `https://www.googleapis.com/youtube/v3/videos?id=${videoId}&part=snippet,contentDetails&key=${process.env.YOUTUBE_API_KEY}`
        
        const response = await fetch(
            apiUrl,
            { headers: { 'Accept': 'application/json' } }
        )
        
        
        if (!response.ok) {
            console.error(chalk.red(`[YouTube] API error status: ${response.status} ${response.statusText}`))
            throw new Error(`YouTube API error: ${response.statusText}`)
        }

        const data = await response.json()
        
        if (!data.items?.[0]) {
            console.error(chalk.red('[YouTube] Video not found in API response for ID:'), videoId)
            throw new Error('Video not found')
        }
        
        const item = data.items[0]
        const duration = item.contentDetails.duration
        const durationSeconds = parseIsoDuration(duration)
        
        // Get the best available thumbnail
        const thumbnails = item.snippet.thumbnails
        const thumbnailUrl = thumbnails.maxres?.url || 
                           thumbnails.high?.url || 
                           thumbnails.medium?.url || 
                           thumbnails.default?.url || 
                           `https://img.youtube.com/vi/${videoId}/0.jpg` // Fallback direct URL
        
        return {
            title: item.snippet.title,
            channelTitle: item.snippet.channelTitle,
            channelId: item.snippet.channelId,
            duration: formatDuration(duration),
            durationSeconds,
            thumbnailUrl
        }
    } catch (error) {
        throw error
    }
}

module.exports = {
    fetchYouTubeDetails
}; 