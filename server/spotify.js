const chalk = require('chalk');

// Spotify API credentials
let spotifyToken = null;
let tokenExpiryTime = null;

// --- Configuration ---
const MIN_MATCH_SCORE_THRESHOLD = 0.5; // Minimum overall score to consider a match
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
      console.log(chalk.yellow(`[Spotify] No tracks found for query: "${query}"`));
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

  // ** NEW: Check for match ignoring spaces **
  const s1NoSpace = s1.replace(/\s+/g, '');
  const s2NoSpace = s2.replace(/\s+/g, '');
  if (s1NoSpace === s2NoSpace && s1NoSpace.length > 0) return 0.95; // High score for space difference only
  
  // Basic word overlap as a simple heuristic
  const words1 = new Set(s1.split(/\s+/).filter(w => w.length > 1));
  const words2 = new Set(s2.split(/\s+/).filter(w => w.length > 1));
  if (words1.size === 0 || words2.size === 0) return 0;

  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  
  const jaccardIndex = intersection.size / union.size;
  
  // Boost score slightly if one string contains the other (useful for artist names)
  // Refined containment check using the no-space versions too
  const containmentScore = (s1.includes(s2) || s2.includes(s1) || (s1NoSpace.length > 2 && s2NoSpace.length > 2 && (s1NoSpace.includes(s2NoSpace) || s2NoSpace.includes(s1NoSpace)))) ? 0.1 : 0;

  return Math.min(1, jaccardIndex + containmentScore); // Combine scores, cap at 1
}

/**
 * Clean up a YouTube title for better Spotify matching
 * @param {string} title - The YouTube video title
 * @returns {string} Cleaned title
 */
function cleanYouTubeTitle(title) {
  if (!title) return '';
  
  let cleaned = title;

  // Remove specific common patterns within parentheses/brackets first
  cleaned = cleaned.replace(/\((official|lyric|audio|visualizer|music|hq|hd|4k|explicit|original|extended|radio edit|video|live|session)\b[^)]*\)/gi, '');
  cleaned = cleaned.replace(/\[(official|lyric|audio|visualizer|music|hq|hd|4k|explicit|original|extended|radio edit|video|live|session)\b[^]]*\]/gi, '');
  cleaned = cleaned.replace(/【(official|lyric|audio|visualizer|music|hq|hd|4k|explicit|original|extended|radio edit|video|live|session)\b[^】]*】/gi, '');
  
  // Now remove other common patterns NOT necessarily in parentheses
  cleaned = cleaned.replace(/official\s*(music)?\s*video/gi, '') 
                   .replace(/lyrics?(\s*video)?/gi, '') 
                   .replace(/\b(audio|track|version)\b/gi, '') 
                   .replace(/\b(hd|hq|4k)\b/gi, '');

  // Normalize featuring and remove quotes AFTER potentially useful parenthetical info is kept
  cleaned = cleaned.replace(/\b(ft\.?|feat\.?|featuring)\b/gi, 'feat') 
                   .replace(/["']/g, '');

  // Remove "- Topic" from channel-generated titles
  cleaned = cleaned.replace(/\s*-\s*topic$/i, '');

  // Replace common separators with space AFTER cleaning, to handle cases like "Artist - Song (feat. X)"
  cleaned = cleaned.replace(/\s*[|＊・:\-–—]\s*/g, ' ');

  // Final cleanup
  cleaned = cleaned.replace(/\s+/g, ' ') 
                   .trim();
                   
  return cleaned;
}

/**
 * Extract potential artist and title from YouTube title, handling various separators.
 * Prioritizes '-' then '|'. Considers 'Topic' channels.
 * @param {string} youtubeTitle - The YouTube video title
 * @param {string} channelTitle - The YouTube channel title
 * @returns {Object} Extracted { potentialArtist, potentialTitle, swappedArtist, swappedTitle }
 */
function extractArtistAndTitle(youtubeTitle, channelTitle) {
  let potentialArtist = '';
  let potentialTitle = '';
  let swappedArtist = ''; // For cases like Title - Artist
  let swappedTitle = '';
  let extractedWithQuotePattern = false;

  // ** MODIFIED **: Check for 'Artist "Title"' on ORIGINAL title first
  const quotePattern = /^([\w\s]+?)\s+"([^"]+)"/; // Allow any non-" chars inside quotes
  const quoteMatch = youtubeTitle.match(quotePattern); // Match on ORIGINAL title

  if (quoteMatch) {
    potentialArtist = cleanYouTubeTitle(quoteMatch[1].trim()); // Clean extracted artist
    potentialTitle = cleanYouTubeTitle(quoteMatch[2].trim()); // Clean extracted title
    // No swapped logic needed for this specific pattern usually
    swappedArtist = ''; 
    swappedTitle = '';
    extractedWithQuotePattern = true;
    console.log(chalk.blue(`[Spotify] Extracted using Quote Pattern (Original Title): Artist='${potentialArtist}', Title='${potentialTitle}'`));
  }
  
  // If quote pattern didn't match, proceed with cleaning and other separators
  if (!extractedWithQuotePattern) {
      const originalCleanedTitle = cleanYouTubeTitle(youtubeTitle); // Clean title now
      potentialTitle = originalCleanedTitle; // Default title if no separators found

      // Prioritize dash separators ('-','–','—')
      const dashPattern = /^(.*?)\s*[-–—]\s*(.*)$/;
      // Match on original title for structure, but clean the parts
      const dashMatch = youtubeTitle.match(dashPattern); 

      if (dashMatch) {
        potentialArtist = cleanYouTubeTitle(dashMatch[1].trim()); // Clean the extracted artist part
        potentialTitle = cleanYouTubeTitle(dashMatch[2].trim()); // Clean the extracted title part
        swappedArtist = potentialTitle; // Assume Title - Artist is possible
        swappedTitle = potentialArtist;
      } else {
        // If no dash, try pipe separators ('|') - less reliable
        const pipePattern = /^(.*?)\s*[|]\s*(.*)$/;
        const pipeMatch = youtubeTitle.match(pipePattern);
        if (pipeMatch) {
          potentialArtist = cleanYouTubeTitle(pipeMatch[1].trim());
          potentialTitle = cleanYouTubeTitle(pipeMatch[2].trim());
          swappedArtist = potentialTitle; // Assume Title | Artist is possible
          swappedTitle = potentialArtist;
        } else {
           // ** Check for 'Title by Artist' pattern if no dash/pipe found **
           const byPattern = /^(.*?)\s+by\s+(.*?)$/i; // Matches 'Something by Someone' case-insensitively
           const byMatch = originalCleanedTitle.match(byPattern); // Match on the cleaned title here
           if (byMatch) {
               potentialTitle = byMatch[1].trim(); // First part is title (already cleaned)
               potentialArtist = byMatch[2].trim(); // Second part is artist (already cleaned)
               // Clear swapped logic as this format is usually specific
               swappedArtist = ''; 
               swappedTitle = '';
               console.log(chalk.blue(`[Spotify] Extracted using 'by' Pattern: Artist='${potentialArtist}', Title='${potentialTitle}'`));
           }
        }
      }
      
      // Handle "Topic" channels - logic might need adjustment if artist/title already found
      if (!potentialArtist && channelTitle && channelTitle.toLowerCase().includes('topic')) {
        // If we didn't find ANY separator ('-', '|', 'by'), whole cleaned title might be song title
        // and channel name (minus ' - Topic') might be the artist.
        const pipePattern = /^(.*?)\s*[|]\s*(.*)$/;
        if (!dashMatch && !youtubeTitle.match(pipePattern) && !originalCleanedTitle.match(/\s+by\s+/i)) { 
            potentialArtist = channelTitle.replace(/ - Topic$/i, '').trim();
            potentialTitle = originalCleanedTitle;
        } else if (dashMatch || youtubeTitle.match(pipePattern)) {
          // If we DID find dash/pipe, assume *second* part is the artist for Topic channels
          // This overrides previous dash/pipe extraction for Topic channels
          const parts = youtubeTitle.split(/[-–—|]/);
          if (parts.length >= 2) {
             potentialTitle = cleanYouTubeTitle(parts[0].trim());
             potentialArtist = cleanYouTubeTitle(parts[1].trim());
             // No swapped logic needed here, Topic channels are usually consistent
             swappedArtist = ''; 
             swappedTitle = '';
          }
        }
        // Note: We don't explicitly handle 'by' pattern combined with Topic channels, assumes dash/pipe take precedence if present.
      }
    
      // If no artist found yet by any structural pattern, use channel title if it's not generic
      if (!potentialArtist) {
        const genericChannels = ['vevo', 'official', 'music', 'records', 'channel', 'label', 'audio', 'video']; // Simplified list
        const lowerChannelTitle = channelTitle ? channelTitle.toLowerCase() : '';
        const isGenericChannel = !channelTitle || genericChannels.some(word => lowerChannelTitle.includes(word));
        if (!isGenericChannel) {
          potentialArtist = channelTitle.replace(/official/i, '').trim();
          potentialTitle = originalCleanedTitle; // If using channel as artist, assume cleaned title is the song title
        }
      }
  } // End of (!extractedWithQuotePattern) block

  // Final check to ensure we have some title (defaults to cleaned original if somehow lost)
  if (!potentialTitle) potentialTitle = cleanYouTubeTitle(youtubeTitle); 

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

    const spotifyArtist = spotifyTrack.artists[0]; // ** Use only the first artist **
    if (!spotifyArtist || !spotifyArtist.name) return 0; 

    let maxArtistScore = 0;
    const youtubeArtist = song.artist || ''; // Channel name
    const potentialArtist = extracted.potentialArtist || '';

    // Compare Spotify artist name against both YT channel name and extracted potential artist
    const scoreVsChannel = similarityScore(spotifyArtist.name, youtubeArtist);
    const scoreVsPotential = potentialArtist ? similarityScore(spotifyArtist.name, potentialArtist) : 0;
    
    // Take the highest score for this Spotify artist against the YT sources
    maxArtistScore = Math.max(scoreVsChannel, scoreVsPotential);
    
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
        // Use only the first artist name for display
        const artistName = track.artists.length > 0 ? track.artists[0].name : 'Unknown Artist';
        console.log(chalk.blue(`  -> Scoring "${track.name}" by ${artistName}: Overall Score = ${overallScore.toFixed(3)}`));
        
        // Only consider tracks meeting the minimum threshold
        if (overallScore >= MIN_MATCH_SCORE_THRESHOLD) {
            potentialMatches.push({ track, score: overallScore });
        }
      }
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
      // Display only the first artist name
      const firstArtistName = finalMatch.artists && finalMatch.artists.length > 0 
        ? finalMatch.artists[0].name 
        : 'Unknown Artist';
      console.log(chalk.green(`[Spotify] Selected unique best match: "${finalMatch.name}" by ${firstArtistName} (Score: ${maxScore.toFixed(3)})`));
    } else {
      // Tie-breaker needed! Use artist similarity.
      console.log(chalk.yellow(`[Spotify] Tie detected with score ${maxScore.toFixed(3)} among ${bestScoringMatches.length} tracks. Applying artist similarity tie-breaker...`));
      
      let tieBreakerMatches = [];
      for (const match of bestScoringMatches) {
         const artistSimilarity = calculateArtistSimilarity(match.track, song, extractedData);
         tieBreakerMatches.push({ track: match.track, artistScore: artistSimilarity });
         // Display only the first artist name for each tie-breaker candidate
         const firstArtistName = match.track.artists && match.track.artists.length > 0 
           ? match.track.artists[0].name 
           : 'Unknown Artist';
         console.log(chalk.yellow(`  -> Tie-breaker score for "${match.track.name}" by ${firstArtistName}: Artist Similarity = ${artistSimilarity.toFixed(3)}`));
      }

      // Sort tied matches by artist similarity (descending)
      tieBreakerMatches.sort((a, b) => b.artistScore - a.artistScore);
      
      finalMatch = tieBreakerMatches[0].track; // Pick the one with the highest artist similarity
      // Display only the first artist name for the selected match
      const firstArtistName = finalMatch.artists && finalMatch.artists.length > 0 
        ? finalMatch.artists[0].name 
        : 'Unknown Artist';
      console.log(chalk.green(`[Spotify] Selected best match via tie-breaker: "${finalMatch.name}" by ${firstArtistName} (Artist Sim: ${tieBreakerMatches[0].artistScore.toFixed(3)})`));
    }

    // --- Step 4: Format and return the result ---
    if (finalMatch) {
       const finalSelectedScore = bestScoringMatches.find(m => m.track.id === finalMatch.id)?.score || 0; // Get the original overall score
       const firstArtist = finalMatch.artists && finalMatch.artists.length > 0 ? finalMatch.artists[0] : null;
       const firstImage = finalMatch.album?.images?.[0]; // Get the first image if available
       return {
         id: finalMatch.id,
         name: finalMatch.name,
         artists: firstArtist ? [{ // Only include name for the first artist
           name: firstArtist.name
         }] : [],
         album: firstImage ? { // Only include images array with the first image's URL
           images: [{ url: firstImage.url }]
         } : { images: [] }, // Return empty images array if none found
         durationMs: finalMatch.duration_ms,
         uri: finalMatch.uri,
         url: finalMatch.external_urls?.spotify
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

/**
 * Find a Spotify track by direct search query (for text-based requests without YouTube URL)
 * @param {string} query - The search query text (e.g., "State Champs Secrets")
 * @returns {Promise<Object|null>} Best matching Spotify track info or null if none found
 */
async function findSpotifyTrackBySearchQuery(query) {
  if (!query) {
    console.warn(chalk.yellow('[Spotify] Empty search query provided'));
    return null;
  }

  console.log(chalk.blue(`[Spotify] Searching directly for track: "${query}"`));

  try {
    // Clean the query to improve matching
    const cleanedQuery = cleanYouTubeTitle(query); // Reuse the cleaning function
    
    // Generate search variations
    const searchQueries = [
      query, // Original query
      cleanedQuery, // Cleaned query
      `track:${cleanedQuery}` // Spotify API specific syntax for better results
    ];
    
    // Try to extract artist and title using separator extraction
    const extracted = extractArtistAndTitle(query, '');
    if (extracted.potentialArtist && extracted.potentialTitle) {
      searchQueries.push(`${extracted.potentialArtist} ${extracted.potentialTitle}`);
      searchQueries.push(`track:${extracted.potentialTitle} artist:${extracted.potentialArtist}`);
      
      // If we have a potential swap (Title - Artist format)
      if (extracted.swappedArtist && extracted.swappedTitle) {
        searchQueries.push(`${extracted.swappedArtist} ${extracted.swappedTitle}`);
        searchQueries.push(`track:${extracted.swappedTitle} artist:${extracted.swappedArtist}`);
      }
    }
    
    console.log(chalk.blue(`[Spotify] Generated ${searchQueries.length} search queries: ${JSON.stringify([...new Set(searchQueries)])}`));
    
    // Search for tracks using each query variation
    let allTracks = [];
    
    for (const searchQuery of [...new Set(searchQueries)]) { // Remove duplicates
      const spotifyTracks = await searchSpotifyTrack(searchQuery, MAX_SEARCH_RESULTS_PER_QUERY);
      if (spotifyTracks) {
        allTracks = [...allTracks, ...spotifyTracks];
      }
    }
    
    // If no tracks found, return null
    if (allTracks.length === 0) {
      console.log(chalk.yellow(`[Spotify] No tracks found for query: "${query}"`));
      return null;
    }
    
    // Get unique tracks based on ID
    const uniqueTracks = [];
    const trackIds = new Set();
    
    for (const track of allTracks) {
      if (!trackIds.has(track.id)) {
        trackIds.add(track.id);
        uniqueTracks.push(track);
      }
    }
    
    // For direct search without YouTube data, we'll use a simpler scoring method
    // Score based on track popularity and how well it matches the query
    const scoredTracks = uniqueTracks.map(track => {
      // Simple text similarity between track details and query
      const firstArtistName = track.artists && track.artists.length > 0 ? track.artists[0].name : '';
      const trackFullText = `${track.name} ${firstArtistName}`.toLowerCase(); // ** Use only first artist **
      const queryLower = query.toLowerCase();
      
      // Basic matching score - weighted with popularity
      let score = similarityScore(trackFullText, queryLower);
      
      // Add a small boost for popular tracks
      const popularityBoost = track.popularity ? (track.popularity / 1000) : 0; // Max 0.1 boost
      
      // Combine scores
      const finalScore = Math.min(1, score + popularityBoost);
      
      return { track, score: finalScore };
    });
    
    // Sort by score (highest first)
    scoredTracks.sort((a, b) => b.score - a.score);
    
    // Get the top result
    const bestMatch = scoredTracks[0].track;
    // Display only the first artist name
    const firstArtistName = bestMatch.artists && bestMatch.artists.length > 0 
      ? bestMatch.artists[0].name 
      : 'Unknown Artist';
    console.log(chalk.green(`[Spotify] Best match for "${query}": "${bestMatch.name}" by ${firstArtistName} (Score: ${scoredTracks[0].score.toFixed(3)})`));
    
    // Format the result the same way as getSpotifyEquivalent
    const firstArtist = bestMatch.artists && bestMatch.artists.length > 0 ? bestMatch.artists[0] : null;
    const firstImage = bestMatch.album?.images?.[0]; // Get the first image if available
    return {
      id: bestMatch.id,
      name: bestMatch.name,
      artists: firstArtist ? [{ // Only include name for the first artist
        name: firstArtist.name
      }] : [],
      album: firstImage ? { // Only include images array with the first image's URL
        images: [{ url: firstImage.url }]
      } : { images: [] }, // Return empty images array if none found
      durationMs: bestMatch.duration_ms,
      uri: bestMatch.uri,
      url: bestMatch.external_urls?.spotify
    };
  } catch (error) {
    console.error(chalk.red(`[Spotify] Error finding track by query "${query}"`), error);
    return null;
  }
}

/**
 * Extracts the Spotify track ID from a Spotify track URL.
 * @param {string} url The Spotify track URL.
 * @returns {string|null} The track ID or null if the URL is invalid.
 */
function extractSpotifyTrackId(url) {
  try {
    // First trim the URL to handle cases where users might add text after the link
    const trimmedUrl = url.split(/\s+/)[0];
    
    const urlObj = new URL(trimmedUrl);
    if (urlObj.hostname !== 'open.spotify.com') {
      return null;
    }
    
    // Check for both regular and international format paths
    // Regular: /track/ID
    // International: /intl-XX/track/ID
    const pathParts = urlObj.pathname.split('/').filter(part => part);
    
    let trackId = null;
    if (pathParts[0] === 'track') {
      // Regular format: /track/ID
      trackId = pathParts[1];
    } else if (pathParts[0].startsWith('intl-') && pathParts[1] === 'track') {
      // International format: /intl-XX/track/ID
      trackId = pathParts[2];
    }
    
    // Spotify IDs are always 22 characters long
    if (trackId && trackId.length >= 22) {
      return trackId.substring(0, 22);
    }
    
    return null; // Not a valid track URL format
  } catch (error) {
    console.error(chalk.yellow(`[Spotify] Invalid URL format: ${url}`), error);
    return null;
  }
}

/**
 * Fetches track details directly from Spotify using a track ID.
 * @param {string} trackId The Spotify track ID.
 * @returns {Promise<object|null>} The formatted track details matching SpotifyTrackData structure or null.
 */
async function getSpotifyTrackDetailsById(trackId) {
  if (!trackId) return null;

  const token = await getSpotifyToken();
  if (!token) {
    console.error(chalk.red('[Spotify] Failed to get Spotify token for direct track fetch.'));
    return null;
  }

  const url = `https://api.spotify.com/v1/tracks/${trackId}`;

  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(chalk.red(`[Spotify] Error fetching track ${trackId}: ${response.status} ${response.statusText}`), errorBody);
      if (response.status === 404) return null;
      return null;
    }

    const trackData = await response.json();

    // Format the data to match SpotifyTrackData structure
    const firstArtist = trackData.artists && trackData.artists.length > 0 ? trackData.artists[0] : null;
    const firstImage = trackData.album?.images?.[0]; // Get the first image if available

    return {
      id: trackData.id,
      name: trackData.name,
      // Return artists array in the expected format (using only first artist's name)
      artists: firstArtist ? [{ name: firstArtist.name }] : [],
      // Return album object in the expected format (only images with first URL)
      album: firstImage ? {
        images: [{ url: firstImage.url }]
      } : { images: [] },
      durationMs: trackData.duration_ms,
      uri: trackData.uri,
      url: trackData.external_urls?.spotify
    };
  } catch (error) {
    console.error(chalk.red(`[Spotify] Exception fetching track ${trackId}:`), error);
    return null;
  }
}

module.exports = {
  getSpotifyToken,
  getSpotifyEquivalent,
  findSpotifyTrackBySearchQuery,
  extractSpotifyTrackId,
  getSpotifyTrackDetailsById,
};
