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

/**
 * Find a Spotify Track URL in a text string
 * @param {string} text - Text to search in
 * @returns {string|null} Spotify Track URL or null if not found
 */
function extractSpotifyUrlFromText(text) {
    if (!text) return null;
    // Improved regex to find Spotify track URLs even when surrounded by text without spaces
    // This looks for the core pattern 'open.spotify.com' and extracts the full URL
    const regex = /(https?:\/\/open\.spotify\.com\/(?:intl-[a-z]{2}\/)?track\/[a-zA-Z0-9]{22})/i;
    const match = text.match(regex);
    return match ? match[1] : null;
}

/**
 * Find a Spotify Album URL in a text string
 * @param {string} text - Text to search in
 * @returns {string|null} Spotify Album URL or null if not found
 */
function extractSpotifyAlbumUrlFromText(text) {
    if (!text) return null;
    const regex = /(https?:\/\/open\.spotify\.com\/(?:intl-[a-z]{2}\/)?album\/[a-zA-Z0-9]{22})/i;
    const match = text.match(regex);
    return match ? match[1] : null;
}

/**
 * Check if text contains a YouTube URL, Spotify URL, or should be treated as a search query.
 * @param {string} text - Text to analyze
 * @returns {Object} { type: 'youtube'|'spotifyUrl'|'spotifyAlbumUrl'|'text'|'none', value: string|null }
 */
function analyzeRequestText(text) {
    if (!text) {
        return { type: 'none', value: null };
    }
    
    const trimmedText = text.trim();
    
    // Prioritize URLs: Check for YouTube first
    const youtubeUrl = extractYouTubeUrlFromText(trimmedText);
    if (youtubeUrl) {
        return { type: 'youtube', value: youtubeUrl };
    }
    
    // Check for Spotify Track URL next
    const spotifyUrl = extractSpotifyUrlFromText(trimmedText);
    if (spotifyUrl) {
        return { type: 'spotifyUrl', value: spotifyUrl };
    }

    // Check for Spotify Album URL
    const spotifyAlbumUrl = extractSpotifyAlbumUrlFromText(trimmedText);
    if (spotifyAlbumUrl) {
        return { type: 'spotifyAlbumUrl', value: spotifyAlbumUrl };
    }
    
    // If no URL found, treat the entire text as a search query
    // Ensure the text isn't just whitespace after trimming
    if (trimmedText.length > 0) {
        return { type: 'text', value: trimmedText };
    } else {
        // Input was just whitespace
        return { type: 'none', value: null };
    }
}

/**
 * Checks if a song request is blacklisted based on title, artist, or keywords.
 * @param {string} title - The song title.
 * @param {string} artist - The song artist.
 * @param {Array<Object>} blacklist - The blacklist array from the application state.
 * @returns {Object|null} The matching blacklist item if found, otherwise null.
 */
function checkBlacklist(title, artist, blacklist) {
    if (!blacklist || blacklist.length === 0) {
        return null; // No blacklist to check against
    }

    const songTitleLower = title.toLowerCase();
    const artistNameLower = artist.toLowerCase();

    for (const item of blacklist) {
        const termLower = item.term.toLowerCase();
        switch (item.type) {
            case 'song':
                if (songTitleLower.includes(termLower)) {
                    return item; // Found blacklisted song title
                }
                break;
            case 'artist':
                if (artistNameLower.includes(termLower)) {
                    return item; // Found blacklisted artist
                }
                break;
            case 'keyword':
                if (songTitleLower.includes(termLower) || artistNameLower.includes(termLower)) {
                    return item; // Found blacklisted keyword in title or artist
                }
                break;
            default:
                console.warn(`[Blacklist] Unknown blacklist type: ${item.type}`);
                break;
        }
    }

    return null; // No blacklist match found
}

/**
 * Checks if a user is blocked from making requests.
 * @param {string} username - The username to check.
 * @param {Array<Object>} blockedUsers - The blocked users array from the application state.
 * @returns {boolean} True if the user is blocked, false otherwise.
 */
function isUserBlocked(username, blockedUsers) {
    if (!blockedUsers || blockedUsers.length === 0) return false;
    return blockedUsers.some(user => user.username.toLowerCase() === username.toLowerCase());
}

/**
 * Validates the duration of a song request based on its type.
 * @param {number} durationSeconds - The duration of the song in seconds.
 * @param {string} requestType - The type of request ('donation' or 'channelPoint').
 * @param {number} maxDonationSeconds - The maximum duration for donations.
 * @param {number} maxChannelPointSeconds - The maximum duration for channel points.
 * @returns {Object|null} An error object { limit, message } if invalid, otherwise null.
 */
function validateDuration(durationSeconds, requestType, maxDonationSeconds, maxChannelPointSeconds) {
    // const { MAX_DONATION_DURATION_SECONDS, MAX_CHANNEL_POINT_DURATION_SECONDS } = limits;

    if (requestType === 'donation' && durationSeconds > maxDonationSeconds) {
        return {
            limit: maxDonationSeconds,
            message: `Sorry, donation songs cannot be longer than ${maxDonationSeconds / 60} minutes.`
        };
    }

    if (requestType === 'channelPoint' && durationSeconds > maxChannelPointSeconds) {
        return {
            limit: maxChannelPointSeconds,
            message: `Sorry, channel point songs cannot be longer than 5 minutes. Donate for priority and up to 10 minute songs.`
        };
    }

    return null; // Duration is valid
}

/**
 * Checks the blacklist and sends a rejection message if a match is found.
 * @param {Object} params
 * @param {string} params.title - The song title.
 * @param {string} params.artist - The song artist.
 * @param {Array<Object>} params.blacklist - The blacklist array from the application state.
 * @param {string} params.userName - The user making the request.
 * @param {Function} params.sendChatMessage - Function to send a chat message.
 * @returns {boolean} True if the request was rejected, false otherwise.
 */
function handleBlacklistRejection({ title, artist, blacklist, userName, sendChatMessage }) {
    const blacklistMatch = checkBlacklist(title, artist, blacklist);
    if (blacklistMatch) {
        let blacklistMessage = `@${userName}, sorry, your request for "${title}"`;
        if (blacklistMatch.type === 'artist') {
            blacklistMessage += ` by "${artist}"`;
        }
        blacklistMessage += ` is currently blacklisted.`;
        sendChatMessage(blacklistMessage + ' https://calamarigoldrequests.com/');
        return true;
    }
    return false;
}

module.exports = {
    formatDurationFromSeconds,
    parseIsoDuration,
    formatDuration,
    extractVideoId,
    extractYouTubeUrlFromText,
    extractSpotifyUrlFromText,
    extractSpotifyAlbumUrlFromText,
    analyzeRequestText,
    checkBlacklist,
    isUserBlocked,
    validateDuration,
    handleBlacklistRejection
}; 