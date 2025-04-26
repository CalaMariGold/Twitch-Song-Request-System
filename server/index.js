const { createServer } = require('http')
const { Server } = require('socket.io')
const chalk = require('chalk')
const path = require('path')
const { fetchAllTimeStats } = require('./statistics')
const db = require('./database')
const { 
  formatDurationFromSeconds,
  parseIsoDuration,
  formatDuration,
  extractVideoId,
  extractYouTubeUrlFromText,
  extractSpotifyUrlFromText,
  analyzeRequestText,
  checkBlacklist,
  validateDuration
} = require('./helpers')
const { 
  extractSpotifyTrackId,
  getSpotifyTrackDetailsById
} = require('./spotify')
const { fetchYouTubeDetails } = require('./youtube')
const { 
  initTwitchChat, 
  sendChatMessage, 
  getTwitchUser,
  disconnectFromTwitch
} = require('./twitch')
const { connectToStreamElements, disconnectFromStreamElements } = require('./streamElements')
const spotify = require('./spotify')
require('dotenv').config()

// --- NEW: Admin Auth Setup ---
const authenticatedAdminSockets = new Set(); 
const ADMIN_USERNAMES_LOWER = (process.env.ADMIN_USERNAMES || '')
                                .split(',')
                                .map(name => name.trim().toLowerCase())
                                .filter(name => name); // Ensure lowercase and filter empty
console.log(chalk.blue(`[Config] Admin Usernames (lowercase): ${ADMIN_USERNAMES_LOWER.join(', ')}`));
// --- END NEW ---


const SOCKET_PORT = process.env.SOCKET_PORT ? parseInt(process.env.SOCKET_PORT, 10) : 3002
const httpServer = createServer()
const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'songRequestSystem.db');

// Determine allowed origins from environment variable
const allowedOriginsEnv = process.env.ALLOWED_ORIGINS || "http://localhost:3000,http://localhost:3001"; // Default for dev
const allowedOrigins = allowedOriginsEnv.split(',').map(origin => origin.trim());
console.log(chalk.blue(`[Config] Allowed CORS Origins: ${allowedOrigins.join(', ')}`))

// Add domain detection
const productionDomain = process.env.NEXT_PUBLIC_APP_URL 
  ? new URL(process.env.NEXT_PUBLIC_APP_URL).origin 
  : null;
  
if (productionDomain) {
  console.log(chalk.blue(`[Config] Adding production domain to allowed origins: ${productionDomain}`));
  allowedOrigins.push(productionDomain);
}

// Configuration for Duration Limits (Read from .env with defaults)
const MAX_DONATION_DURATION_SECONDS = parseInt(process.env.MAX_DONATION_DURATION_SECONDS || '600', 10); // Default 10 minutes
const MAX_CHANNEL_POINT_DURATION_SECONDS = parseInt(process.env.MAX_CHANNEL_POINT_DURATION_SECONDS || '300', 10); // Default 5 minutes
console.log(chalk.blue(`[Config] Max Donation Duration: ${MAX_DONATION_DURATION_SECONDS}s`));
console.log(chalk.blue(`[Config] Max Channel Point Duration: ${MAX_CHANNEL_POINT_DURATION_SECONDS}s`));

// Twitch Chat Bot Configuration
const TWITCH_BOT_USERNAME = process.env.TWITCH_BOT_USERNAME;
const TWITCH_BOT_OAUTH_TOKEN = process.env.TWITCH_BOT_OAUTH_TOKEN;
const TWITCH_CHANNEL_NAME = process.env.TWITCH_CHANNEL_NAME;

// Configuration for StreamElements Channel Point Filtering
const TARGET_REWARD_TITLE = process.env.TARGET_REWARD_TITLE; // Use title for filtering

// StreamElements Configuration
const SE_JWT_TOKEN = process.env.STREAMELEMENTS_JWT_TOKEN;
const SE_ACCOUNT_ID = process.env.STREAMELEMENTS_ACCOUNT_ID;

if (!SE_JWT_TOKEN || !SE_ACCOUNT_ID) {
  console.warn(chalk.yellow('StreamElements configuration (JWT token, account ID) are missing in .env file. StreamElements donations disabled.'));
}

if (!TWITCH_BOT_USERNAME || !TWITCH_BOT_OAUTH_TOKEN || !TWITCH_CHANNEL_NAME) {
  console.error(chalk.red('Twitch bot credentials (username, token, channel) are missing in .env file. Chat features disabled.'));
}

// Initialize Twitch chat client
const tmiClient = initTwitchChat({
  TWITCH_BOT_USERNAME,
  TWITCH_BOT_OAUTH_TOKEN,
  TWITCH_CHANNEL_NAME
});

// Initialize database first, before we setup any routes or connections
db.initDatabase(dbPath);
const { updateSongSpotifyDataAndDetailsInDbQueue } = require('./database');

// Server state - Initial state will be loaded from DB
const state = {
  queue: [], // Will be loaded from active_queue table
  history: [], // Will be loaded from song_history table
  activeSong: null,
  settings: {}, // Will be loaded from settings table
  blacklist: [], // Will be loaded from blacklist table
  blockedUsers: [] // Will be loaded from blocked_users table
}

const io = new Server(httpServer, {
    cors: {
        // Update to use the specific allowed origins
        origin: allowedOrigins,
        methods: ["GET", "POST"],
        credentials: true
    },
    // Add these parameters to properly handle proxied WebSocket connections
    path: '/socket.io/',
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000,
    // Allow upgrades
    allowUpgrades: true,
    // Handle websocket errors more gracefully
    upgradeTimeout: 10000
})

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`); // Log connection

    // --- NEW: Admin Auth Handler ---
    socket.on('authenticateAdmin', (data) => {
      if (data && data.login && ADMIN_USERNAMES_LOWER.includes(data.login.toLowerCase())) {
        console.log(chalk.cyan(`[Auth] Admin authenticated: ${data.login} (Socket ID: ${socket.id})`));
        authenticatedAdminSockets.add(socket.id);
        // Optionally send confirmation back to client
        socket.emit('adminAuthenticated'); 
      } else {
        console.warn(chalk.yellow(`[Auth] Failed admin authentication attempt for socket: ${socket.id}`), data);
        // Optionally send error back to client
        // socket.emit('adminAuthFailed');
      }
    });
    // --- END NEW ---

    // --- NEW: Wrapper function for admin checks ---
    const requireAdmin = (handler) => {
      return (...args) => {
        if (!authenticatedAdminSockets.has(socket.id)) {
          console.warn(chalk.yellow(`[Security] Unauthorized attempt for admin action by socket: ${socket.id}. Event: ${handler.name || 'anonymous'}`));
          // Optionally emit an error back to the specific client
          // socket.emit('adminError', { message: 'Authentication required for this action.' });
          return; // Stop processing
        }
        // If authorized, call the original handler
        try {
          handler(...args);
        } catch (error) {
            console.error(chalk.red(`[Error] Error in admin handler for socket ${socket.id}:`), error);
            // Optionally emit a generic error back
            // socket.emit('adminError', { message: 'An error occurred processing your request.' });
        }
      };
    };
    // --- END NEW ---

    // --- NEW: Disconnect Cleanup ---
    socket.on('disconnect', () => {
      console.log(`Client disconnected: ${socket.id}`);
      authenticatedAdminSockets.delete(socket.id); // Clean up on disconnect
    });
    // --- END NEW ---
    
    // Send initial state to newly connected client - fetch history from DB first
    let recentHistory = db.getRecentHistory();
    
    // Send initial state including fetched history
    socket.emit('initialState', {
        ...state,
        history: recentHistory // Include history from DB
    })
    // Also send total counts on initial connection
    broadcastTotalCounts(); 
    broadcastTodaysCount(); // NEW: Send today's count too
    
    // Handle explicit getState request
    socket.on('getState', () => {
       let recentHistory = db.getRecentHistory();
       // Send current state including recent history
       socket.emit('initialState', {
            ...state,
            history: recentHistory // Overwrite in-memory history with recent DB history
        });
        // Also send total counts on explicit request
        broadcastTotalCounts();
        broadcastTodaysCount(); // NEW: Send today's count too
    })
    
    // Get YouTube video details (for Request Plan feature)
    socket.on('getYouTubeDetails', async (youtubeUrl, callback) => {
      try {
        const videoId = extractVideoId(youtubeUrl)
        if (!videoId) {
          return callback({ error: 'Invalid YouTube URL' })
        }
        
        const videoDetails = await fetchYouTubeDetails(videoId)
        callback(null, videoDetails)
      } catch (error) {
        console.error('Error fetching YouTube details:', error)
        callback({ error: error.message || 'Failed to fetch video details' })
      }
    })
    
    // Get song details for Request Plan (handles YouTube URLs, Spotify URLs, and text search)
    socket.on('getSongDetailsForPlan', async (userInput, callback) => {
      try {
        if (!userInput || userInput.trim() === '') {
          return callback({ error: 'Please enter a valid URL or song name' });
        }

        // Use existing analyzeRequestText function to determine input type
        const analysisResult = analyzeRequestText(userInput);
        
        if (analysisResult.type === 'none') {
          return callback({ error: 'Please enter a valid URL or song name' });
        }
        
        if (analysisResult.type === 'youtube') {
          // Process as YouTube URL
          const videoId = extractVideoId(analysisResult.value);
          if (!videoId) {
            return callback({ error: 'Invalid YouTube URL' });
          }
          
          const videoDetails = await fetchYouTubeDetails(videoId);
          
          // Optionally try to find Spotify match (same as validateAndAddSong)
          let spotifyMatch = null;
          let artistName = videoDetails.channelTitle; // Default to YouTube channel
          
          try {
            spotifyMatch = await spotify.getSpotifyEquivalent({
              title: videoDetails.title,
              artist: videoDetails.channelTitle,
              durationSeconds: videoDetails.durationSeconds
            });
            
            // If Spotify match found, use Spotify artist instead of YouTube channel
            if (spotifyMatch && spotifyMatch.artists && spotifyMatch.artists.length > 0) {
              // Use only the first artist's name, just like in validateAndAddSong
              artistName = spotifyMatch.artists[0].name;
              console.log(chalk.green(`[Spotify] Using Spotify artist "${artistName}" for Request Plan instead of YouTube channel "${videoDetails.channelTitle}"`));
            }
          } catch (spotifyError) {
            console.log(chalk.yellow(`[Spotify] Error finding match for plan: ${spotifyError.message}`));
            // Continue without Spotify match
          }
          
          // Return formatted result
          callback(null, {
            sourceType: 'youtube',
            youtubeUrl: analysisResult.value,
            title: spotifyMatch ? spotifyMatch.name : videoDetails.title,
            artist: artistName,
            channelId: videoDetails.channelId,
            duration: videoDetails.duration,
            durationSeconds: videoDetails.durationSeconds,
            thumbnailUrl: spotifyMatch?.album?.images?.[0]?.url || videoDetails.thumbnailUrl,
            spotifyData: spotifyMatch
          });
        } else if (analysisResult.type === 'spotifyUrl') {
          // Process as Spotify URL
          const trackId = extractSpotifyTrackId(analysisResult.value);
          if (!trackId) {
            return callback({ error: 'Invalid Spotify URL' });
          }
          
          const spotifyDetails = await getSpotifyTrackDetailsById(trackId);
          if (!spotifyDetails) {
            return callback({ error: 'Could not find Spotify track' });
          }
          
          // Get artist name from the first artist
          const artistName = spotifyDetails.artists && spotifyDetails.artists.length > 0 
            ? spotifyDetails.artists[0].name 
            : 'Unknown Artist';
          
          // Get thumbnail URL from album image
          const thumbnailUrl = spotifyDetails.album && spotifyDetails.album.images && spotifyDetails.album.images.length > 0
            ? spotifyDetails.album.images[0].url
            : null;
          
          // Return formatted result
          callback(null, {
            sourceType: 'spotify',
            youtubeUrl: null,
            title: spotifyDetails.name,
            artist: artistName,
            channelId: null,
            duration: formatDurationFromSeconds(Math.round(spotifyDetails.durationMs / 1000)),
            durationSeconds: Math.round(spotifyDetails.durationMs / 1000),
            thumbnailUrl: thumbnailUrl,
            spotifyData: spotifyDetails
          });
        } else if (analysisResult.type === 'text') {
          // Process as text search
          const searchQuery = analysisResult.value;
          const spotifyTrack = await spotify.findSpotifyTrackBySearchQuery(searchQuery);
          
          if (!spotifyTrack) {
            return callback({ error: 'Could not find a matching song on Spotify' });
          }
          
          // Get artist name from the first artist
          const artistName = spotifyTrack.artists && spotifyTrack.artists.length > 0 
            ? spotifyTrack.artists[0].name 
            : 'Unknown Artist';
          
          // Get thumbnail URL from album image
          const thumbnailUrl = spotifyTrack.album && spotifyTrack.album.images && spotifyTrack.album.images.length > 0
            ? spotifyTrack.album.images[0].url
            : null;
          
          // Return formatted result
          callback(null, {
            sourceType: 'text',
            youtubeUrl: null,
            title: spotifyTrack.name,
            artist: artistName,
            channelId: null,
            duration: formatDurationFromSeconds(Math.round(spotifyTrack.durationMs / 1000)),
            durationSeconds: Math.round(spotifyTrack.durationMs / 1000),
            thumbnailUrl: thumbnailUrl,
            spotifyData: spotifyTrack
          });
        }
      } catch (error) {
        console.error('Error processing song details for plan:', error);
        callback({ error: error.message || 'Failed to process song details' });
      }
    })
    
    // Handle queue updates
    socket.on('updateQueue', requireAdmin((updatedQueue) => {
        // Update in-memory queue first
        state.queue = updatedQueue;

        // Sync Database: Clear existing DB queue and re-insert all items from updatedQueue
        db.clearDbQueue();
        if (Array.isArray(state.queue)) { // Ensure it's an array before iterating
             state.queue.forEach(song => db.addSongToDbQueue(song));
             console.log(chalk.grey(`[DB Write] Re-synced active_queue table with ${state.queue.length} items.`));
        } else {
            console.error(chalk.red('[DB Write] Received non-array data in updateQueue event. Cannot sync DB.'));
        }

        // Inform ALL clients (including sender) of the updated queue
        io.emit('queueUpdate', state.queue);
        console.log(chalk.magenta(`[Admin:${socket.id}] Queue updated and DB re-synced via socket.`));
    }))

    // Handle addSong event
    socket.on('addSong', async (songRequestData) => {
        // Ensure the incoming data has necessary fields before validating
        if (!songRequestData || (!songRequestData.youtubeUrl && !songRequestData.message) || !songRequestData.requester) { // Allow message for Spotify-only
             console.error(chalk.red('[Socket.IO] Received invalid song request data via socket:'), songRequestData);
             return;
        }
        // Extract bypass flag, default to false if not provided
        const bypass = songRequestData.bypassRestrictions === true;
        const isAdminAdd = songRequestData.source === 'admin'; // Check if it's an admin add

        // --- NEW: Check auth if bypassing ---
        if (bypass && !authenticatedAdminSockets.has(socket.id)) {
             console.warn(chalk.yellow(`[Security] Unauthorized attempt to bypass restrictions by socket: ${socket.id}`));
             return; // Stop processing
        }
        // --- END NEW ---

        console.log(chalk.magenta(`[Admin:${bypass ? socket.id : 'N/A'}] Adding song via socket. Bypass: ${bypass}. Source: ${songRequestData.source || 'unknown'}`));
        
        // Generate an ID if not provided (useful for admin adds)
        const finalRequestId = songRequestData.id || Date.now().toString();
        const requestToAdd = { ...songRequestData, id: finalRequestId };

        try {
            await validateAndAddSong(requestToAdd, bypass);
            // Broadcast counts after potentially adding a song
            broadcastTotalCounts(); 

            // *** NEW: Force admin-added songs to the top ***
            if (isAdminAdd) {
                console.log(chalk.cyan(`[Admin Add] Forcing song ${finalRequestId} to top of queue.`));
                const addedSongIndex = state.queue.findIndex(song => song.id === finalRequestId);

                if (addedSongIndex !== -1) {
                    // Song was successfully added by validateAndAddSong, now move it
                    const [movedSong] = state.queue.splice(addedSongIndex, 1); // Remove from current position
                    state.queue.unshift(movedSong); // Add to the beginning

                    // Re-sync the database queue with the new order
                    db.clearDbQueue();
                    state.queue.forEach(song => db.addSongToDbQueue(song));
                    console.log(chalk.cyan(`[Admin Add] DB re-synced after moving ${finalRequestId} to top.`));

                    // Emit the final, corrected queue update
                    io.emit('queueUpdate', state.queue);
                    console.log(chalk.cyan(`[Admin Add] Final queue update emitted after forcing to top.`));
                } else {
                    // This case should ideally not happen if validateAndAddSong succeeded
                    // but didn't actually add the song (maybe validation failed silently?)
                    console.warn(chalk.yellow(`[Admin Add] Could not find song ${finalRequestId} in queue after validateAndAddSong, cannot force to top.`));
                }
            }
             // *** END NEW ***

        } catch (error) {
             // If validateAndAddSong throws an error, log it
             console.error(chalk.red(`[Admin Add Error] Error during validateAndAddSong for request from ${songRequestData.requester}:`), error);
             // Optionally, inform the admin via socket if possible/needed
        }
    })

    // Handle remove song
    socket.on('removeSong', requireAdmin((songId) => {
        const songToRemove = state.queue.find(song => song.id === songId);
        if (songToRemove) {
            state.queue = state.queue.filter(song => song.id !== songId);
            db.removeSongFromDbQueue(songId); // Ensure db module exports this function
            io.emit('queueUpdate', state.queue);
            broadcastTotalCounts(); // Broadcast counts after removing song
            console.log(chalk.magenta(`[Admin:${socket.id}] Song removed via socket: ${songId}`));
        } else {
            console.warn(chalk.yellow(`[Admin:${socket.id}] Attempted to remove non-existent song via socket: ${songId}`));
        }
    }))

    // NEW: Handle updating Spotify link for a request
    socket.on('adminUpdateSpotifyLink', requireAdmin(async ({ requestId, spotifyUrl }) => {
        console.log(chalk.cyan(`[Admin:${socket.id}] Received adminUpdateSpotifyLink for ${requestId} with URL: ${spotifyUrl}`));

        if (!requestId || typeof spotifyUrl !== 'string') {
            console.warn(chalk.yellow(`[Admin:${socket.id}] Invalid payload for adminUpdateSpotifyLink.`));
            socket.emit('updateSpotifyError', { requestId, message: 'Invalid request data.' });
            return;
        }

        const trackId = extractSpotifyTrackId(spotifyUrl);
        if (!trackId) {
            console.warn(chalk.yellow(`[Admin:${socket.id}] Invalid Spotify URL provided: ${spotifyUrl}`));
            socket.emit('updateSpotifyError', { requestId, message: 'Invalid Spotify track URL format.' });
            return;
        }

        try {
            const spotifyDetails = await getSpotifyTrackDetailsById(trackId);
            if (!spotifyDetails) {
                console.warn(chalk.yellow(`[Admin:${socket.id}] Could not find Spotify track details for ID: ${trackId}`));
                socket.emit('updateSpotifyError', { requestId, message: 'Could not find track details on Spotify.' });
                return;
            }

            // Find the request in the in-memory queue
            const requestIndex = state.queue.findIndex(req => req.id === requestId);
            if (requestIndex === -1) {
                console.warn(chalk.yellow(`[Admin:${socket.id}] Could not find request ${requestId} in the current queue.`));
                socket.emit('updateSpotifyError', { requestId, message: 'Request not found in the queue.' });
                return;
            }

            // Prune the spotifyDetails object to match the structure used elsewhere
            const prunedSpotifyData = spotifyDetails ? {
                id: spotifyDetails.id,
                name: spotifyDetails.name,
                artists: spotifyDetails.artists?.map(a => ({ name: a.name })) || [],
                album: spotifyDetails.album?.images?.[0] ? {
                  images: [{ url: spotifyDetails.album.images[0].url }]
                } : { images: [] },
                durationMs: spotifyDetails.durationMs,
                uri: spotifyDetails.uri,
                url: spotifyDetails.url
            } : null;

            // Update the in-memory queue with the pruned data
            state.queue[requestIndex].spotifyData = prunedSpotifyData;
            
            // Update title and artist based on Spotify data as requested
            state.queue[requestIndex].title = spotifyDetails.name;
            // Use only the first artist's name
            const updatedArtist = spotifyDetails.artists && spotifyDetails.artists.length > 0 
                ? spotifyDetails.artists[0].name 
                : 'Unknown Artist';
            state.queue[requestIndex].artist = updatedArtist;
            
            // NEW: Update thumbnail and duration
            const newThumbnailUrl = spotifyDetails.album?.images?.[0]?.url || state.queue[requestIndex].thumbnailUrl; 
            const newDurationSeconds = spotifyDetails.durationMs ? Math.round(spotifyDetails.durationMs / 1000) : state.queue[requestIndex].durationSeconds; // Fallback to existing duration
            state.queue[requestIndex].thumbnailUrl = newThumbnailUrl;
            state.queue[requestIndex].durationSeconds = newDurationSeconds;
            
            console.log(chalk.green(`[Admin:${socket.id}] Updated in-memory Spotify data, title, artist (first only), thumbnail, and duration for request ${requestId}.`));

            // Update the database with the pruned data and updated title/artist/thumbnail/duration
            updateSongSpotifyDataAndDetailsInDbQueue(requestId, prunedSpotifyData, spotifyDetails.name, updatedArtist, newThumbnailUrl, newDurationSeconds);

            // Broadcast the updated queue to all clients
            io.emit('queueUpdate', state.queue);
            console.log(chalk.cyan(`[Admin:${socket.id}] Broadcasted queue update after Spotify link change for ${requestId}.`));

            // Send success confirmation back to the admin who made the change
            socket.emit('updateSpotifySuccess', { requestId });

        } catch (error) {
            console.error(chalk.red(`[Admin:${socket.id}] Error processing adminUpdateSpotifyLink for ${requestId}:`), error);
            socket.emit('updateSpotifyError', { requestId, message: 'An internal server error occurred.' });
        }
    }));

    // Handle clear queue
    socket.on('clearQueue', requireAdmin(() => {
        state.queue = [];
        db.clearDbQueue(); // Clear the queue in the database as well
        io.emit('queueUpdate', state.queue);
        broadcastTotalCounts(); // Broadcast counts after clearing queue
        console.log(chalk.magenta(`[Admin:${socket.id}] Queue cleared via socket.`));
    }))

    socket.on('resetSystem', requireAdmin(async () => {
        // Clear in-memory state
        state.queue = []
        state.activeSong = null
        state.history = []

        // Clear persistent state (Queue)
        db.clearDbQueue();
        // Clear active song from DB
        db.clearActiveSongFromDB();
        // Note: History table is NOT cleared by reset. Settings/Blacklist/Blocked are also NOT cleared.

        // Emit updates to all clients
        io.emit('queueUpdate', state.queue)
        io.emit('activeSong', state.activeSong)
        io.emit('historyUpdate', state.history) // Note: history is [] here
        broadcastTotalCounts(); // Broadcast counts after system reset
        console.log(chalk.magenta(`[Admin:${socket.id}] System reset via socket.`));
    }))

    // Handle user deleting their own request
    socket.on('deleteMyRequest', (data) => {
        const { requestId, userLogin } = data;
        if (!requestId || !userLogin) {
            console.warn(chalk.yellow('[Socket.IO] Received invalid deleteMyRequest data:'), data);
            // Optionally emit an error back to the client
            // socket.emit('deleteRequestError', { message: 'Invalid request data' });
            return;
        }

        const songIndex = state.queue.findIndex(song => song.id === requestId);
        if (songIndex !== -1) {
            const songToDelete = state.queue[songIndex];
            // Verify ownership
            if (songToDelete.requesterLogin && songToDelete.requesterLogin.toLowerCase() === userLogin.toLowerCase()) {
                // Remove from in-memory queue
                state.queue.splice(songIndex, 1);
                // Remove from DB queue
                db.removeSongFromDbQueue(requestId);
                // Broadcast updated queue
                io.emit('queueUpdate', state.queue);
                broadcastTotalCounts(); // Broadcast counts after user deletes own request
                console.log(chalk.cyan(`[User] Song removed by requester ${userLogin}: ${requestId}`));
            } else {
                console.warn(chalk.yellow(`[Security] User ${userLogin} attempted to delete song ${requestId} owned by ${songToDelete.requesterLogin}`));
                // Optionally emit an error back to the client
                // socket.emit('deleteRequestError', { message: 'Permission denied' });
            }
        } else {
            console.warn(chalk.yellow(`[User] Attempted to delete non-existent song ID: ${requestId}`));
            // Optionally emit an error back to the client
            // socket.emit('deleteRequestError', { message: 'Song not found in queue' });
        }
    });

    // Handle getAllTimeStats request
    socket.on('getAllTimeStats', () => {
        try {
            const stats = fetchAllTimeStats(db.getDb());
            socket.emit('allTimeStatsUpdate', stats);
        } catch (error) {
            console.error(chalk.red('[Statistics] Failed to get all-time statistics:'), error);
            socket.emit('allTimeStatsError', { message: 'Failed to fetch statistics data' });
        }
    });

    // Handle settings
    socket.on('setMaxDuration', requireAdmin((minutes) => {
        state.settings = state.settings || {}
        state.settings.maxDuration = minutes
        db.saveSetting('maxDuration', minutes); // Save setting to DB
        io.emit('settingsUpdate', state.settings)
        console.log(chalk.magenta(`[Admin:${socket.id}] Max Duration set to ${minutes} mins via socket.`));
    }))

    // Handle active song updates (Auth needed)
    // Note: updateActiveSong can be called with null (stop) or a song object (play)
    socket.on('updateActiveSong', requireAdmin((song) => {
        console.log(chalk.magenta(`[Admin:${socket.id}] Updating active song via socket:`), song);

        // If there was a song previously active, log it to history
        if (state.activeSong) {
            const finishedSong = { ...state.activeSong, completedAt: new Date().toISOString() };
            console.log(chalk.blue(`[Control] Previous active song "${finishedSong.title}" moved to history.`));
            db.logCompletedSong(finishedSong);
            // No need to clear active song from DB here, as saveActiveSongToDB below will overwrite it
            
            // Send history update immediately for the previously active song
            const recentHistory = db.getRecentHistory();
            io.emit('historyUpdate', recentHistory);
            broadcastTotalCounts(); // Broadcast counts after a song moves to history
        }


        if (song) {
            // Setting a new song as active
            state.activeSong = { ...song, startedAt: new Date().toISOString() };
            db.saveActiveSongToDB(state.activeSong);
            console.log(chalk.green(`[Control] Set active song to: "${state.activeSong.title}"`));

            // Remove the song from the queue state and DB if it was there
            const originalQueueLength = state.queue.length;
            state.queue = state.queue.filter(s => s.id !== song.id);
            if (state.queue.length < originalQueueLength) {
                 db.removeSongFromDbQueue(song.id); // Remove from DB only if found in memory queue
                 console.log(chalk.grey(`[DB Write] Removed newly active song ${song.id} from active_queue.`));
            } else {
                 console.log(chalk.grey(`[Control] Newly active song ${song.id} was not found in the memory queue (maybe added manually or from history).`));
            }

        } else {
             // Clearing the active song (e.g., Skip button on empty queue or explicit clear)
             // This case might be handled better by 'markSongAsFinished' if the intent is completion
             console.log(chalk.blue(`[Control] Clearing active song.`));
             state.activeSong = null;
             db.clearActiveSongFromDB();
        }

        // Broadcast the change to all clients
        io.emit('activeSong', state.activeSong);
        io.emit('queueUpdate', state.queue); // Also update queue in case a song was removed

    }));

    // Mark song as finished (without playing next)
    socket.on('markSongAsFinished', requireAdmin(() => {
        console.log(chalk.magenta(`[Admin:${socket.id}] Marking song as finished via socket.`));
        const finishedSong = handleMarkSongAsFinished(); // Use the refactored helper
        if (finishedSong) {
             // Optionally send confirmation back to admin?
        } else {
             // Optionally send info back that no song was active?
        }
    }));

    // Handle blacklist updates
    socket.on('updateBlacklist', requireAdmin((newBlacklist) => {
        const oldBlacklist = state.blacklist || [];
        state.blacklist = newBlacklist || [];

        // Find added and removed items for DB update
        const addedItems = state.blacklist.filter(newItem => 
            !oldBlacklist.some(oldItem => oldItem.term === newItem.term && oldItem.type === newItem.type)
        );
        const removedItems = oldBlacklist.filter(oldItem => 
            !state.blacklist.some(newItem => newItem.term === oldItem.term && newItem.type === oldItem.type)
        );

        addedItems.forEach(item => db.addBlacklistPattern(item.term, item.type, new Date().toISOString()));
        removedItems.forEach(item => db.removeBlacklistPattern(item.term, item.type));

        io.emit('blacklistUpdate', state.blacklist)
        console.log(chalk.magenta(`[Admin:${socket.id}] Blacklist updated via socket (${(state.blacklist || []).length} items). Added: ${addedItems.length}, Removed: ${removedItems.length}`));
    }))

    // Handle blocked users
    socket.on('updateBlockedUsers', requireAdmin((newBlockedUsers) => {
        const oldBlockedUsers = state.blockedUsers || [];
        state.blockedUsers = newBlockedUsers || [];

        // Find added and removed users for DB update
        const addedUsers = state.blockedUsers.filter(newUser => 
            !oldBlockedUsers.some(oldUser => oldUser.username.toLowerCase() === newUser.username.toLowerCase())
        );
        const removedUsers = oldBlockedUsers.filter(oldUser => 
            !state.blockedUsers.some(newUser => newUser.username.toLowerCase() === oldUser.username.toLowerCase())
        );

        addedUsers.forEach(user => db.addBlockedUser(user.username, new Date().toISOString()));
        removedUsers.forEach(user => db.removeBlockedUser(user.username));

        io.emit('blockedUsersUpdate', state.blockedUsers)
        console.log(chalk.magenta(`[Admin:${socket.id}] Blocked users updated via socket (${(state.blockedUsers || []).length} users). Added: ${addedUsers.length}, Removed: ${removedUsers.length}`));
    }))

    // Handle returning a song from history to the queue
    socket.on('returnToQueue', requireAdmin((song) => {
        if (!song) {
            console.warn(chalk.yellow('[Socket.IO] returnToQueue called with null/undefined song'));
            return;
        }

        console.log(chalk.magenta(`[Admin:${socket.id}] Returning song "${song.title}" (ID: ${song.id}) to queue from history via socket.`));
        
        // Create a new song object with a new ID
        // Assign a higher priority to ensure it stays at the top after restart
        const priorityOverride = 2; // Higher than donation (1) and channel points (0)
        const newSong = {
            ...song,
            id: Date.now().toString(), // Generate a new ID
            timestamp: new Date().toISOString(), // Update timestamp to now
            requestType: song.requestType,
            priority: priorityOverride, // Explicitly set high priority
            source: 'history_requeue'
        };

        // Add to the beginning of the queue
        state.queue.unshift(newSong);
        
        // Add to DB queue (addSongToDbQueue will now use the priority set above)
        db.addSongToDbQueue(newSong);
        broadcastTotalCounts(); // Broadcast counts after returning song to queue

        // Emit queue update to all clients
        io.emit('queueUpdate', state.queue);
    }))

    // Add handler for clearing history
    socket.on('clearHistory', requireAdmin(() => {
        const success = db.clearDbHistory();
        if (success) {
            // Send empty history to all clients
            io.emit('historyUpdate', []);
            broadcastTotalCounts(); // Broadcast counts after clearing history
            broadcastTodaysCount(); // NEW: Broadcast today's count
            console.log(chalk.magenta(`[Admin:${socket.id}] History cleared via socket.`));
            
            // After clearing history, refresh and broadcast all-time stats
            try {
                const updatedStats = fetchAllTimeStats(db.getDb());
                io.emit('allTimeStatsUpdate', updatedStats);
                console.log(chalk.blue('[Statistics] Refreshed all-time stats after history clear'));
            } catch (error) {
                console.error(chalk.red('[Statistics] Error refreshing stats after history clear:'), error);
                socket.emit('allTimeStatsError', { message: 'Failed to refresh statistics after clearing history' });
            }
        }
    }))

    // Add handler for deleting individual history items
    socket.on('deleteHistoryItem', requireAdmin((id) => {
        const success = db.deleteHistoryItem(id);
        if (success) {
            // Fetch and send updated history to all clients
            const recentHistory = db.getRecentHistory();
                io.emit('historyUpdate', recentHistory);
                broadcastTotalCounts(); // Broadcast counts after deleting history item
                broadcastTodaysCount(); // NEW: Broadcast today's count
                console.log(chalk.magenta(`[Admin:${socket.id}] History item ${id} deleted via socket.`));
                
                // After deleting history item, refresh and broadcast all-time stats
                try {
                const updatedStats = fetchAllTimeStats(db.getDb());
                    io.emit('allTimeStatsUpdate', updatedStats);
                    console.log(chalk.blue('[Statistics] Refreshed all-time stats after history item deletion'));
                } catch (error) {
                    console.error(chalk.red('[Statistics] Error refreshing stats after history deletion:'), error);
            }
        }
    }))

    // Add handler for skipping a song
    socket.on('skipSong', requireAdmin(() => {
        const songToSkip = state.activeSong;
        if (!songToSkip) {
            console.warn(chalk.yellow('[Admin] Skip requested but no song is active.'));
            return;
        }

        console.log(chalk.magenta(`[Admin] Skipping song: ${songToSkip.title}`));

        // 1. Log the skipped song to history
        // Add completedAt to songToSkip before logging
        const skippedSongWithTimestamp = { ...songToSkip, completedAt: new Date().toISOString() };
        const logged = db.logCompletedSong(skippedSongWithTimestamp);
        if (!logged) {
            console.error(chalk.red(`[Admin] Failed to log skipped song ${songToSkip.title} to history.`));
            return;
        }

        // 2. Clear the current active song (in memory and DB)
        db.clearActiveSongFromDB();
        state.activeSong = null;

        // 3. Get the next song from the queue (in memory and DB)
        const nextSong = state.queue.shift(); // Remove from front of memory queue
        if (nextSong) {
             db.removeSongFromDbQueue(nextSong.id);
        }

        // 4. Set the next song as active (in memory and DB)
        state.activeSong = nextSong || null;
        if (nextSong) {
             db.saveActiveSongToDB(nextSong);
        }

        // 5. Broadcast updates
        io.emit('activeSong', state.activeSong); // Send new active song (or null)
        io.emit('queueUpdate', state.queue);      // Send updated queue
        io.emit('songFinished', songToSkip);    // Notify that the previous song finished

        // Fetch and broadcast updated history
        const recentHistory = db.getRecentHistory();
        io.emit('historyUpdate', recentHistory);
        broadcastTotalCounts(); // Broadcast counts after skipping song
        broadcastTodaysCount(); // NEW: Broadcast today's count
        console.log(chalk.blue(`[History] Broadcast updated history (${recentHistory.length} items) after skipping song.`));

         // Also update statistics
         try {
            const statistics = fetchAllTimeStats(db.getDb());
            io.emit('allTimeStatsUpdate', statistics);
            console.log(chalk.blue('[Statistics] Broadcast updated statistics after song skip'));
        } catch (statsError) {
            console.error(chalk.red('[Statistics] Error refreshing statistics after skip:'), statsError);
        }

        console.log(chalk.magenta(`[Admin:${socket.id}] Song skipped. New active song: ${nextSong ? nextSong.title : 'None'}`));
    }))

    // --- NEW: Handle History Pagination --- 
    socket.on('getMoreHistory', (data) => {
        const limit = data?.limit || 20; // Default limit changed to 20
        const offset = data?.offset || 0; // Default offset

        if (typeof limit !== 'number' || limit <= 0 || typeof offset !== 'number' || offset < 0) {
            console.warn(chalk.yellow(`[Socket.IO] Invalid pagination request from ${socket.id}: limit=${limit}, offset=${offset}`));
            // Optionally send error back to client
            // socket.emit('moreHistoryError', { message: 'Invalid limit or offset.' });
            return;
        }
        
        try {
            console.log(chalk.blue(`[Socket.IO] Client ${socket.id} requested more history (limit: ${limit}, offset: ${offset})`));
            const historyChunk = db.getHistoryWithOffset(limit, offset);
            // Send the chunk back to the specific client that requested it
            socket.emit('moreHistoryData', historyChunk);
        } catch (error) {
            console.error(chalk.red(`[Socket.IO] Error fetching history chunk for ${socket.id}:`), error);
            // Optionally send error back to client
            // socket.emit('moreHistoryError', { message: 'Failed to fetch history data.' });
        }
    });
    // --- END NEW --- 
})

// Start the server and load initial data
async function startServer() {
  const loadedState = db.loadInitialState();
  state.queue = loadedState.queue;
  state.settings = { ...state.settings, ...loadedState.settings }; // Merge defaults with loaded
  state.blacklist = loadedState.blacklist;
  state.blockedUsers = loadedState.blockedUsers;
  state.activeSong = loadedState.activeSong; // Set the activeSong state from loaded data
  state.history = []; // Initialize history as empty, it's loaded on demand

  // Log the activeSong state for debugging
  console.log(chalk.blue(`[Server] Loaded activeSong: ${state.activeSong ? state.activeSong.title : 'null'}`));

  // Connect to StreamElements Socket API for donation/redemption events
  // Create a config object with the StreamElements settings
  const streamElementsConfig = {
    SE_JWT_TOKEN,
    SE_ACCOUNT_ID,
    TARGET_REWARD_TITLE
  };

  // Define our callback functions
  const onTipCallback = async (tipData) => {
    try {
      // Extract donation information
      const userName = tipData.username || 'Anonymous';
      const amount = tipData.amount || 0;
      const currency = tipData.currency || 'USD';
      const message = tipData.message || '';

      console.log(chalk.magenta(`[StreamElements] Processing donation: ${userName} - ${amount} ${currency} - Msg: "${message}"`));

      // Check for request type
      const analysisResult = analyzeRequestText(message);

      // Minimum donation amount ($3)
      const MIN_DONATION_AMOUNT = 3;
      if (amount < MIN_DONATION_AMOUNT) {
          console.log(chalk.yellow(`[StreamElements] Donation from ${userName} (${amount} ${currency}) below minimum (${MIN_DONATION_AMOUNT} ${currency}). Skipping request.`));
          sendChatMessage(`Thanks @${userName} for the ${amount} ${currency} donation! Song requests require a minimum donation of ${MIN_DONATION_AMOUNT} ${currency}. https://calamarigoldrequests.com/`);
          return;
      }

      // If no valid request type found, thank for donation but don't process
      if (analysisResult.type === 'none') {
          console.warn(chalk.yellow(`[StreamElements] No YouTube URL, Spotify URL, or song query found in donation from ${userName}: "${message}"`));
          sendChatMessage(`Thanks @${userName} for the ${amount} ${currency}! If you want to request a song with your dono next time, put either a YouTube link, Spotify link, or song name in the dono message. https://calamarigoldrequests.com/`);
          return;
      }

      // Create initial song request object (partially filled)
      const initialRequestData = {
          id: tipData.id || Date.now().toString(),
          requester: userName,
          timestamp: tipData.timestamp || new Date().toISOString(),
          requestType: 'donation',
          donationInfo: {
              amount: amount,
              currency: currency
          },
          message: message // Keep original message for reference
      };

      if (analysisResult.type === 'youtube') {
        // Process as a YouTube URL request using the existing centralized function
        await validateAndAddSong({
            ...initialRequestData,
            youtubeUrl: analysisResult.value,
            message: null // Clear message field when URL is provided
        });
      } else if (analysisResult.type === 'spotifyUrl') {
        // Process as a Spotify URL request
        try {
            console.log(chalk.blue(`[Spotify] Processing donation with Spotify URL: ${analysisResult.value}`));
            const trackId = extractSpotifyTrackId(analysisResult.value);
            if (!trackId) {
                console.warn(chalk.yellow(`[Spotify] Invalid Spotify URL in donation: ${analysisResult.value}`));
                sendChatMessage(`@${userName} Thanks for the donation! The Spotify link you provided doesn't look right. Please use a valid track link. https://calamarigoldrequests.com/`);
                return;
            }
            console.log(chalk.blue(`[Spotify] Successfully extracted track ID from donation: ${trackId}`));

            const spotifyDetails = await getSpotifyTrackDetailsById(trackId);
            if (spotifyDetails) {
                // Create a song request based on Spotify data
                const spotifyRequest = await createSpotifyBasedRequest(spotifyDetails, initialRequestData);

                // *** Perform Validations (Copied from text search path) ***
                const durationError = validateDuration(
                    spotifyRequest.durationSeconds,
                    spotifyRequest.requestType,
                    MAX_DONATION_DURATION_SECONDS,
                    MAX_CHANNEL_POINT_DURATION_SECONDS
                );
                if (durationError) {
                    console.log(chalk.yellow(`[Queue] Donation (Spotify URL) request duration (${spotifyRequest.durationSeconds}s) exceeds limit (${durationError.limit}s) - rejecting "${spotifyRequest.title}"`));
                    sendChatMessage(`@${userName} ${durationError.message} https://calamarigoldrequests.com/`);
                    return;
                }

                const blacklistMatch = checkBlacklist(spotifyRequest.title, spotifyRequest.artist, state.blacklist);
                if (blacklistMatch) {
                    console.log(chalk.yellow(`[Blacklist] Item matching term "${blacklistMatch.term}" (type: ${blacklistMatch.type}) found for "${spotifyRequest.title}" by ${spotifyRequest.artist} - rejecting`));
                    let blacklistMessage = `@${userName}, sorry, your request for "${spotifyRequest.title}"`;
                    if (blacklistMatch.type === 'artist') {
                        blacklistMessage += ` by "${spotifyRequest.artist}"`;
                    }
                    blacklistMessage += ` is currently blacklisted.`;
                    sendChatMessage(blacklistMessage + ' https://calamarigoldrequests.com/');
                    return;
                }
                // *** End Validations ***

                // Add to queue
                const position = addSongToQueue(spotifyRequest);
                const queuePosition = position + 1;

                // Emit updates
                io.emit('newSongRequest', spotifyRequest);
                io.emit('queueUpdate', state.queue);

                console.log(chalk.green(`[Queue] Added Spotify song (from URL) "${spotifyRequest.title}" by ${spotifyRequest.artist}. Type: donation. Requester: ${spotifyRequest.requester}. Position: #${queuePosition}`));

                // Send success message
                sendChatMessage(`@${userName} Thanks for the ${amount} ${currency} donation! Your priority request for "${spotifyRequest.title}" by ${spotifyRequest.artist} (from Spotify link) is #${queuePosition} in the queue. https://calamarigoldrequests.com/`);
            } else {
                console.log(chalk.yellow(`[Spotify] Could not find track details for Spotify URL: ${analysisResult.value}`));
                sendChatMessage(`@${userName} Thanks for the donation! I couldn't find the song details for the Spotify link you provided. https://calamarigoldrequests.com/`);
            }
        } catch (error) {
            console.error(chalk.red('[Spotify] Error processing Spotify URL donation:'), error);
            sendChatMessage(`@${userName} Thanks for the donation! There was an error processing the Spotify link. https://calamarigoldrequests.com/`);
        }
      } else if (analysisResult.type === 'text') {
        // Process as a text-based song request (Existing Logic)
        const searchQuery = analysisResult.value;
        try {
          console.log(chalk.blue(`[Spotify] Searching for song based on text: "${searchQuery}"`));
          const spotifyTrack = await spotify.findSpotifyTrackBySearchQuery(searchQuery);

          if (spotifyTrack) {
            // Create a song request based on Spotify data
            const spotifyRequest = await createSpotifyBasedRequest(spotifyTrack, initialRequestData);

            // Check duration using the helper and values from .env
            const durationError = validateDuration(
                spotifyRequest.durationSeconds,
                spotifyRequest.requestType,
                MAX_DONATION_DURATION_SECONDS,
                MAX_CHANNEL_POINT_DURATION_SECONDS
            );
            if (durationError) {
              console.log(chalk.yellow(`[Queue] Donation (text) request duration (${spotifyRequest.durationSeconds}s) exceeds limit (${durationError.limit}s) - rejecting "${spotifyRequest.title}"`));
              sendChatMessage(`@${userName} ${durationError.message} https://calamarigoldrequests.com/`);
              return;
            }

            // Check blacklist using the helper
            const blacklistMatch = checkBlacklist(spotifyRequest.title, spotifyRequest.artist, state.blacklist);
            if (blacklistMatch) {
                console.log(chalk.yellow(`[Blacklist] Item matching term "${blacklistMatch.term}" (type: ${blacklistMatch.type}) found for "${spotifyRequest.title}" by ${spotifyRequest.artist} - rejecting`));
                let blacklistMessage = `@${userName}, sorry, your request for "${spotifyRequest.title}"`;
                if (blacklistMatch.type === 'artist') {
                    blacklistMessage += ` by "${spotifyRequest.artist}"`;
                }
                blacklistMessage += ` is currently blacklisted.`;
                sendChatMessage(blacklistMessage + ' https://calamarigoldrequests.com/');
                return;
            }

            // Add to queue
            const position = addSongToQueue(spotifyRequest);
            const queuePosition = position + 1; // Convert to 1-indexed for user-facing messages

            // Emit updates
            io.emit('newSongRequest', spotifyRequest);
            io.emit('queueUpdate', state.queue);

            console.log(chalk.green(`[Queue] Added Spotify song (from text) "${spotifyRequest.title}" by ${spotifyRequest.artist}. Type: donation. Requester: ${spotifyRequest.requester}. Position: #${queuePosition}`));

            // Send success message
            sendChatMessage(`@${userName} Thanks for the ${amount} ${currency} donation! Your priority request for "${spotifyRequest.title}" by ${spotifyRequest.artist} is #${queuePosition} in the queue. https://calamarigoldrequests.com/`);
          } else {
            console.log(chalk.yellow(`[Spotify] No track found for query: "${searchQuery}"`));
            sendChatMessage(`@${userName} Thanks for the ${amount} ${currency} donation! I couldn't find a song matching "${searchQuery}". Try a different search or a YouTube/Spotify link next time. https://calamarigoldrequests.com/`);
          }
        } catch (error) {
          console.error(chalk.red('[Spotify] Error processing text-based donation:'), error);
          sendChatMessage(`@${userName} Thanks for the ${amount} ${currency} donation! There was an error finding your requested song. Please try again with a YouTube/Spotify link. https://calamarigoldrequests.com/`);
        }
      }
    } catch (error) {
      console.error(chalk.red('[StreamElements] Error processing donation:'), error);
    }
  };

  const onRedemptionCallback = async (redemptionData) => {
    try {
      const userName = redemptionData.username || 'Anonymous';
      const userInput = redemptionData.message || '';

      console.log(chalk.magenta(`[StreamElements] Channel point redemption: ${userName} - Content: "${userInput}"`));

      // Check for request type
      const analysisResult = analyzeRequestText(userInput);

      // If no valid request type found, reject the request
      if (analysisResult.type === 'none') {
        console.warn(chalk.yellow(`[StreamElements] No YouTube URL, Spotify URL, or song query found in redemption from ${userName}`));
        sendChatMessage(`@${userName}, you need to include either a YouTube link, Spotify link, or song name in your request. https://calamarigoldrequests.com/`);
        return;
      }

      // Create initial song request object (partially filled)
      const initialRequestData = {
        id: redemptionData.id || Date.now().toString(),
        requester: userName,
        timestamp: redemptionData.timestamp || new Date().toISOString(),
        requestType: 'channelPoint',
        source: 'streamelements_redemption',
        message: userInput // Keep original message for reference
      };

      if (analysisResult.type === 'youtube') {
        // Process as a YouTube URL request using the existing centralized function
        // Duration and blacklist validation happens inside validateAndAddSong
        await validateAndAddSong({
            ...initialRequestData,
            youtubeUrl: analysisResult.value,
            message: null // Clear message field when URL is provided
        });
      } else if (analysisResult.type === 'spotifyUrl') {
         // Process as a Spotify URL request
        try {
            console.log(chalk.blue(`[Spotify] Processing channel point with Spotify URL: ${analysisResult.value}`));
            const trackId = extractSpotifyTrackId(analysisResult.value);
            if (!trackId) {
                console.warn(chalk.yellow(`[Spotify] Invalid Spotify URL in redemption: ${analysisResult.value}`));
                sendChatMessage(`@${userName}, the Spotify link you provided doesn't look right. Please use a valid track link. https://calamarigoldrequests.com/`);
                return;
            }
            console.log(chalk.blue(`[Spotify] Successfully extracted track ID from channel point: ${trackId}`));

            const spotifyDetails = await getSpotifyTrackDetailsById(trackId);
            if (spotifyDetails) {
                // Create a song request based on Spotify data
                const spotifyRequest = await createSpotifyBasedRequest(spotifyDetails, initialRequestData);

                // *** Perform Validations (Copied from text search path) ***
                // Check for user queue limit first
                const existingRequest = state.queue.find(song => song.requesterLogin?.toLowerCase() === userName.toLowerCase() || song.requester.toLowerCase() === userName.toLowerCase());
                if (existingRequest) {
                    console.log(chalk.yellow(`[Queue] User ${userName} already has a song in the queue - rejecting channel point request`));
                    sendChatMessage(`@${userName}, you already have a song in the queue. Please wait for it to play. https://calamarigoldrequests.com/`);
                    return;
                }

                const durationError = validateDuration(
                    spotifyRequest.durationSeconds,
                    spotifyRequest.requestType,
                    MAX_DONATION_DURATION_SECONDS,
                    MAX_CHANNEL_POINT_DURATION_SECONDS
                );
                if (durationError) {
                    console.log(chalk.yellow(`[Queue] Channel Point (Spotify URL) request duration (${spotifyRequest.durationSeconds}s) exceeds limit (${durationError.limit}s) - rejecting "${spotifyRequest.title}"`));
                    sendChatMessage(`@${userName} ${durationError.message} https://calamarigoldrequests.com/`);
                    return;
                }

                const blacklistMatch = checkBlacklist(spotifyRequest.title, spotifyRequest.artist, state.blacklist);
                if (blacklistMatch) {
                    console.log(chalk.yellow(`[Blacklist] Item matching term "${blacklistMatch.term}" (type: ${blacklistMatch.type}) found for "${spotifyRequest.title}" by ${spotifyRequest.artist} - rejecting`));
                    let blacklistMessage = `@${userName}, sorry, your request for "${spotifyRequest.title}"`;
                    if (blacklistMatch.type === 'artist') {
                        blacklistMessage += ` by "${spotifyRequest.artist}"`;
                    }
                    blacklistMessage += ` is currently blacklisted.`;
                    sendChatMessage(blacklistMessage + ' https://calamarigoldrequests.com/');
                    return;
                }
                 // *** End Validations ***

                // Add to queue
                const position = addSongToQueue(spotifyRequest);
                const queuePosition = position + 1;

                // Emit updates
                io.emit('newSongRequest', spotifyRequest);
                io.emit('queueUpdate', state.queue);

                console.log(chalk.green(`[Queue] Added Spotify song (from URL) "${spotifyRequest.title}" by ${spotifyRequest.artist}. Type: channelPoint. Requester: ${spotifyRequest.requester}. Position: #${queuePosition}`));

                // Send success message
                sendChatMessage(`@${userName} Your request for "${spotifyRequest.title}" by ${spotifyRequest.artist} (from Spotify link) is #${queuePosition} in the queue. https://calamarigoldrequests.com/`);
            } else {
                 console.log(chalk.yellow(`[Spotify] Could not find track details for Spotify URL: ${analysisResult.value}`));
                sendChatMessage(`@${userName}, I couldn't find the song details for the Spotify link you provided. https://calamarigoldrequests.com/`);
            }
        } catch (error) {
            console.error(chalk.red('[Spotify] Error processing Spotify URL redemption:'), error);
            sendChatMessage(`@${userName}, there was an error processing the Spotify link. https://calamarigoldrequests.com/`);
        }
      } else if (analysisResult.type === 'text') {
        // Process as a text-based song request (Existing Logic)
        const searchQuery = analysisResult.value;
        try {
          console.log(chalk.blue(`[Spotify] Searching for song based on text: "${searchQuery}"`));
          const spotifyTrack = await spotify.findSpotifyTrackBySearchQuery(searchQuery);

          if (spotifyTrack) {
            // Create a song request based on Spotify data
            const spotifyRequest = await createSpotifyBasedRequest(spotifyTrack, initialRequestData);

            // Check for user queue limit
            const existingRequest = state.queue.find(song => song.requesterLogin?.toLowerCase() === userName.toLowerCase() || song.requester.toLowerCase() === userName.toLowerCase());
            if (existingRequest) {
              console.log(chalk.yellow(`[Queue] User ${userName} already has a song in the queue - rejecting channel point request`));
              sendChatMessage(`@${userName}, you already have a song in the queue. Please wait for it to play. https://calamarigoldrequests.com/`);
              return;
            }

            // Check duration using the helper and values from .env
            const durationError = validateDuration(
                spotifyRequest.durationSeconds,
                spotifyRequest.requestType,
                MAX_DONATION_DURATION_SECONDS,
                MAX_CHANNEL_POINT_DURATION_SECONDS
            );
            if (durationError) {
              console.log(chalk.yellow(`[Queue] Channel Point (text) request duration (${spotifyRequest.durationSeconds}s) exceeds limit (${durationError.limit}s) - rejecting "${spotifyRequest.title}"`));
              sendChatMessage(`@${userName} ${durationError.message} https://calamarigoldrequests.com/`);
              return;
            }

            // Check blacklist using the helper
            const blacklistMatch = checkBlacklist(spotifyRequest.title, spotifyRequest.artist, state.blacklist);
            if (blacklistMatch) {
                console.log(chalk.yellow(`[Blacklist] Item matching term "${blacklistMatch.term}" (type: ${blacklistMatch.type}) found for "${spotifyRequest.title}" by ${spotifyRequest.artist} - rejecting`));
                let blacklistMessage = `@${userName}, sorry, your request for "${spotifyRequest.title}"`;
                if (blacklistMatch.type === 'artist') {
                    blacklistMessage += ` by "${spotifyRequest.artist}"`;
                }
                blacklistMessage += ` is currently blacklisted.`;
                sendChatMessage(blacklistMessage + ' https://calamarigoldrequests.com/');
                return;
            }

            // Add to queue
            const position = addSongToQueue(spotifyRequest);
            const queuePosition = position + 1; // Convert to 1-indexed for user-facing messages

            // Emit updates
            io.emit('newSongRequest', spotifyRequest);
            io.emit('queueUpdate', state.queue);

            console.log(chalk.green(`[Queue] Added Spotify song (from text) "${spotifyRequest.title}" by ${spotifyRequest.artist}. Type: channelPoint. Requester: ${spotifyRequest.requester}. Position: #${queuePosition}`));

            // Send success message
            sendChatMessage(`@${userName} Your request for "${spotifyRequest.title}" by ${spotifyRequest.artist} is #${queuePosition} in the queue. https://calamarigoldrequests.com/`);
          } else {
            console.log(chalk.yellow(`[Spotify] No track found for query: "${searchQuery}"`));
            sendChatMessage(`@${userName} I couldn't find a song matching "${searchQuery}". Try again or use a YouTube/Spotify link. https://calamarigoldrequests.com/`);
          }
        } catch (error) {
          console.error(chalk.red('[Spotify] Error processing text-based redemption:'), error);
          sendChatMessage(`@${userName} There was an error finding your requested song. Please try again with a YouTube/Spotify link. https://calamarigoldrequests.com/`);
        }
      }
    } catch (error) {
      console.error(chalk.red('[StreamElements] Error processing redemption:'), error);
    }
  };

  // Connect to StreamElements using the modular approach
  connectToStreamElements(streamElementsConfig, onTipCallback, onRedemptionCallback);
  
  console.log(chalk.blue('[Server] Initializing HTTP listener...')); // Added detailed logging
  // Use the custom HTTP server for listening
  // Explicitly bind to 0.0.0.0 to allow access from all interfaces
  httpServer.listen(SOCKET_PORT, '0.0.0.0', async () => {
      console.log(chalk.green(`🚀 Backend Socket.IO server listening on 0.0.0.0:${SOCKET_PORT}`))
      console.log(chalk.blue(`   HTTP Server address: ${JSON.stringify(httpServer.address())}`))
      console.log(chalk.blue("   Initializing subsystems..."));
  })
}

// Function to gracefully shutdown and save state
function shutdown(signal) {
  console.log(chalk.yellow(`Received ${signal}. Shutting down server...`));
  
  try {
    // Close Socket.IO connections
    if (io) {
      console.log(chalk.blue('[Socket.IO] Closing Socket.IO connections...'));
      io.close();
    }
    
    // Disconnect from Twitch
    console.log(chalk.blue('[Twitch] Disconnecting from Twitch chat...'));
    const twitchDisconnected = require('./twitch').disconnectFromTwitch();
    
    // Disconnect from StreamElements
    console.log(chalk.blue('[StreamElements] Disconnecting from StreamElements...'));
    disconnectFromStreamElements();
    
    // Close database connection
    console.log(chalk.blue('[Database] Closing database connection...'));
    db.closeDatabase();
    
    console.log(chalk.green('✅ Server shutdown complete.'));
  } catch (error) {
    console.error(chalk.red('Error during shutdown:'), error);
  }
  
  // Exit process after a short delay to allow logs to be written
  setTimeout(() => process.exit(0), 500);
}

// Listen for termination signals
process.on('SIGINT', () => shutdown('SIGINT')); // Ctrl+C
process.on('SIGTERM', () => shutdown('SIGTERM')); // kill command
process.on('exit', () => { 
  // Ensure DB connection is closed on any exit
  db.closeDatabase();
});

startServer();

// Centralized function to validate and add song requests (from both YouTube URLs and Spotify searches)
async function validateAndAddSong(request, bypassRestrictions = false) {

  // Validate essential request data
  if (!request || !request.requester || !request.requestType) {
      console.error(chalk.red('[Queue] Invalid song request object received:'), request);
      return; // Cannot proceed
  }
  if (!request.youtubeUrl && !request.message) {
      console.error(chalk.red(`[Queue] Request from ${request.requester} has no URL or search message.`));
      return; // Cannot proceed
  }

  const userName = request.requester; // Use the requester name from the initial request object

  // 1. Check if requester is blocked
  if (!bypassRestrictions && state.blockedUsers.some(user => user.username.toLowerCase() === userName.toLowerCase())) {
      console.log(chalk.yellow(`[Queue] User ${userName} is blocked - rejecting request.`));
      sendChatMessage(`@${userName}, you are currently blocked from making song requests. https://calamarigoldrequests.com/`);
      return; // Stop processing
  }

  // 2. Check user queue limit for channel points
  if (!bypassRestrictions && request.requestType === 'channelPoint') {
      const existingRequest = state.queue.find(song => song.requesterLogin?.toLowerCase() === userName.toLowerCase() || song.requester.toLowerCase() === userName.toLowerCase());
      if (existingRequest) {
          console.log(chalk.yellow(`[Queue] User ${userName} already has a song in the queue - rejecting channel point request.`));
          sendChatMessage(`@${userName}, you already have a song in the queue. Please wait for it to play. https://calamarigoldrequests.com/`);
          return; // Stop processing
      }
  }

  let videoDetails;
  let songTitle;
  let songArtist;
  let durationSeconds;
  let youtubeId = null;
  let spotifyMatch = null;

  // 3. Fetch details (YouTube or Spotify)
  try {
      if (request.youtubeUrl) {
          youtubeId = extractVideoId(request.youtubeUrl);
          if (!youtubeId) {
              console.error(chalk.red(`[YouTube] Failed to extract video ID from URL: ${request.youtubeUrl}`));
              sendChatMessage(`@${userName}, couldn't process the YouTube link. Please make sure it's a valid video URL. https://calamarigoldrequests.com/`);
              return;
          }
          videoDetails = await fetchYouTubeDetails(youtubeId);
          if (!videoDetails) {
              sendChatMessage(`@${userName}, couldn't fetch details for that YouTube video. https://calamarigoldrequests.com/`);
              return;
          }

          // Attempt Spotify match for YouTube URL
          console.log(chalk.blue(`[Spotify] Attempting to find Spotify equivalent for YouTube: "${videoDetails.title}" by ${videoDetails.channelTitle}`));
          spotifyMatch = await spotify.getSpotifyEquivalent({
              title: videoDetails.title,
              artist: videoDetails.channelTitle, // Use channel title as initial artist guess
              durationSeconds: videoDetails.durationSeconds
          });

          if (spotifyMatch) {
              console.log(chalk.green(`[Spotify] Found confident match: "${spotifyMatch.name}" by ${spotifyMatch.artists.map(a => a.name).join(', ')}`));
              songTitle = spotifyMatch.name;
              // Use only the first artist's name
              songArtist = spotifyMatch.artists && spotifyMatch.artists.length > 0 
                ? spotifyMatch.artists[0].name 
                : 'Unknown Artist'; 
              durationSeconds = Math.round(spotifyMatch.durationMs / 1000); // Use Spotify duration
          } else {
              console.log(chalk.yellow(`[Spotify] No confident match found. Using YouTube details.`));
              songTitle = videoDetails.title;
              songArtist = videoDetails.channelTitle; // Fallback to YouTube channel title
              durationSeconds = videoDetails.durationSeconds;
          }

      } else if (request.message) {
          // Handle Spotify URL from Admin or Text Search from StreamElements
          let isSpotifyUrlFromAdmin = false;
          // Use the broader check for Spotify URLs to handle international links
          if (request.message.includes('open.spotify.com/') && request.message.includes('track/') && !request.title) {
               // Likely a Spotify URL added via Admin panel (message has URL, but no details yet)
               console.log(chalk.blue('[Queue] Detected Spotify URL in message field, attempting direct fetch...'));
               console.log(chalk.blue(`[Spotify] Processing URL: ${request.message}`));
               const trackId = extractSpotifyTrackId(request.message);
               if (!trackId) {
                   console.error(chalk.red(`[Spotify] Failed to extract track ID from URL: ${request.message}`));
                   // Maybe send an error back to admin via socket if possible?
                   return; // Cannot proceed without ID
               }
               console.log(chalk.blue(`[Spotify] Successfully extracted track ID: ${trackId}`));
               
               const spotifyDetails = await getSpotifyTrackDetailsById(trackId);
               if (!spotifyDetails) {
                   console.error(chalk.red(`[Spotify] Failed to fetch details for Spotify track ID: ${trackId}`));
                   // Maybe send an error back to admin via socket if possible?
                   return; // Cannot proceed without details
               }
               console.log(chalk.green(`[Spotify] Successfully fetched details for admin-added URL: "${spotifyDetails.name}"`));
               songTitle = spotifyDetails.name;
               songArtist = spotifyDetails.artists?.map(a => a.name).join(', ') || 'Unknown Artist';
               durationSeconds = Math.round(spotifyDetails.durationMs / 1000);
               spotifyMatch = spotifyDetails; // Store the fetched details
               // Need to get thumbnailUrl here as well
               videoDetails = { thumbnailUrl: spotifyMatch?.album?.images?.[0]?.url || null }; // Use a placeholder videoDetails for thumbnail
               isSpotifyUrlFromAdmin = true;
          }
          
          // If it wasn't a Spotify URL from admin, check if details are already populated (StreamElements text search flow)
          if (!isSpotifyUrlFromAdmin) {
               if (!request.title || !request.artist || !request.durationSeconds) {
                    console.error(chalk.red(`[Queue] validateAndAddSong received request via message field without pre-filled details and it wasn't a Spotify URL. Cannot proceed. Request:`, request));
                    // Send chat message only if not from admin source (avoid double messages)
                    if (request.source !== 'socket' && request.source !== 'admin') { 
                         sendChatMessage(`@${userName}, there was an internal error processing your text-based request. https://calamarigoldrequests.com/`);
                    }
                    return;
               }
               // If details ARE present, assume they came from createSpotifyBasedRequest (SE text search)
               console.log(chalk.blue(`[Queue] Using pre-filled details for request from message: ${request.title}`));
               songTitle = request.title;
               songArtist = request.artist;
               durationSeconds = request.durationSeconds;
               spotifyMatch = request.spotifyData; // Assume it was populated earlier
               videoDetails = { thumbnailUrl: spotifyMatch?.album?.images?.[0]?.url || null }; // Use a placeholder videoDetails for thumbnail
          }

      } else {
           console.error(chalk.red(`[Queue] validateAndAddSong called without youtubeUrl or message.`));
           return; // Should not happen
      }

  } catch (error) {
      console.error(chalk.red(`[Queue] Error fetching details for request from ${userName}:`), error);
      sendChatMessage(`@${userName}, there was an error processing your request. Please try again. https://calamarigoldrequests.com/`);
      return;
  }


  // 4. Validate Duration (using the already determined durationSeconds)
  const durationError = validateDuration(
      durationSeconds, 
      request.requestType, 
      MAX_DONATION_DURATION_SECONDS, 
      MAX_CHANNEL_POINT_DURATION_SECONDS
  );
  if (!bypassRestrictions && durationError) {
      console.log(chalk.yellow(`[Queue] Request duration (${durationSeconds}s) for "${songTitle}" exceeds limit (${durationError.limit}s) for type ${request.requestType} - rejecting`));
      sendChatMessage(`@${userName} ${durationError.message} https://calamarigoldrequests.com/`);
      return; // Stop processing this request
  }

  // 5. Check Blacklist (using the determined title and artist)
  const blacklistMatch = checkBlacklist(songTitle, songArtist, state.blacklist);
  if (!bypassRestrictions && blacklistMatch) {
      console.log(chalk.yellow(`[Blacklist] Item matching term "${blacklistMatch.term}" (type: ${blacklistMatch.type}) found for "${songTitle}" by ${songArtist} - rejecting`));
      let blacklistMessage = `@${userName}, sorry, your request for "${songTitle}"`;
      if (blacklistMatch.type === 'artist') {
          blacklistMessage += ` by "${songArtist}"`;
      }
      blacklistMessage += ` is currently blacklisted.`;
      sendChatMessage(blacklistMessage + ' https://calamarigoldrequests.com/');
      return; // Stop processing this request
  }


  // 6. Fetch Requester Info (Twitch Avatar/Login)
  let requesterInfo = {};
  try {
      requesterInfo = await getTwitchUser(userName);
  } catch (error) {
      console.warn(chalk.yellow(`[Twitch] Failed to fetch user info for ${userName}: ${error.message}`));
      // Continue without avatar/login if fetch fails
  }


  // 7. Create the final SongRequest object
  const finalSongRequest = {
      id: request.id || Date.now().toString(), // Reuse ID or generate
      youtubeUrl: request.youtubeUrl, // Keep original YouTube URL if provided
      youtubeId: youtubeId,
      title: songTitle,
      artist: songArtist,
      channelId: videoDetails?.channelId, // Only available for YouTube requests
      durationSeconds: durationSeconds,
      thumbnailUrl: spotifyMatch?.album?.images?.[0]?.url || videoDetails?.thumbnailUrl || null, // Prefer Spotify image
      requester: userName,
      requesterLogin: requesterInfo?.login || userName.toLowerCase(), 
      requesterAvatar: requesterInfo?.profile_image_url || null,
      requestType: request.requestType,
      donationInfo: request.donationInfo, // Include if it was a donation
      timestamp: request.timestamp || new Date().toISOString(),
      addedAt: new Date().toISOString(),
      spotifyData: spotifyMatch ? {
          id: spotifyMatch.id,
          name: spotifyMatch.name,
          artists: spotifyMatch.artists?.map(a => ({ name: a.name })) || [], // Only keep name
          album: spotifyMatch.album?.images?.[0] ? {
            images: [{ url: spotifyMatch.album.images[0].url }] // Only keep first image URL
          } : { images: [] },
          durationMs: spotifyMatch.durationMs,
          uri: spotifyMatch.uri,
          url: spotifyMatch.url
      } : null // Store null if no spotifyMatch found
  };


  // 8. Add to Queue
  const position = addSongToQueue(finalSongRequest); // This handles DB insertion and state update
  const queuePosition = position + 1; // 1-based for user messages

  // 9. Emit Updates & Send Chat Message
  io.emit('newSongRequest', finalSongRequest);
  io.emit('queueUpdate', state.queue);

  const requestSource = request.requestType === 'donation' ? `donation (${request.donationInfo?.amount} ${request.donationInfo?.currency})` : 'channel points';
  console.log(chalk.green(`[Queue] Added song "${finalSongRequest.title}" by ${finalSongRequest.artist}. Type: ${request.requestType}. Requester: ${userName}. Position: #${queuePosition}. Source: ${requestSource}`));

  let successMessage = `@${userName} `;
  if (request.requestType === 'donation') {
      successMessage += `Thanks for the ${request.donationInfo?.amount} ${request.donationInfo?.currency} donation! Your priority request for "${finalSongRequest.title}" by ${finalSongRequest.artist} is #${queuePosition} in the queue.`;
  } else {
      successMessage += `Your request for "${finalSongRequest.title}" by ${finalSongRequest.artist} is #${queuePosition} in the queue.`;
  }
  sendChatMessage(successMessage + ' https://calamarigoldrequests.com/');

}

// --- Function to create song request from Spotify data ---
async function createSpotifyBasedRequest(spotifyTrack, request) {
  try {
    if (!spotifyTrack || !request) {
      throw new Error('Invalid Spotify track or request data');
    }
    
    // Extract only the first artist name from Spotify track
    const artistName = spotifyTrack.artists && spotifyTrack.artists.length > 0 
      ? spotifyTrack.artists[0].name 
      : 'Unknown Artist';
    
    // Get album cover as thumbnail
    const thumbnailUrl = spotifyTrack.album.images && spotifyTrack.album.images.length > 0 
      ? spotifyTrack.album.images[0].url 
      : null;
    
    // Convert duration from ms to seconds
    const durationSeconds = Math.round(spotifyTrack.durationMs / 1000);
    
    // Get requester Twitch profile (same as validateAndAddSong)
    let requesterAvatar = 'https://static-cdn.jtvnw.net/user-default-pictures-uv/ebe4cd89-b4f4-4cd9-adac-2f30151b4209-profile_image-300x300.png';
    let requesterLogin = request.requester.toLowerCase();
    
    try {
        // Fetch Twitch profile for the requester (same as in validateAndAddSong)
        const twitchProfile = await getTwitchUser(request.requester);
        if (twitchProfile) {
            if (twitchProfile.profile_image_url) {
                requesterAvatar = twitchProfile.profile_image_url;
            } else {
                console.warn(chalk.yellow(`[Twitch API] Could not find Twitch avatar for ${request.requester}. Using placeholder.`));
            }
            if (twitchProfile.login) {
                requesterLogin = twitchProfile.login;
            } else {
                console.warn(chalk.yellow(`[Twitch API] Could not find Twitch login name for ${request.requester}. Using default.`));
            }
        } else {
            console.warn(chalk.yellow(`[Twitch API] Could not find Twitch profile for ${request.requester}. Using placeholders.`));
        }
    } catch (twitchError) {
        console.error(chalk.red(`[Twitch API] Error fetching Twitch profile for ${request.requester}:`), twitchError);
    }
    
    // Create the song request object
    const songRequest = {
      id: request.id || Date.now().toString(),
      // No YouTube URL for Spotify-only requests
      youtubeUrl: null,
      title: spotifyTrack.name,
      artist: artistName,
      // No channelId for Spotify-only requests
      channelId: null,
      durationSeconds: durationSeconds,
      requester: request.requester,
      requesterLogin: requesterLogin,
      requesterAvatar: requesterAvatar,
      thumbnailUrl: thumbnailUrl,
      requestType: request.requestType,
      // Ensure timestamp is set
      timestamp: request.timestamp || new Date().toISOString(),
      // For tracking source
      source: 'spotify_search',
      // Pass through donation info if present
      donationInfo: request.donationInfo || null,
      // Prune Spotify-specific fields before storing
      spotifyData: {
        id: spotifyTrack.id,
        uri: spotifyTrack.uri,
        name: spotifyTrack.name,
        artists: spotifyTrack.artists?.map(a => ({ name: a.name })) || [], // Only keep name
        album: spotifyTrack.album?.images?.[0] ? {
            images: [{ url: spotifyTrack.album.images[0].url }] // Only keep first image URL
          } : { images: [] },
        durationMs: spotifyTrack.durationMs,
        url: spotifyTrack.url
      }
    };
    
    return songRequest;
  } catch (error) {
    console.error(chalk.red('[Spotify] Error creating request from Spotify data:'), error);
    throw error;
  }
}

// Function to add a song to the queue
function addSongToQueue(song) {
  if (!song) {
    console.warn(chalk.yellow('[Queue] Attempted to add null/undefined song to queue'));
    return -1;
  }
  
  try {
    // Determine position based on priority (donations before channel points)
    // For the same priority type, newer songs go after existing ones of same type
    let insertIndex = 0;
    
    if (song.requestType === 'donation') {
      // Find the last donation entry in the queue (donations at the top)
      const lastDonationIndex = state.queue.findIndex(s => s.requestType !== 'donation');
      insertIndex = lastDonationIndex === -1 ? state.queue.length : lastDonationIndex;
    } else {
      // For channel points, add to the end
      insertIndex = state.queue.length;
    }
    
    // Insert the song at the calculated position
    state.queue.splice(insertIndex, 0, song);
    
    // Add to database
    db.addSongToDbQueue(song);
    
    return insertIndex; // Return the position where it was added (0-indexed)
  } catch (error) {
    console.error(chalk.red('[Queue] Error adding song to queue:'), error);
    return -1;
  }
}

// --- NEW HELPER FUNCTIONS for Song Control ---

/**
 * Marks the currently active song as finished, moves it to history, and emits updates.
 * Does NOT automatically play the next song.
 * @returns {SongRequest | null} The song that was finished, or null if no active song.
 */
function handleMarkSongAsFinished() {
    if (!state.activeSong) {
        console.log(chalk.grey('[Control] No active song to mark as finished.'));
        return null;
    }

    const finishedSong = { ...state.activeSong, completedAt: new Date().toISOString() };
    console.log(chalk.blue(`[Control] Marking song as finished: "${finishedSong.title}" requested by ${finishedSong.requester}`));

    // Add to history DB
    db.logCompletedSong(finishedSong);

    // Update state
    state.activeSong = null;
    const recentHistory = db.getRecentHistory(); // Get updated history

    // Clear active song from DB
    db.clearActiveSongFromDB();

    // Emit updates
    io.emit('songFinished', finishedSong); // Notify about the finished song
    io.emit('activeSong', null); // Explicitly send null for active song
    io.emit('historyUpdate', recentHistory); // Send updated history
    broadcastTotalCounts(); // Broadcast counts after marking song finished
    broadcastTodaysCount(); // NEW: Broadcast today's count

    return finishedSong;
}

/**
 * Skips the currently active song (moves to history) and plays the next song in the queue.
 * @returns {{ skippedSong: SongRequest | null, nextSong: SongRequest | null }} The skipped song and the next song started, or nulls if actions couldn't be performed.
 */
function handleSkipSong() {
    const skippedSong = handleMarkSongAsFinished(); // Mark current as finished first

    if (state.queue.length > 0) {
        const nextSong = state.queue.shift(); // Get the next song
        console.log(chalk.blue(`[Control] Skipping to next song: "${nextSong.title}" requested by ${nextSong.requester}`));

        // Update state
        state.activeSong = { ...nextSong, startedAt: new Date().toISOString() };

        // Update DB
        db.saveActiveSongToDB(state.activeSong);
        db.removeSongFromDbQueue(nextSong.id); // Remove from queue DB

        // Emit updates
        io.emit('activeSong', state.activeSong);
        io.emit('queueUpdate', state.queue);

        return { skippedSong, nextSong: state.activeSong };
    } else {
        console.log(chalk.grey('[Control] Queue is empty after finishing song, nothing to skip to.'));
        // Active song is already null from handleMarkSongAsFinished
        io.emit('queueUpdate', state.queue); // Still emit queue update (it's empty)
        return { skippedSong, nextSong: null };
    }
}

// --- END NEW HELPER FUNCTIONS ---

// --- NEW: Twitch Chat Command Listener ---
if (tmiClient) {
    tmiClient.on('message', (channel, tags, message, self) => {
        if (self) return; // Ignore messages from the bot itself

        const msg = message.trim().toLowerCase();
        const username = tags.username?.toLowerCase();

        if (!username) return; // Should not happen, but safety check

        // Check if the user is an admin
        const isAdmin = ADMIN_USERNAMES_LOWER.includes(username);

        if (isAdmin) {
            if (msg === '!finish') {
                console.log(chalk.cyan(`[Twitch Command] Received !finish from admin: ${username}`));
                const finishedSong = handleMarkSongAsFinished();
                if (finishedSong) {
                    //sendChatMessage(`Marked "${finishedSong.title}" as finished.`);
                } else {
                    sendChatMessage(`@${username}, there is no active song to mark as finished.`);
                }
            } else if (msg === '!next' || msg === '!skip') { // Allow !skip as alias
                console.log(chalk.cyan(`[Twitch Command] Received !next from admin: ${username}`));
                const { skippedSong, nextSong } = handleSkipSong();

                if (skippedSong && nextSong) {
                     sendChatMessage(`Finished "${skippedSong.title}". Now playing: "${nextSong.title}" by ${nextSong.artist}, requested by ${nextSong.requester}.`);
                } else if (skippedSong) { // Skipped but queue was empty
                     sendChatMessage(`Finished "${skippedSong.title}". Queue is now empty.`);
                } else if (nextSong) {
                    sendChatMessage(`Now playing: "${nextSong.title}" by ${nextSong.artist}, requested by ${nextSong.requester}.`);
                }
            }
        }
    });
} else {
     console.warn(chalk.yellow('[Twitch Command] TMI client not initialized, admin chat commands disabled.'));
}
// --- END NEW ---

// --- NEW: Helper to broadcast total counts ---
function broadcastTotalCounts() {
    try {
        const totalHistory = db.getTotalHistoryCount();
        const totalQueue = state.queue.length; // Queue count is from in-memory state
        io.emit('totalCountsUpdate', { history: totalHistory, queue: totalQueue });
    } catch (error) {
        console.error(chalk.red('[Counts] Error broadcasting total counts:'), error);
    }
}
// --- END NEW ---

// --- NEW: Helper to broadcast today's played count ---
function broadcastTodaysCount() {
    try {
        const todaysCount = db.getTodayHistoryCount();
        io.emit('todaysCountUpdate', { count: todaysCount });
    } catch (error) {
        console.error(chalk.red('[Counts] Error broadcasting today\'s count:'), error);
    }
}
// --- END NEW ---