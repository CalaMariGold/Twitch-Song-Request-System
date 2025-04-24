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
  analyzeRequestText,
  checkBlacklist,
  validateDuration
} = require('./helpers')
const { fetchYouTubeDetails } = require('./youtube')
const { 
  initTwitchChat, 
  sendChatMessage, 
  getTwitchUser 
} = require('./twitch')
const { connectToStreamElements, disconnectFromStreamElements } = require('./streamElements')
const spotify = require('./spotify')
require('dotenv').config()

const SOCKET_PORT = process.env.SOCKET_PORT ? parseInt(process.env.SOCKET_PORT, 10) : 3002
const httpServer = createServer()
const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'songRequestSystem.db');

// Determine allowed origins from environment variable
const allowedOriginsEnv = process.env.ALLOWED_ORIGINS || "http://localhost:3000,http://localhost:3001"; // Default for dev
const allowedOrigins = allowedOriginsEnv.split(',').map(origin => origin.trim());
console.log(chalk.blue(`[Config] Allowed CORS Origins: ${allowedOrigins.join(', ')}`))

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
initTwitchChat({
  TWITCH_BOT_USERNAME,
  TWITCH_BOT_OAUTH_TOKEN,
  TWITCH_CHANNEL_NAME
});

// Initialize database first, before we setup any routes or connections
db.initDatabase(dbPath);

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
    allowEIO3: true,
    cors: {
        // Allow connections from the frontend domain AND the internal proxy
        origin: "*", // Allow any origin - simpler for proxy scenarios
        methods: ["GET", "POST"],
        credentials: true
    }
})

// Socket.IO connection handling
io.on('connection', (socket) => {
    
    // Send initial state to newly connected client - fetch history from DB first
    let recentHistory = db.getRecentHistory();
    
    // Send initial state including fetched history
    socket.emit('initialState', {
        ...state,
        history: recentHistory // Include history from DB
    })
    
    // Handle explicit getState request
    socket.on('getState', () => {
       let recentHistory = db.getRecentHistory();
       // Send current state including recent history
       socket.emit('initialState', {
            ...state,
            history: recentHistory // Overwrite in-memory history with recent DB history
        });
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
    
    // Handle queue updates
    socket.on('updateQueue', (updatedQueue) => {
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
        console.log(chalk.magenta(`[Admin] Queue updated and DB re-synced via socket.`));
    })

    // Handle addSong event
    socket.on('addSong', async (songRequestData) => {
        // Ensure the incoming data has necessary fields before validating
        if (!songRequestData || (!songRequestData.youtubeUrl && !songRequestData.message) || !songRequestData.requester) { // Allow message for Spotify-only
             console.error(chalk.red('[Socket.IO] Received invalid song request data via socket:'), songRequestData);
             return;
        }
        // Extract bypass flag, default to false if not provided
        const bypass = songRequestData.bypassRestrictions === true;

        // Call the centralized validation and adding function, passing the bypass flag
        await validateAndAddSong({ ...songRequestData, source: 'socket' }, bypass);
    })

    // Handle remove song
    socket.on('removeSong', (songId) => {
        const songToRemove = state.queue.find(song => song.id === songId);
        if (songToRemove) {
            state.queue = state.queue.filter(song => song.id !== songId);
            db.removeSongFromDbQueue(songId); // Fixed: use songId not youtubeUrl
            io.emit('queueUpdate', state.queue);
            console.log(chalk.magenta(`[Admin] Song removed via socket: ${songId}`));
        } else {
            console.warn(chalk.yellow(`[Admin] Attempted to remove non-existent song ID: ${songId}`));
        }
    })

    // Handle clear queue
    socket.on('clearQueue', () => {
        state.queue = [];
        db.clearDbQueue(); // Clear DB
        io.emit('queueUpdate', state.queue);
        console.log(chalk.magenta(`[Admin] Queue cleared via socket.`));
    })

    socket.on('resetSystem', async () => {
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
        io.emit('historyUpdate', state.history)
        console.log(chalk.magenta('[Admin] System reset via socket.'));
    })

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
    socket.on('setMaxDuration', (minutes) => {
        state.settings = state.settings || {}
        state.settings.maxDuration = minutes
        db.saveSetting('maxDuration', minutes); // Save setting to DB
        io.emit('settingsUpdate', state.settings)
        console.log(chalk.magenta(`[Admin] Max Duration set to ${minutes} mins via socket.`));
    })

    // Handle active song updates
    socket.on('updateActiveSong', async (song) => {
        const previousSong = state.activeSong; // Store previous song

        if (song) {
            if (previousSong) { 
                 const previousSongWithTimestamp = { ...previousSong, completedAt: new Date().toISOString() };
                 const result = db.logCompletedSong(previousSongWithTimestamp); // Log previous song to DB
                 if (result) {
                     io.emit('songFinished', previousSong); // Emit event for clients
                     
                     // Fetch and emit updated history AFTER successful logging
                     const recentHistory = db.getRecentHistory();
                     io.emit('historyUpdate', recentHistory);
                     console.log(chalk.blue(`[History] Broadcast updated history (${recentHistory.length} items) after song completion.`));
                     
                     // Also update statistics
                     try {
                         const statistics = fetchAllTimeStats(db.getDb());
                         io.emit('allTimeStatsUpdate', statistics);
                         console.log(chalk.blue('[Statistics] Broadcast updated statistics after song completion.'));
                     } catch (statsError) {
                         console.error(chalk.red('[Statistics] Error refreshing statistics:'), statsError);
                     }
                 }
            }
            state.activeSong = song
            // Save the active song to the database
            db.saveActiveSongToDB(song);
            
            // Update queue and DB
            state.queue = state.queue.filter(queuedSong => queuedSong.id !== song.id);
            
            // THEN remove from DB queue
            db.removeSongFromDbQueue(song.id);
            console.log(chalk.yellow(`[Queue] Active song: "${song.title}" (Requester: ${song.requester}) - Removed from queue & DB.`));
        } else {
            // Song finished or stopped
            if (previousSong) {
                const previousSongWithTimestamp = { ...previousSong, completedAt: new Date().toISOString() };
                const result = db.logCompletedSong(previousSongWithTimestamp); // Log previous song to DB
                 if (result) {
                     io.emit('songFinished', previousSong); // Emit event for clients
                     
                     // Fetch and emit updated history AFTER successful logging
                     const recentHistory = db.getRecentHistory();
                     io.emit('historyUpdate', recentHistory);
                     console.log(chalk.blue(`[History] Broadcast updated history (${recentHistory.length} items) after song stopped/removed.`));
                     
                     // Also update statistics
                     try {
                         const statistics = fetchAllTimeStats(db.getDb());
                         io.emit('allTimeStatsUpdate', statistics);
                         console.log(chalk.blue('[Statistics] Broadcast updated statistics after song stopped/removed.'));
                     } catch (statsError) {
                         console.error(chalk.red('[Statistics] Error refreshing statistics:'), statsError);
                     }
                 }
            }
            if (previousSong) {
                console.log(chalk.yellow(`[Queue] Song finished/removed: "${previousSong.title}"`));
            }
            state.activeSong = null
            // Clear the active song from the database
            db.clearActiveSongFromDB();
        }
        
        // Broadcast updates
        io.emit('activeSong', state.activeSong)
        io.emit('queueUpdate', state.queue)
    })

    // Handle blacklist updates
    socket.on('updateBlacklist', (newBlacklist) => {
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
        console.log(chalk.magenta(`[Admin] Blacklist updated via socket (${state.blacklist.length} items). Added: ${addedItems.length}, Removed: ${removedItems.length}`));
    })

    // Handle blocked users
    socket.on('updateBlockedUsers', (newBlockedUsers) => {
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
        console.log(chalk.magenta(`[Admin] Blocked users updated via socket (${state.blockedUsers.length} users). Added: ${addedUsers.length}, Removed: ${removedUsers.length}`));
    })

    // Handle marking a song as finished (from admin)
    socket.on('markSongAsFinished', (song) => {
        if (!song) {
            console.error(chalk.red('[Admin] Attempted to mark null song as finished'));
            return;
        }
        
        // Add completedAt to song before logging
        const completedSong = { ...song, completedAt: new Date().toISOString() };

        // Move active song to history
        const result = db.logCompletedSong(completedSong);
        if (result) {
            // Clear active song
            state.activeSong = null;
            db.clearActiveSongFromDB();
            
            // Broadcast updates
            io.emit('activeSong', null);
            io.emit('songFinished', song);
            console.log(chalk.magenta(`[Admin] Song marked as finished: ${song.title}`));
            
            // Fetch and emit updated history AFTER successful logging
            const recentHistory = db.getRecentHistory();
            io.emit('historyUpdate', recentHistory);
            console.log(chalk.blue(`[History] Broadcast updated history (${recentHistory.length} items) after marking song finished.`));
            
            // Also update statistics
            try {
                const statistics = fetchAllTimeStats(db.getDb());
                io.emit('allTimeStatsUpdate', statistics);
                console.log(chalk.blue('[Statistics] Broadcast updated statistics after song completion.'));
            } catch (statsError) {
                console.error(chalk.red('[Statistics] Error refreshing statistics:'), statsError);
            }
        }
    });

    // Handle returning a song from history to the queue
    socket.on('returnToQueue', (song) => {
        if (!song) {
            console.warn(chalk.yellow('[Socket.IO] returnToQueue called with null/undefined song'));
            return;
        }

        console.log(chalk.magenta(`[Admin] Returning song "${song.title}" (ID: ${song.id}) to queue from history via socket.`));
        
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

        // Emit queue update to all clients
        io.emit('queueUpdate', state.queue);
    });

    // Add handler for clearing history
    socket.on('clearHistory', () => {
        const success = db.clearDbHistory();
        if (success) {
            // Send empty history to all clients
            io.emit('historyUpdate', []);
            console.log(chalk.magenta('[Admin] History cleared via socket.'));
            
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
    });

    // Add handler for deleting individual history items
    socket.on('deleteHistoryItem', (id) => {
        const success = db.deleteHistoryItem(id);
        if (success) {
            // Fetch and send updated history to all clients
            const recentHistory = db.getRecentHistory();
                io.emit('historyUpdate', recentHistory);
                console.log(chalk.magenta(`[Admin] History item ${id} deleted via socket.`));
                
                // After deleting history item, refresh and broadcast all-time stats
                try {
                const updatedStats = fetchAllTimeStats(db.getDb());
                    io.emit('allTimeStatsUpdate', updatedStats);
                    console.log(chalk.blue('[Statistics] Refreshed all-time stats after history item deletion'));
                } catch (error) {
                    console.error(chalk.red('[Statistics] Error refreshing stats after history deletion:'), error);
            }
        }
    });

    // Add handler for skipping a song
    socket.on('skipSong', () => {
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
        console.log(chalk.blue(`[History] Broadcast updated history (${recentHistory.length} items) after skipping song.`));

         // Also update statistics
         try {
            const statistics = fetchAllTimeStats(db.getDb());
            io.emit('allTimeStatsUpdate', statistics);
            console.log(chalk.blue('[Statistics] Broadcast updated statistics after song skip'));
        } catch (statsError) {
            console.error(chalk.red('[Statistics] Error refreshing statistics after skip:'), statsError);
        }

        console.log(chalk.magenta(`[Admin] Song skipped. New active song: ${nextSong ? nextSong.title : 'None'}`));
    });

    socket.on('disconnect', () => {
        
    })
})

// Start the server and load initial data
async function startServer() {
  const loadedState = db.loadInitialState();
  state.queue = loadedState.queue;
  state.settings = { ...state.settings, ...loadedState.settings }; // Merge defaults with loaded
  state.blacklist = loadedState.blacklist;
  state.blockedUsers = loadedState.blockedUsers;
  state.activeSong = loadedState.activeSong; // Set the activeSong state from loaded data

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

      // Check for a YouTube URL or text-based request
      const { isYouTubeUrl, youtubeUrl, searchQuery } = analyzeRequestText(message);

      // Minimum donation amount ($3)
      const MIN_DONATION_AMOUNT = 3;
      if (amount < MIN_DONATION_AMOUNT) {
          console.log(chalk.yellow(`[StreamElements] Donation from ${userName} (${amount} ${currency}) below minimum (${MIN_DONATION_AMOUNT} ${currency}). Skipping request.`));
          sendChatMessage(`Thanks @${userName} for the ${amount} ${currency} donation! Song requests require a minimum donation of ${MIN_DONATION_AMOUNT} ${currency}.`);
          return;
      }

      // If no YouTube URL or search query, thank them for the donation but don't process as song request
      if (!isYouTubeUrl && !searchQuery) {
          console.warn(chalk.yellow(`[StreamElements] No YouTube URL or song query found in donation from ${userName}: "${message}"`));
          sendChatMessage(`Thanks @${userName} for the ${amount} ${currency}! If you want to request a song with your dono next time, put either a YouTube link or song name in the dono message.`);
          return;
      }

      // Create song request from donation
      const songRequest = {
          id: tipData.id || Date.now().toString(),
          youtubeUrl: youtubeUrl, // This will be null for text-based requests
          requester: userName,
          timestamp: tipData.timestamp || new Date().toISOString(),
          requestType: 'donation',
          donationInfo: {
              amount: amount,
              currency: currency
          },
          message: searchQuery // Store the search query for text-based requests
      };

      if (isYouTubeUrl) {
        // Process as a YouTube URL request
        await validateAndAddSong(songRequest);
      } else {
        // Process as a text-based song request
        try {
          console.log(chalk.blue(`[Spotify] Searching for song based on text: "${searchQuery}"`));
          const spotifyTrack = await spotify.findSpotifyTrackBySearchQuery(searchQuery);

          if (spotifyTrack) {
            // Create a song request based on Spotify data
            const spotifyRequest = await createSpotifyBasedRequest(spotifyTrack, songRequest);

            // Check duration using the helper and values from .env
            const durationError = validateDuration(
                spotifyRequest.durationSeconds, 
                spotifyRequest.requestType, 
                MAX_DONATION_DURATION_SECONDS, 
                MAX_CHANNEL_POINT_DURATION_SECONDS
            );
            if (durationError) {
              console.log(chalk.yellow(`[Queue] Donation request duration (${spotifyRequest.durationSeconds}s) exceeds limit (${durationError.limit}s) - rejecting "${spotifyRequest.title}"`));
              sendChatMessage(`@${userName} ${durationError.message}`);
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
                sendChatMessage(blacklistMessage);
                return;
            }

            // Add to queue
            const position = addSongToQueue(spotifyRequest);
            const queuePosition = position + 1; // Convert to 1-indexed for user-facing messages

            // Emit updates
            io.emit('newSongRequest', spotifyRequest);
            io.emit('queueUpdate', state.queue);

            console.log(chalk.green(`[Queue] Added Spotify song "${spotifyRequest.title}" by ${spotifyRequest.artist}. Type: donation. Requester: ${spotifyRequest.requester}. Position: #${queuePosition}`));

            // Send success message
            sendChatMessage(`@${userName} Thanks for the ${amount} ${currency} donation! Your priority request for "${spotifyRequest.title}" by ${spotifyRequest.artist} is #${queuePosition} in the queue.`);
          } else {
            console.log(chalk.yellow(`[Spotify] No track found for query: "${searchQuery}"`));
            sendChatMessage(`@${userName} Thanks for the ${amount} ${currency} donation! I couldn't find a song matching "${searchQuery}". Try a different search or a YouTube link next time.`);
          }
        } catch (error) {
          console.error(chalk.red('[Spotify] Error processing text-based request:'), error);
          sendChatMessage(`@${userName} Thanks for the ${amount} ${currency} donation! There was an error finding your requested song. Please try again with a YouTube link.`);
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

      // Check for a YouTube URL or text-based request
      const { isYouTubeUrl, youtubeUrl, searchQuery } = analyzeRequestText(userInput);

      // If no YouTube URL or search query, reject the request
      if (!isYouTubeUrl && !searchQuery) {
        console.warn(chalk.yellow(`[StreamElements] No YouTube URL or song query found in redemption from ${userName}`));
        sendChatMessage(`@${userName}, you need to include either a YouTube link or song name in your request.`);
        return;
      }

      // Create song request from channel point redemption
      const songRequest = {
        id: redemptionData.id || Date.now().toString(),
        youtubeUrl: youtubeUrl, // This will be null for text-based requests
        requester: userName,
        timestamp: redemptionData.timestamp || new Date().toISOString(),
        requestType: 'channelPoint',
        source: 'streamelements_redemption',
        message: searchQuery // Store the search query for text-based requests
      };

      if (isYouTubeUrl) {
        // Process as a YouTube URL request
        // Duration and blacklist validation happens inside validateAndAddSong
        await validateAndAddSong(songRequest);
      } else {
        // Process as a text-based song request
        try {
          console.log(chalk.blue(`[Spotify] Searching for song based on text: "${searchQuery}"`));
          const spotifyTrack = await spotify.findSpotifyTrackBySearchQuery(searchQuery);

          if (spotifyTrack) {
            // Create a song request based on Spotify data
            const spotifyRequest = await createSpotifyBasedRequest(spotifyTrack, songRequest);

            // Check for user queue limit
            const existingRequest = state.queue.find(song => song.requesterLogin?.toLowerCase() === userName.toLowerCase() || song.requester.toLowerCase() === userName.toLowerCase());
            if (existingRequest) {
              console.log(chalk.yellow(`[Queue] User ${userName} already has a song in the queue - rejecting channel point request`));
              sendChatMessage(`@${userName}, you already have a song in the queue. Please wait for it to play.`);
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
              console.log(chalk.yellow(`[Queue] Channel Point request duration (${spotifyRequest.durationSeconds}s) exceeds limit (${durationError.limit}s) - rejecting "${spotifyRequest.title}"`));
              sendChatMessage(`@${userName} ${durationError.message}`);
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
                sendChatMessage(blacklistMessage);
                return;
            }

            // Add to queue
            const position = addSongToQueue(spotifyRequest);
            const queuePosition = position + 1; // Convert to 1-indexed for user-facing messages

            // Emit updates
            io.emit('newSongRequest', spotifyRequest);
            io.emit('queueUpdate', state.queue);

            console.log(chalk.green(`[Queue] Added Spotify song "${spotifyRequest.title}" by ${spotifyRequest.artist}. Type: channelPoint. Requester: ${spotifyRequest.requester}. Position: #${queuePosition}`));

            // Send success message
            sendChatMessage(`@${userName} Your request for "${spotifyRequest.title}" by ${spotifyRequest.artist} is #${queuePosition} in the queue.`);
          } else {
            console.log(chalk.yellow(`[Spotify] No track found for query: "${searchQuery}"`));
            sendChatMessage(`@${userName} I couldn't find a song matching "${searchQuery}". Try again or use a YouTube link.`);
          }
        } catch (error) {
          console.error(chalk.red('[Spotify] Error processing text-based request:'), error);
          sendChatMessage(`@${userName} There was an error finding your requested song. Please try again with a YouTube link.`);
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
      sendChatMessage(`@${userName}, you are currently blocked from making song requests.`);
      return; // Stop processing
  }

  // 2. Check user queue limit for channel points
  if (!bypassRestrictions && request.requestType === 'channelPoint') {
      const existingRequest = state.queue.find(song => song.requesterLogin?.toLowerCase() === userName.toLowerCase() || song.requester.toLowerCase() === userName.toLowerCase());
      if (existingRequest) {
          console.log(chalk.yellow(`[Queue] User ${userName} already has a song in the queue - rejecting channel point request.`));
          sendChatMessage(`@${userName}, you already have a song in the queue. Please wait for it to play.`);
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
              sendChatMessage(`@${userName}, couldn't process the YouTube link. Please make sure it's a valid video URL.`);
              return;
          }
          videoDetails = await fetchYouTubeDetails(youtubeId);
          if (!videoDetails) {
              sendChatMessage(`@${userName}, couldn't fetch details for that YouTube video.`);
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
              songArtist = spotifyMatch.artists.map(a => a.name).join(', '); // Use Spotify artist(s)
              durationSeconds = Math.round(spotifyMatch.durationMs / 1000); // Use Spotify duration
          } else {
              console.log(chalk.yellow(`[Spotify] No confident match found. Using YouTube details.`));
              songTitle = videoDetails.title;
              songArtist = videoDetails.channelTitle; // Fallback to YouTube channel title
              durationSeconds = videoDetails.durationSeconds;
          }

      } else if (request.message) {
          // This case should theoretically be handled by the calling functions (onTip/onRedemption)
          // which call createSpotifyBasedRequest -> validateAndAddSong, but we add a safeguard.
          console.warn(chalk.yellow(`[Queue] validateAndAddSong called with message but no youtubeUrl. This indicates a Spotify-based request was likely intended.`));
          // If we reach here, it implies createSpotifyBasedRequest should have been called first.
          // We'll assume the request object *already* has Spotify details populated by createSpotifyBasedRequest.
          if (!request.title || !request.artist || !request.durationSeconds) {
               console.error(chalk.red(`[Queue] validateAndAddSong received text-based request without pre-filled Spotify details. Cannot proceed.`));
               sendChatMessage(`@${userName}, there was an internal error processing your text-based request.`);
               return;
          }
          songTitle = request.title;
          songArtist = request.artist;
          durationSeconds = request.durationSeconds;
          spotifyMatch = request.spotifyData; // Assume it was populated earlier

      } else {
           console.error(chalk.red(`[Queue] validateAndAddSong called without youtubeUrl or message.`));
           return; // Should not happen
      }

  } catch (error) {
      console.error(chalk.red(`[Queue] Error fetching details for request from ${userName}:`), error);
      sendChatMessage(`@${userName}, there was an error processing your request. Please try again.`);
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
      sendChatMessage(`@${userName} ${durationError.message}`);
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
      sendChatMessage(blacklistMessage);
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
      spotifyData: spotifyMatch // Store Spotify match data if found
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
  sendChatMessage(successMessage);

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
      // Add Spotify-specific fields
      spotifyData: {
        id: spotifyTrack.id,
        name: spotifyTrack.name,
        artists: spotifyTrack.artists,
        uri: spotifyTrack.uri,
        externalUrl: spotifyTrack.externalUrl,
        previewUrl: spotifyTrack.previewUrl,
        albumName: spotifyTrack.album.name,
        albumImages: spotifyTrack.album.images
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