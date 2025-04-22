const fetch = require('node-fetch');
const chalk = require('chalk');

// Spotify API credentials
let spotifyToken = null;
let tokenExpiryTime = null;

/**
 * Get a Spotify API access token
 * @returns {Promise<string>} A valid Spotify access token
 */
async function getSpotifyToken() {
  // Check if we have a valid token already
  if (spotifyToken && tokenExpiryTime && Date.now() < tokenExpiryTime) {
    return spotifyToken;
  }

  const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
  const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
    throw new Error('Spotify credentials (client ID, client secret) are missing in .env file');
  }

  try {
    // Get token using client credentials flow
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64')}`
      },
      body: 'grant_type=client_credentials'
    });

    if (!response.ok) {
      throw new Error(`Spotify token request failed with status ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();
    spotifyToken = data.access_token;
    // Set expiry time 60 seconds before actual expiry as a safety margin
    tokenExpiryTime = Date.now() + (data.expires_in - 60) * 1000;
    console.log(chalk.green('✅ [Spotify] Successfully fetched new access token'));
    
    return spotifyToken;
  } catch (error) {
    console.error(chalk.red('[Spotify] Error getting access token:'), error);
    spotifyToken = null;
    tokenExpiryTime = null;
    throw error;
  }
}

/**
 * Search for a track on Spotify
 * @param {string} query - The search query (e.g., "artist name song title")
 * @param {number} limit - Maximum number of results to return (default: 5)
 * @returns {Promise<Array|null>} Matching Spotify tracks or null if none found
 */
async function searchSpotifyTrack(query, limit = 5) {
  try {
    const token = await getSpotifyToken();
    const encodedQuery = encodeURIComponent(query);
    
    const response = await fetch(`https://api.spotify.com/v1/search?q=${encodedQuery}&type=track&limit=${limit}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      if (response.status === 401) {
        // Token might have expired, clear it and try again
        spotifyToken = null;
        tokenExpiryTime = null;
        return searchSpotifyTrack(query, limit);
      }
      throw new Error(`Spotify search failed with status ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();
    
    if (data.tracks && data.tracks.items && data.tracks.items.length > 0) {
      return data.tracks.items;
    } else {
      console.log(chalk.yellow(`[Spotify] No tracks found for query: "${query}"`));
      return null;
    }
  } catch (error) {
    console.error(chalk.red('[Spotify] Error searching for track:'), error);
    return null;
  }
}

/**
 * Calculate the similarity score between two strings
 * @param {string} str1 
 * @param {string} str2 
 * @returns {number} A score between 0 and 1, where 1 is an exact match
 */
function similarityScore(str1, str2) {
  if (!str1 || !str2) return 0;
  
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();
  
  // Exact match
  if (s1 === s2) return 1;
  
  // Check if one contains the other
  if (s1.includes(s2) || s2.includes(s1)) return 0.9;
  
  // Calculate word overlap
  const words1 = s1.split(/\s+/);
  const words2 = s2.split(/\s+/);
  
  let matchCount = 0;
  for (const word1 of words1) {
    if (word1.length < 3) continue; // Skip short words
    
    for (const word2 of words2) {
      if (word2.length < 3) continue;
      
      if (word1 === word2 || word1.includes(word2) || word2.includes(word1)) {
        matchCount++;
        break;
      }
    }
  }
  
  const overlapScore = matchCount / Math.max(words1.length, words2.length);
  return overlapScore;
}

/**
 * Clean up a YouTube title for better Spotify matching
 * @param {string} title - The YouTube video title
 * @returns {string} Cleaned title
 */
function cleanYouTubeTitle(title) {
  if (!title) return '';
  
  return title
    .replace(/\([^)]*\)|【[^】]*】|\[[^\]]*\]/g, '') // Remove content in parentheses, brackets, etc.
    .replace(/official\s*(music)?\s*video/gi, '') // Remove "official music video"
    .replace(/lyrics?(\s*video)?/gi, '') // Remove "lyrics", "lyric video"
    .replace(/\b(ft\.?|feat\.?|featuring)\b/gi, 'feat') // Normalize featuring
    .replace(/\b(original|hd|4k|audio|track|full|version|extended)\b/gi, '') // Remove common filler words
    .replace(/\s*-\s*topic$/i, '') // Remove "- Topic" from channel-generated titles
    .replace(/\s*[|＊・:]\s*/g, ' ') // Replace separators with space
    .replace(/\s+/g, ' ') // Replace multiple spaces with a single space
    .trim(); // Remove leading/trailing spaces
}

/**
 * Extract potential artist and title from YouTube title
 * @param {string} youtubeTitle - The YouTube video title
 * @param {string} channelTitle - The YouTube channel title
 * @returns {Object} Extracted artist and title
 */
function extractArtistAndTitle(youtubeTitle, channelTitle) {
  const cleanTitle = cleanYouTubeTitle(youtubeTitle);
  
  // Common patterns for "Artist - Title" format
  const dashPattern = /^(.*?)\s*[-–—]\s*(.*)$/;
  const match = cleanTitle.match(dashPattern);
  
  if (match) {
    // We have a potential artist - title split
    return {
      potentialArtist: match[1].trim(),
      potentialTitle: match[2].trim()
    };
  }
  
  // If channel name contains "topic" it's likely an auto-generated video
  // from music service with format "Song Name - Artist"
  if (channelTitle && channelTitle.toLowerCase().includes('topic')) {
    return {
      potentialArtist: cleanTitle.split(/\s*[-–—]\s*/)[1] || '',
      potentialTitle: cleanTitle.split(/\s*[-–—]\s*/)[0] || cleanTitle
    };
  }
  
  // If no pattern match, use the channel as artist if it's not too generic
  const genericChannels = ['vevo', 'official', 'music', 'records', 'channel'];
  const isGenericChannel = !channelTitle || 
    genericChannels.some(word => channelTitle.toLowerCase().includes(word));
  
  if (!isGenericChannel) {
    return {
      potentialArtist: channelTitle.replace(/official/i, '').trim(),
      potentialTitle: cleanTitle
    };
  }
  
  // Can't determine a good split
  return {
    potentialArtist: '',
    potentialTitle: cleanTitle
  };
}

/**
 * Generate search queries from YouTube song data
 * @param {Object} song - The YouTube song object
 * @returns {Array<string>} Array of search queries to try
 */
function generateSearchQueries(song) {
  if (!song || !song.title) {
    return [];
  }
  
  const cleanTitle = cleanYouTubeTitle(song.title);
  const channel = song.artist || '';
  const { potentialArtist, potentialTitle } = extractArtistAndTitle(song.title, channel);
  
  const queries = [];
  
  // If we have a clear artist and title separation, prioritize that format
  if (potentialArtist && potentialTitle) {
    queries.push(`${potentialArtist} ${potentialTitle}`);
    queries.push(`track:${potentialTitle} artist:${potentialArtist}`);
  }
  
  // Add the cleaned full title
  queries.push(cleanTitle);
  
  // If channel name looks like an artist name and isn't in the title,
  // try it with the title
  if (channel && !cleanTitle.toLowerCase().includes(channel.toLowerCase())) {
    queries.push(`${channel} ${cleanTitle}`);
  }
  
  // Remove duplicates and empty queries
  return [...new Set(queries)].filter(q => q.trim().length > 0);
}

/**
 * Score a Spotify track against YouTube data
 * @param {Object} spotifyTrack - Spotify track object
 * @param {Object} song - YouTube song data
 * @returns {number} Match score between 0-1
 */
function scoreTrackMatch(spotifyTrack, song) {
  if (!spotifyTrack || !song) return 0;
  
  const { potentialArtist, potentialTitle } = extractArtistAndTitle(song.title, song.artist);
  
  // Score title match
  const titleScore = Math.max(
    similarityScore(spotifyTrack.name, song.title),
    similarityScore(spotifyTrack.name, potentialTitle)
  );
  
  // Score artist match
  let artistScore = 0;
  if (spotifyTrack.artists && spotifyTrack.artists.length > 0) {
    // Compare with all artists in the track
    for (const artist of spotifyTrack.artists) {
      const artistNameScore = Math.max(
        similarityScore(artist.name, song.artist || ''),
        similarityScore(artist.name, potentialArtist)
      );
      artistScore = Math.max(artistScore, artistNameScore);
    }
  }
  
  // Weight title higher than artist (0.6 vs 0.4)
  const weightedScore = (titleScore * 0.6) + (artistScore * 0.4);
  return weightedScore;
}

/**
 * Get the Spotify equivalent for a YouTube song
 * @param {Object} song - The YouTube song object
 * @param {string} song.title - The song title
 * @param {string} song.artist - The artist name/channel title
 * @returns {Promise<Object|null>} Spotify track info or null if not found
 */
async function getSpotifyEquivalent(song) {
  if (!song || !song.title) {
    console.warn(chalk.yellow('[Spotify] Cannot search for song without title'));
    return null;
  }

  try {
    // Generate multiple search queries
    const searchQueries = generateSearchQueries(song);
    if (searchQueries.length === 0) return null;
    
    console.log(chalk.blue(`[Spotify] Generated search queries: ${JSON.stringify(searchQueries)}`));
    
    let bestMatch = null;
    let bestScore = 0;
    
    // Try each query and find the best match
    for (const query of searchQueries) {
      console.log(chalk.blue(`[Spotify] Searching with query: "${query}"`));
      
      const spotifyTracks = await searchSpotifyTrack(query, 5);
      if (!spotifyTracks) continue;
      
      // Score each track against the YouTube data
      for (const track of spotifyTracks) {
        const score = scoreTrackMatch(track, song);
        console.log(chalk.blue(`[Spotify] Match score for "${track.name}" by ${track.artists[0].name}: ${score.toFixed(2)}`));
        
        if (score > bestScore) {
          bestScore = score;
          bestMatch = track;
        }
      }
      
      // If we found a very good match, don't need to try other queries
      if (bestScore > 0.8) break;
    }
    
    // Consider it a match if score is above threshold
    if (bestScore >= 0.5 && bestMatch) {
      console.log(chalk.green(`[Spotify] Best match for "${song.title}": "${bestMatch.name}" by ${bestMatch.artists.map(a => a.name).join(', ')} (score: ${bestScore.toFixed(2)})`));
      
      // Return useful Spotify track information
      return {
        id: bestMatch.id,
        name: bestMatch.name,
        artists: bestMatch.artists.map(artist => ({
          id: artist.id,
          name: artist.name
        })),
        album: {
          id: bestMatch.album.id,
          name: bestMatch.album.name,
          releaseDate: bestMatch.album.release_date,
          images: bestMatch.album.images
        },
        durationMs: bestMatch.duration_ms,
        previewUrl: bestMatch.preview_url,
        externalUrl: bestMatch.external_urls.spotify,
        uri: bestMatch.uri,
        matchScore: bestScore
      };
    } else {
      console.log(chalk.yellow(`[Spotify] No good match found for "${song.title}" (best score: ${bestScore.toFixed(2)})`));
      return null;
    }
  } catch (error) {
    console.error(chalk.red('[Spotify] Error getting Spotify equivalent:'), error);
    return null;
  }
}

module.exports = {
  getSpotifyToken,
  searchSpotifyTrack,
  getSpotifyEquivalent
}; 