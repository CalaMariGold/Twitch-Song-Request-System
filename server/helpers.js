/**
 * Collection of helper utility functions used across the application
 */

/**
 * Formats a duration in seconds to a human-readable string (MM:SS or HH:MM:SS)
 * @param {number} totalSeconds - The duration in seconds
 * @returns {string} Formatted duration string
 */
function formatDurationFromSeconds(totalSeconds) {
    if (totalSeconds === null || totalSeconds === undefined || totalSeconds < 0) {
        return '0:00';
    }
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const paddedSeconds = seconds.toString().padStart(2, '0');

    if (hours > 0) {
        const paddedMinutes = minutes.toString().padStart(2, '0');
        return `${hours}:${paddedMinutes}:${paddedSeconds}`;
    } else {
        return `${minutes}:${paddedSeconds}`;
    }
}

/**
 * Parses an ISO 8601 duration string to total seconds
 * @param {string} isoDuration - ISO 8601 duration string (e.g. PT1H2M3S)
 * @returns {number} Total duration in seconds
 */
function parseIsoDuration(isoDuration) {
    const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
    if (!match) return 0
    
    const hours = match[1] ? parseInt(match[1]) : 0
    const minutes = match[2] ? parseInt(match[2]) : 0
    const seconds = match[3] ? parseInt(match[3]) : 0
    
    return hours * 3600 + minutes * 60 + seconds
}

/**
 * Formats an ISO 8601 duration to a human-readable string
 * @param {string} isoDuration - ISO 8601 duration string (e.g. PT1H2M3S)
 * @returns {string} Formatted duration string
 */
function formatDuration(isoDuration) {
    try {
        let durationStr = isoDuration.replace("PT", "")
        let hours = 0, minutes = 0, seconds = 0

        const hIndex = durationStr.indexOf("H")
        const mIndex = durationStr.indexOf("M")
        const sIndex = durationStr.indexOf("S")

        if (hIndex > 0) {
            hours = parseInt(durationStr.substring(0, hIndex))
            durationStr = durationStr.substring(hIndex + 1)
        }

        if (mIndex > 0) {
            minutes = parseInt(durationStr.substring(0, mIndex))
            durationStr = durationStr.substring(mIndex + 1)
        }

        if (sIndex > 0) {
            seconds = parseInt(durationStr.substring(0, sIndex))
        }

        // Pad minutes only if hours are present
        const paddedMinutes = hours > 0 ? minutes.toString().padStart(2, '0') : minutes.toString();
        const paddedSeconds = seconds.toString().padStart(2, '0');

        return hours > 0 ?
            `${hours}:${paddedMinutes}:${paddedSeconds}` :
            `${minutes}:${paddedSeconds}`;
    } catch (error) {
        console.error('Error formatting duration:', error)
        return '0:00'
    }
}

/**
 * Extracts a YouTube video ID from a URL
 * @param {string} urlStr - YouTube URL
 * @returns {string|null} Video ID or null if not found
 */
function extractVideoId(urlStr) {
    if (!urlStr) {
        return null
    }
    const match = urlStr.match(/(?:youtube\.com\/watch\?v=|youtu.be\/)([^&\n?#]+)/)
    const result = match ? match[1] : null
    return result
}

/**
 * Find a YouTube URL in a text string
 * @param {string} text - Text to search in
 * @returns {string|null} YouTube URL or null if not found
 */
function extractYouTubeUrlFromText(text) {
    if (!text) return null;
    // Basic regex to find YouTube watch URLs or short URLs
    const regex = /(https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+))/i;
    const match = text.match(regex);
    return match ? match[0] : null; // Return the full matched URL
}

module.exports = {
    formatDurationFromSeconds,
    parseIsoDuration,
    formatDuration,
    extractVideoId,
    extractYouTubeUrlFromText
}; 