const fetch = require('node-fetch');
const chalk = require('chalk');

// Spotify API credentials
let spotifyToken = null;
let tokenExpiryTime = null;

// --- Configuration ---
const MIN_MATCH_SCORE_THRESHOLD = 0.5; // Minimum overall score to consider a match
const HIGH_MATCH_SCORE_THRESHOLD = 0.8; // Score above which we stop searching early
const MAX_SEARCH_RESULTS_PER_QUERY = 5; // Max Spotify results per search query

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
 * @param {number} limit - Maximum number of results to return
 * @returns {Promise<Array|null>} Matching Spotify tracks or null if none found
 */
async function searchSpotifyTrack(query, limit = MAX_SEARCH_RESULTS_PER_QUERY) {
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
        console.warn(chalk.yellow('[Spotify] Token expired, attempting refresh...'));
        spotifyToken = null;
        tokenExpiryTime = null;
        return searchSpotifyTrack(query, limit); // Recursive call to retry
      }
      throw new Error(`Spotify search failed with status ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();
    
    if (data.tracks && data.tracks.items && data.tracks.items.length > 0) {
      return data.tracks.items;
    } else {
      // It's normal for some queries not to find tracks, so only log if needed for debug
      // console.log(chalk.yellow(`[Spotify] No tracks found for query: "${query}"`));
      return null;
    }
  } catch (error) {
    console.error(chalk.red(`[Spotify] Error searching for track "${query}":`), error);
    return null; // Return null on error to allow processing to continue
  }
}

/**
 * Simple string similarity (Levenshtein distance based - simplified)
 * More robust alternative: use libraries like 'string-similarity' or 'fuzzy-search'
 * This is a basic placeholder.
 * @param {string} str1 
 * @param {string} str2 
 * @returns {number} A score between 0 and 1, where 1 is a closer match
 */
function similarityScore(str1, str2) {
  if (!str1 || !str2) return 0;
  
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();
  
  if (s1 === s2) return 1; // Exact match
  
  // Basic word overlap as a simple heuristic
  const words1 = new Set(s1.split(/\s+/).filter(w => w.length > 1));
  const words2 = new Set(s2.split(/\s+/).filter(w => w.length > 1));
  if (words1.size === 0 || words2.size === 0) return 0;

  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  
  const jaccardIndex = intersection.size / union.size;
  
  // Boost score slightly if one string contains the other (useful for artist names)
  const containmentScore = (s1.includes(s2) || s2.includes(s1)) ? 0.1 : 0;

  return Math.min(1, jaccardIndex + containmentScore); // Combine scores, cap at 1
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
    .replace(/\b(original|hd|4k|audio|track|version|extended)\b/gi, '') // Remove common filler words
    .replace(/["']/g, '') // Remove double and single quotes
    .replace(/\s*-\s*topic$/i, '') // Remove "- Topic" from channel-generated titles
    .replace(/\s*[|＊・:\-–—]\s*/g, ' ') // Replace common separators with space
    .replace(/\s+/g, ' ') // Replace multiple spaces with a single space
    .trim(); // Remove leading/trailing spaces
}

/**
 * Extract potential artist and title from YouTube title, handling various separators.
 * Prioritizes '-' then '|'. Considers 'Topic' channels.
 * @param {string} youtubeTitle - The YouTube video title
 * @param {string} channelTitle - The YouTube channel title
 * @returns {Object} Extracted { potentialArtist, potentialTitle, swappedArtist, swappedTitle }
 */
function extractArtistAndTitle(youtubeTitle, channelTitle) {
  const originalCleanedTitle = cleanYouTubeTitle(youtubeTitle); // Basic cleaning first

  let potentialArtist = '';
  let potentialTitle = originalCleanedTitle;
  let swappedArtist = ''; // For cases like Title - Artist
  let swappedTitle = '';

  // Prioritize dash separators ('-','–','—')
  const dashPattern = /^(.*?)\s*[-–—]\s*(.*)$/;
  const dashMatch = youtubeTitle.match(dashPattern); // Match on original title to preserve structure

  if (dashMatch) {
    potentialArtist = dashMatch[1].trim();
    potentialTitle = cleanYouTubeTitle(dashMatch[2].trim()); // Clean the extracted title part
    potentialArtist = cleanYouTubeTitle(potentialArtist); // Clean artist part too
    swappedArtist = potentialTitle; // Assume Title - Artist is possible
    swappedTitle = potentialArtist;
  } else {
    // If no dash, try pipe separators ('|') - less reliable
    const pipePattern = /^(.*?)\s*[|]\s*(.*)$/;
    const pipeMatch = youtubeTitle.match(pipePattern);
    if (pipeMatch) {
      potentialArtist = pipeMatch[1].trim();
      potentialTitle = cleanYouTubeTitle(pipeMatch[2].trim());
      potentialArtist = cleanYouTubeTitle(potentialArtist);
       swappedArtist = potentialTitle; // Assume Title | Artist is possible
       swappedTitle = potentialArtist;
    }
  }

  // Handle "Topic" channels - often means format is "Title - Artist"
  if (channelTitle && channelTitle.toLowerCase().includes('topic')) {
    // If we didn't find a separator, the whole cleaned title might be the song title
    // and the channel name (minus ' - Topic') might be the artist.
    if (!dashMatch && !youtubeTitle.match(pipePattern)) {
        potentialArtist = channelTitle.replace(/ - Topic$/i, '').trim();
        potentialTitle = originalCleanedTitle;
    } else if (dashMatch || youtubeTitle.match(pipePattern)) {
      // If we DID find a separator, assume the *second* part is the artist for Topic channels
      const parts = youtubeTitle.split(/[-–—|]/);
      if (parts.length >= 2) {
         potentialTitle = cleanYouTubeTitle(parts[0].trim());
         potentialArtist = cleanYouTubeTitle(parts[1].trim());
         // No swapped logic needed here, Topic channels are usually consistent
         swappedArtist = ''; 
         swappedTitle = '';
      }
    }
  }

  // If no artist found yet, use channel title if it's not generic
  if (!potentialArtist) {
    const genericChannels = ['vevo', 'official', 'music', 'records', 'channel', 'records', 'label', 'audio', 'video'];
    const isGenericChannel = !channelTitle || genericChannels.some(word => channelTitle.toLowerCase().includes(word));
    if (!isGenericChannel) {
      potentialArtist = channelTitle.replace(/official/i, '').trim();
    }
  }
  
  // Final check to ensure we have some title
  if (!potentialTitle) potentialTitle = originalCleanedTitle;


  return {
    potentialArtist: potentialArtist || '', // Ensure empty string if null/undefined
    potentialTitle: potentialTitle || '',
    swappedArtist: swappedArtist || '', // Artist if Title - Artist
    swappedTitle: swappedTitle || ''  // Title if Title - Artist
  };
}

/**
 * Generate search queries from YouTube song data
 * @param {Object} song - The YouTube song object { title, artist (channel) }
 * @returns {Array<string>} Array of search queries to try
 */
function generateSearchQueries(song) {
  if (!song || !song.title) {
    return [];
  }
  
  const originalTitle = song.title;
  const channel = song.artist || ''; // YouTube channel name
  const { potentialArtist, potentialTitle, swappedArtist, swappedTitle } = extractArtistAndTitle(originalTitle, channel);
  const cleanOriginalTitle = cleanYouTubeTitle(originalTitle);

  const queries = new Set(); // Use Set to avoid duplicates easily

  // 1. Prioritize Extracted Artist & Title
  if (potentialArtist && potentialTitle) {
    queries.add(`${potentialArtist} ${potentialTitle}`);
    queries.add(`track:${potentialTitle} artist:${potentialArtist}`);
  }
  
  // 2. Try Swapped Artist & Title (for Title - Artist cases)
  if (swappedArtist && swappedTitle && (swappedArtist !== potentialArtist || swappedTitle !== potentialTitle)) {
     queries.add(`${swappedArtist} ${swappedTitle}`); // e.g. Search "Artist Title" if format was Title - Artist
     queries.add(`track:${swappedTitle} artist:${swappedArtist}`);
  }

  // 3. Use Cleaned Full Title (if not already covered)
  if (cleanOriginalTitle) {
      queries.add(cleanOriginalTitle);
  }

  // 4. Try Channel Name + Potential Title (if channel seems like an artist)
  if (channel && potentialTitle && !potentialTitle.toLowerCase().includes(channel.toLowerCase()) && !potentialArtist.toLowerCase().includes(channel.toLowerCase())) {
    queries.add(`${channel} ${potentialTitle}`);
  }
  
  // 5. Try Channel Name + Cleaned Original Title
  if (channel && cleanOriginalTitle && !cleanOriginalTitle.toLowerCase().includes(channel.toLowerCase()) && !potentialArtist.toLowerCase().includes(channel.toLowerCase())) {
     queries.add(`${channel} ${cleanOriginalTitle}`);
  }

  // 6. Use Original Raw Title as a last resort (if different)
  if (originalTitle && originalTitle !== cleanOriginalTitle) {
    queries.add(originalTitle);
  }
  
  // Convert Set back to Array and filter empty queries
  return [...queries].filter(q => q && q.trim().length > 0);
}

/**
 * Calculate JUST the artist similarity score between Spotify track and YouTube data.
 * Used as a tie-breaker.
 * @param {Object} spotifyTrack - Spotify track object
 * @param {Object} song - YouTube song data { title, artist }
 * @param {Object} extracted - Extracted data { potentialArtist, potentialTitle, ... }
 * @returns {number} Artist match score between 0-1
 */
function calculateArtistSimilarity(spotifyTrack, song, extracted) {
    if (!spotifyTrack || !spotifyTrack.artists || spotifyTrack.artists.length === 0 || !song) {
        return 0;
    }

    let maxArtistScore = 0;
    const youtubeArtist = song.artist || ''; // Channel name
    const potentialArtist = extracted.potentialArtist || '';

    for (const spotifyArtist of spotifyTrack.artists) {
        if (!spotifyArtist.name) continue;
        // Compare Spotify artist name against both YT channel name and extracted potential artist
        const scoreVsChannel = similarityScore(spotifyArtist.name, youtubeArtist);
        const scoreVsPotential = potentialArtist ? similarityScore(spotifyArtist.name, potentialArtist) : 0;
        
        // Take the highest score for this Spotify artist against the YT sources
        maxArtistScore = Math.max(maxArtistScore, scoreVsChannel, scoreVsPotential);
    }
    
    return maxArtistScore;
}

/**
 * Score a Spotify track against YouTube data (overall score)
 * @param {Object} spotifyTrack - Spotify track object
 * @param {Object} song - YouTube song data { title, artist }
 * @param {Object} extracted - Extracted data { potentialArtist, potentialTitle, ... }
 * @returns {number} Weighted match score between 0-1
 */
function scoreTrackMatch(spotifyTrack, song, extracted) {
  if (!spotifyTrack || !song || !extracted) return 0;

  const spotifyTitle = spotifyTrack.name || '';
  const youtubeTitle = song.title || ''; // Original title
  const potentialTitle = extracted.potentialTitle || ''; // Title extracted from structure

  // Score title match: Compare Spotify title against original YT title AND extracted potential title
  const titleScore = Math.max(
    similarityScore(spotifyTitle, youtubeTitle),
    similarityScore(spotifyTitle, potentialTitle)
  );

  // Score artist match using the dedicated function
  const artistScore = calculateArtistSimilarity(spotifyTrack, song, extracted);
  
  // Weight title slightly higher than artist (e.g., 60% title, 40% artist)
  const weightedScore = (titleScore * 0.6) + (artistScore * 0.4);
  
  // --- Sanity Check & Boost ---
  // If title match is very high AND artist match is decent, boost score
  // Helps differentiate good matches from mediocre ones with similar scores.
  let boost = 0;
  if (titleScore > 0.8 && artistScore > 0.4) {
      boost = 0.1;
  } 
  // If artist match is very high AND title match is decent
  else if (artistScore > 0.8 && titleScore > 0.4) {
       boost = 0.1;
  }
  // If both are reasonably good
  else if (artistScore > 0.6 && titleScore > 0.6) {
       boost = 0.05;
  }

  return Math.min(1, weightedScore + boost); // Return final score, capped at 1
}

/**
 * Get the Spotify equivalent for a YouTube song using a more robust matching strategy.
 * @param {Object} song - The YouTube song object { title, artist (channel) }
 * @returns {Promise<Object|null>} Best matching Spotify track info or null if none found/scored high enough.
 */
async function getSpotifyEquivalent(song) {
  if (!song || !song.title) {
    console.warn(chalk.yellow('[Spotify] Cannot search for song without title'));
    return null;
  }

  console.log(chalk.blue(`[Spotify] Starting search for YouTube song: "${song.title}" (Channel: "${song.artist || 'N/A'}")`));

  try {
    // Extract potential artist/title info first
    const extractedData = extractArtistAndTitle(song.title, song.artist);
    console.log(chalk.blue(`[Spotify] Extracted Info: Pot. Artist: "${extractedData.potentialArtist}", Pot. Title: "${extractedData.potentialTitle}"`));

    // Generate multiple search queries based on extracted info and fallbacks
    const searchQueries = generateSearchQueries(song);
    if (searchQueries.length === 0) {
        console.warn(chalk.yellow('[Spotify] No valid search queries generated.'));
        return null;
    }
    
    console.log(chalk.blue(`[Spotify] Generated ${searchQueries.length} Search Queries: ${JSON.stringify(searchQueries)}`));
    
    let potentialMatches = []; // Stores { track: spotifyTrack, score: overallScore }

    // --- Step 1: Search using all queries and collect candidates ---
    for (const query of searchQueries) {
      console.log(chalk.blue(`[Spotify] Searching with query: "${query}"`));
      
      const spotifyTracks = await searchSpotifyTrack(query, MAX_SEARCH_RESULTS_PER_QUERY);
      if (!spotifyTracks) continue; // Skip if query failed or returned no results
      
      // Score each track from this query against the YouTube data
      for (const track of spotifyTracks) {
        if (!track || !track.name || !track.artists || track.artists.length === 0) continue; // Skip invalid tracks
        
        const overallScore = scoreTrackMatch(track, song, extractedData);
        const artistName = track.artists.map(a => a.name).join(', '); // For logging
        console.log(chalk.blue(`  -> Scoring "${track.name}" by ${artistName}: Overall Score = ${overallScore.toFixed(3)}`));
        
        // Only consider tracks meeting the minimum threshold
        if (overallScore >= MIN_MATCH_SCORE_THRESHOLD) {
            potentialMatches.push({ track, score: overallScore });
        }
        
        // Optimization: If we find a very high scoring match early, we can potentially stop.
        // This might miss the *absolute* best match if found later, but speeds things up.
        // Let's keep it disabled for now to ensure we evaluate all candidates for the best possible match.
        // if (overallScore >= HIGH_MATCH_SCORE_THRESHOLD) {
        //   console.log(chalk.cyan(`[Spotify] High score match found (${overallScore.toFixed(3)}), potentially stopping search early.`));
        //   // break; // Uncomment to enable early exit
        // }
      }
      // if (potentialMatches.some(m => m.score >= HIGH_MATCH_SCORE_THRESHOLD)) break; // Exit outer loop too if high score found
    }

    // --- Step 2: Analyze collected candidates ---
    if (potentialMatches.length === 0) {
      console.log(chalk.yellow(`[Spotify] No potential matches found meeting the score threshold (${MIN_MATCH_SCORE_THRESHOLD}) for "${song.title}"`));
      return null;
    }

    // Find the highest score among all potential matches
    const maxScore = Math.max(...potentialMatches.map(m => m.score));
    
    // Filter matches to keep only those with the highest score
    const bestScoringMatches = potentialMatches.filter(m => m.score === maxScore);

    // --- Step 3: Select the best match (handle ties) ---
    let finalMatch = null;

    if (bestScoringMatches.length === 1) {
      // Only one best match, easy choice
      finalMatch = bestScoringMatches[0].track;
      console.log(chalk.green(`[Spotify] Selected unique best match: "${finalMatch.name}" (Score: ${maxScore.toFixed(3)})`));
    } else {
      // Tie-breaker needed! Use artist similarity.
      console.log(chalk.yellow(`[Spotify] Tie detected with score ${maxScore.toFixed(3)} among ${bestScoringMatches.length} tracks. Applying artist similarity tie-breaker...`));
      
      let tieBreakerMatches = [];
      for (const match of bestScoringMatches) {
         const artistSimilarity = calculateArtistSimilarity(match.track, song, extractedData);
         tieBreakerMatches.push({ track: match.track, artistScore: artistSimilarity });
         console.log(chalk.yellow(`  -> Tie-breaker score for "${match.track.name}": Artist Similarity = ${artistSimilarity.toFixed(3)}`));
      }

      // Sort tied matches by artist similarity (descending)
      tieBreakerMatches.sort((a, b) => b.artistScore - a.artistScore);
      
      finalMatch = tieBreakerMatches[0].track; // Pick the one with the highest artist similarity
      console.log(chalk.green(`[Spotify] Selected best match via tie-breaker: "${finalMatch.name}" (Artist Sim: ${tieBreakerMatches[0].artistScore.toFixed(3)})`));
    }

    // --- Step 4: Format and return the result ---
    if (finalMatch) {
       const finalSelectedScore = bestScoringMatches.find(m => m.track.id === finalMatch.id)?.score || 0; // Get the original overall score
       return {
         id: finalMatch.id,
         name: finalMatch.name,
         artists: finalMatch.artists.map(artist => ({
           id: artist.id,
           name: artist.name
         })),
         album: {
           id: finalMatch.album.id,
           name: finalMatch.album.name,
           releaseDate: finalMatch.album.release_date,
           images: finalMatch.album.images // Keep original images array
         },
         durationMs: finalMatch.duration_ms,
         previewUrl: finalMatch.preview_url,
         externalUrl: finalMatch.external_urls.spotify,
         uri: finalMatch.uri,
         matchScore: finalSelectedScore // Return the overall match score
         // We could add artistSimilarityTiebreakerScore here if needed for debugging
       };
    } else {
       // Should not happen if potentialMatches had items, but as a safeguard
       console.log(chalk.yellow('[Spotify] No final match selected despite having candidates.'));
       return null;
    }

  } catch (error) {
    console.error(chalk.red('[Spotify] Critical error during getSpotifyEquivalent process:'), error);
    return null; // Return null on major errors
  }
}

module.exports = {
  getSpotifyToken,
  searchSpotifyTrack,
  getSpotifyEquivalent
}; 