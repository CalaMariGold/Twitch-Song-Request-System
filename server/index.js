const { createServer } = require('http')
const { Server } = require('socket.io')
const fetch = require('node-fetch')
const chalk = require('chalk')
const path = require('path')
const { fetchAllTimeStats } = require('./statistics')
const db = require('./database')
const { 
  formatDurationFromSeconds,
  parseIsoDuration,
  formatDuration,
  extractVideoId,
  extractYouTubeUrlFromText 
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

const SOCKET_PORT = 3002
const httpServer = createServer()
const dbPath = path.join(__dirname, '..', 'data', 'songRequestSystem.db');


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
db.initDatabase();

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
        origin: ["http://localhost:3000", "http://localhost:3001"],
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
        if (!songRequestData || !songRequestData.youtubeUrl || !songRequestData.requester) {
             console.error(chalk.red('[Socket.IO] Received invalid song request data via socket:'), songRequestData);
             return;
        }
        // Call the centralized validation and adding function
        await validateAndAddSong({ ...songRequestData, source: 'socket' });
    })

    // Handle remove song
    socket.on('removeSong', (songId) => {
        const songToRemove = state.queue.find(song => song.id === songId);
        if (songToRemove) {
            state.queue = state.queue.filter(song => song.id !== songId);
            db.removeSongFromDbQueue(songToRemove.youtubeUrl); // Remove from DB
            io.emit('queueUpdate', state.queue);
            console.log(chalk.magenta(`[Admin] Song removed via socket: ${songId} (URL: ${songToRemove.youtubeUrl})`));
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
            if (previousSong) { // No need to check history array anymore, just log if previous existed
                 const result = db.logCompletedSong(previousSong); // Log previous song to DB
                 if (result) {
                     io.emit('songFinished', previousSong); // Emit event for clients
                     
                     // Check if result has history array (new format) or is boolean (old format)
                     if (typeof result === 'object' && result.history) {
                         io.emit('historyUpdate', result.history);
                         console.log(chalk.blue(`[Database] Emitted historyUpdate with ${result.history.length} items after song completion.`));
                         
                         // Also emit stats if available
                         try {
                             const statistics = fetchAllTimeStats(db.getDb());
                             io.emit('allTimeStatsUpdate', statistics);
                             console.log(chalk.blue('[Statistics] Broadcast updated statistics after song completion'));
                         } catch (statsError) {
                             console.error(chalk.red('[Statistics] Error refreshing statistics:'), statsError);
                         }
                     } else {
                         // Fallback to fetching history (should not happen with updated code)
                         const recentHistory = db.getRecentHistory();
                             io.emit('historyUpdate', recentHistory);
                             console.log(chalk.blue(`[Database] Emitted historyUpdate with ${recentHistory.length} items after song completion (fallback).`));
                     }
                 }
            }
            state.activeSong = song
            // Save the active song to the database
            db.saveActiveSongToDB(song);
            
            // Remove song from IN-MEMORY queue first
            const queueBeforeFilterLength = state.queue.length;
            state.queue = state.queue.filter(s => s.id !== song.id);
            const queueAfterFilterLength = state.queue.length;
            if (queueBeforeFilterLength === queueAfterFilterLength) {
            }
            // THEN remove from DB queue
            db.removeSongFromDbQueue(song.youtubeUrl);
            console.log(chalk.yellow(`[Queue] Active song: "${song.title}" (Requester: ${song.requester}) - Removed from queue & DB.`));
        } else {
            // Song finished or stopped
            if (previousSong) { // Log previous song if it existed
                const result = db.logCompletedSong(previousSong); // Log previous song to DB
                 if (result) {
                     io.emit('songFinished', previousSong); // Emit event for clients
                     
                     // Check if result has history array (new format) or is boolean (old format)
                     if (typeof result === 'object' && result.history) {
                         io.emit('historyUpdate', result.history);
                         console.log(chalk.blue(`[Database] Emitted historyUpdate with ${result.history.length} items after song completion.`));
                         
                         // Also emit stats if available
                         try {
                             const statistics = fetchAllTimeStats(db.getDb());
                             io.emit('allTimeStatsUpdate', statistics);
                             console.log(chalk.blue('[Statistics] Broadcast updated statistics after song completion'));
                         } catch (statsError) {
                             console.error(chalk.red('[Statistics] Error refreshing statistics:'), statsError);
                         }
                     } else {
                         // Fallback to fetching history (should not happen with updated code)
                         const recentHistory = db.getRecentHistory();
                             io.emit('historyUpdate', recentHistory);
                             console.log(chalk.blue(`[Database] Emitted historyUpdate with ${recentHistory.length} items after song completion (fallback).`));
                     }
                 }
            }
            if (previousSong) { // Only log console message if there *was* a song playing
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

        addedItems.forEach(item => db.addBlacklistPattern(item.term, item.type));
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

        addedUsers.forEach(user => db.addBlockedUser(user.username));
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
        
        // Move active song to history
        const result = db.logCompletedSong(song); // Log to history DB
        if (result) {
            // Clear active song
            state.activeSong = null;
            db.clearActiveSongFromDB();
            
            // Broadcast updates
            io.emit('activeSong', null);
            io.emit('songFinished', song);
            console.log(chalk.magenta(`[Admin] Song marked as finished: ${song.title}`));
            
            // Update history for all clients
            if (typeof result === 'object' && result.history) {
                io.emit('historyUpdate', result.history);
            } else {
                // Fallback to fetching history
                const recentHistory = db.getRecentHistory();
                    io.emit('historyUpdate', recentHistory);
            }
            
            // Also update statistics
            try {
                const statistics = fetchAllTimeStats(db.getDb());
                io.emit('allTimeStatsUpdate', statistics);
                console.log(chalk.blue('[Statistics] Broadcast updated statistics after song completion'));
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
        const newSong = {
            ...song,
            id: Date.now().toString(), // Generate a new ID
            timestamp: new Date().toISOString(), // Update timestamp to now
            requestType: song.requestType,
            source: 'history_requeue'
        };

        // Add to the beginning of the queue
        state.queue.unshift(newSong);
        
        // Add to DB queue
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
      
      // Extract YouTube URL from donation message
      const youtubeUrl = extractYouTubeUrlFromText(message);

      // If no YouTube URL, thank them for the donation but don't process as song request
      if (!youtubeUrl) {
          console.warn(chalk.yellow(`[StreamElements] No YouTube URL found in donation from ${userName}: "${message}"`));
          sendChatMessage(`Thanks @${userName} for the ${amount} ${currency}! If you want to request a song with your dono next time, put the YouTube link in the dono message.`);
          return;
      }
      
      // Now that we found a YouTube link, check minimum donation amount ($3)
      const MIN_DONATION_AMOUNT = 3;
      if (amount < MIN_DONATION_AMOUNT) {
          console.log(chalk.yellow(`[StreamElements] Donation from ${userName} (${amount} ${currency}) below minimum (${MIN_DONATION_AMOUNT} ${currency}). Skipping request.`));
          sendChatMessage(`Thanks @${userName} for the ${amount} ${currency} donation! Song requests require a minimum donation of ${MIN_DONATION_AMOUNT} ${currency}.`);
          return;
      }

      // Create song request from donation
      const songRequest = {
          id: tipData.id || Date.now().toString(),
          youtubeUrl: youtubeUrl,
          requester: userName,
          timestamp: tipData.timestamp || new Date().toISOString(),
          requestType: 'donation',
          donationInfo: {
              amount: amount,
              currency: currency
          },
          source: 'streamelements'
      };

      await validateAndAddSong(songRequest);
      
    } catch (error) {
        console.error(chalk.red('[StreamElements] Error processing donation:'), error);
        sendChatMessage(`@${tipData.username}, sorry, there was an error processing your song request.`);
    }
  };

  const onRedemptionCallback = async (redemptionData) => {
    try {
      const userName = redemptionData.username || 'Anonymous';
      const userInput = redemptionData.message || ''; // Get user input (URL) from message field

      console.log(chalk.magenta(`[StreamElements] Processing channel point redemption: ${userName} - Reward: "${redemptionData.rewardTitle}" - Input: "${userInput}"`));

      const youtubeUrl = extractYouTubeUrlFromText(userInput);

      if (!youtubeUrl) {
          console.warn(chalk.yellow(`[StreamElements] No YouTube URL found in redemption from ${userName}: "${userInput}"`));
          sendChatMessage(`@${userName}, I couldn't find a YouTube link in your '${redemptionData.rewardTitle}' redemption message!`);
          return; // Don't process further
      }

      // Create song request object
      const songRequest = {
          id: redemptionData.id || Date.now().toString(),
          youtubeUrl: youtubeUrl,
          requester: userName,
          timestamp: redemptionData.timestamp || new Date().toISOString(),
          requestType: 'channelPoint',
          channelPointReward: { 
              title: redemptionData.rewardTitle
          },
          source: 'streamelements_redemption'
      };

      await validateAndAddSong(songRequest);

    } catch (error) {
        console.error(chalk.red('[StreamElements] Error processing channel point redemption:'), error);
        sendChatMessage(`@${redemptionData.username}, sorry, there was an error processing your song request.`);
    }
  };

  // Connect to StreamElements using the modular approach
  connectToStreamElements(streamElementsConfig, onTipCallback, onRedemptionCallback);
  
  console.log(chalk.blue('[Server] Initializing HTTP listener...')); // Added detailed logging
  // Use the custom HTTP server for listening
  // Explicitly bind to 0.0.0.0 to allow access from all interfaces
  httpServer.listen(SOCKET_PORT, '0.0.0.0', async () => {
      console.log(chalk.green(`🚀 Server running at http://0.0.0.0:${SOCKET_PORT}/`))
      console.log(chalk.blue("   Initializing subsystems..."));
  })
}

// Function to gracefully shutdown and save state
function shutdown(signal) {
  console.log(chalk.yellow(`Received ${signal}. Shutting down server...`));
  // Disconnect from StreamElements
  disconnectFromStreamElements();
  // Close database connection
  db.closeDatabase();
  process.exit(0);
}

// Listen for termination signals
process.on('SIGINT', () => shutdown('SIGINT')); // Ctrl+C
process.on('SIGTERM', () => shutdown('SIGTERM')); // kill command
process.on('exit', () => { 
  // Ensure DB connection is closed on any exit
  db.closeDatabase();
});

startServer();

// --- Function to validate and add a song request ---
async function validateAndAddSong(request) {

  // Validate essential request data
  if (!request || !request.youtubeUrl || !request.requester || !request.requestType) {
      console.error(chalk.red('[Queue] Invalid request object received (missing url, requester, or requestType):'), request);
      return;
  }

  // Flag to bypass restrictions for admin-added songs
  const bypassRestrictions = request.bypassRestrictions === true;
  
  if (bypassRestrictions) {
    console.log(chalk.blue(`[Queue] Admin bypassing restrictions for ${request.requester}'s request`));
  }

  // Check if requester is blocked
  if (!bypassRestrictions) {
    const blockedUsers = state.blockedUsers || [];
    const isBlocked = blockedUsers.some(user => user.username.toLowerCase() === request.requester.toLowerCase());
    if (isBlocked) {
        console.log(chalk.yellow(`[Queue] Request from blocked user ${request.requester} - rejecting`));
        sendChatMessage(`@${request.requester}, you are currently blocked from making song requests.`);
        return; // Stop processing
    }
  }

  // --- Check User Queue Limit for Channel Point Requests ---
  if (!bypassRestrictions && request.requestType === 'channelPoint') {
    const existingRequest = state.queue.find(song => song.requester.toLowerCase() === request.requester.toLowerCase());
    if (existingRequest) {
      console.log(chalk.yellow(`[Queue] User ${request.requester} already has a song in the queue - rejecting channel point request`));
      sendChatMessage(`@${request.requester}, you already have a song in the queue. Please wait for it to play.`);
      return; // Stop processing
    }
  }

  // --- Always fetch Twitch Profile for Avatar AND Login Name ---
  let requesterAvatar = null; // Default placeholder
  let requesterLogin = request.requester.toLowerCase(); // Default to lowercase display name for URL
  let twitchProfile = null;
  try {
      twitchProfile = await getTwitchUser(request.requester);
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
  // --- END TWITCH FETCH ---

  // Extract video ID
  const videoId = extractVideoId(request.youtubeUrl);
  if (!videoId) {
      console.error(chalk.red('[Queue] Invalid or missing YouTube URL:'), request.youtubeUrl);
      sendChatMessage(`@${request.requester}, the YouTube link you provided seems invalid or wasn't found in your message.`);
      return;
  }

  // Fetch video details
  try {
      const videoDetails = await fetchYouTubeDetails(videoId);
      console.log('Successfully fetched video details:', videoDetails);

      // --- Determine Artist Name (Prioritize Spotify) ---
      let finalArtistName = videoDetails.channelTitle; // Default to channel title
      let spotifyTrack = null;

      try {
          console.log(chalk.blue(`[Spotify] Searching for Spotify match for "${videoDetails.title}"`));
          spotifyTrack = await spotify.getSpotifyEquivalent({
              title: videoDetails.title,
              artist: videoDetails.channelTitle // Use channel title for initial search query
          });

          if (spotifyTrack && spotifyTrack.artists && spotifyTrack.artists.length > 0) {
              const spotifyArtistNames = spotifyTrack.artists.map(a => a.name).join(', ');
              console.log(chalk.green(`[Spotify] Found match: "${spotifyTrack.name}" by ${spotifyArtistNames}. Using Spotify artist(s).`));
              finalArtistName = spotifyArtistNames; // Use Spotify artist name(s)
          } else {
              console.log(chalk.yellow(`[Spotify] No suitable match found for "${videoDetails.title}". Using YouTube channel title as artist.`));
              // Keep finalArtistName as videoDetails.channelTitle
          }
      } catch (spotifyError) {
          console.error(chalk.red('[Spotify] Error finding match:'), spotifyError);
          // Don't fail the entire song request if Spotify search fails, use default artist name
          console.log(chalk.yellow(`[Spotify] Proceeding with YouTube channel title ("${finalArtistName}") as artist due to error.`));
      }
      // --- END Spotify Search ---

      // Check song duration based on request type
      const MAX_CHANNEL_POINT_DURATION_SECONDS = 300; // 5 minutes
      const MAX_DONATION_DURATION_SECONDS = 600; // 10 minutes

      if (!bypassRestrictions && request.requestType === 'channelPoint' && videoDetails.durationSeconds > MAX_CHANNEL_POINT_DURATION_SECONDS) {
          console.log(chalk.yellow(`[Queue] Channel Point request duration (${videoDetails.durationSeconds}s) exceeds limit (${MAX_CHANNEL_POINT_DURATION_SECONDS}s) - rejecting "${videoDetails.title}"`));
          sendChatMessage(`@${request.requester} Sorry, channel point songs cannot be longer than 5 minutes. Donate for priority and up to 10 minute songs.`);
          return; // Stop processing this request
      }
      if (!bypassRestrictions && request.requestType === 'donation' && videoDetails.durationSeconds > MAX_DONATION_DURATION_SECONDS) {
          console.log(chalk.yellow(`[Queue] Donation request duration (${videoDetails.durationSeconds}s) exceeds limit (${MAX_DONATION_DURATION_SECONDS}s) - rejecting "${videoDetails.title}"`));
          sendChatMessage(`@${request.requester} Sorry, donation songs cannot be longer than 10 minutes.`);
          return; // Stop processing this request
      }
      // --- END Duration Checks ---

      // Check for blacklisted content
      if (!bypassRestrictions) {
        const blacklist = state.blacklist || [];
        const songTitle = videoDetails.title.toLowerCase();
        // Use the determined finalArtistName (Spotify or YT Channel) for blacklist check
        const artistNameLower = finalArtistName.toLowerCase();

        const blacklistedSong = blacklist.find(item =>
            item.type === 'song' && songTitle.includes(item.term.toLowerCase())
        );
        if (blacklistedSong) {
            console.log(chalk.yellow(`[Blacklist] Song "${videoDetails.title}" contains term "${blacklistedSong.term}" - rejecting`));
            sendChatMessage(`@${request.requester}, sorry, the song "${videoDetails.title}" is currently blacklisted.`);
            return;
        }

        const blacklistedArtist = blacklist.find(item =>
            // Check against the final determined artist name
            item.type === 'artist' && artistNameLower.includes(item.term.toLowerCase())
        );
        if (blacklistedArtist) {
            // Log using the final artist name
            console.log(chalk.yellow(`[Blacklist] Artist "${finalArtistName}" contains term "${blacklistedArtist.term}" - rejecting`));
            sendChatMessage(`@${request.requester}, sorry, songs by "${finalArtistName}" are currently blacklisted.`);
            return;
        }

        const blacklistedKeyword = blacklist.find(item =>
            item.type === 'keyword' &&
            // Check against both title and final artist name
            (songTitle.includes(item.term.toLowerCase()) || artistNameLower.includes(item.term.toLowerCase()))
        );
        if (blacklistedKeyword) {
            console.log(chalk.yellow(`[Blacklist] Song/Artist contains keyword "${blacklistedKeyword.term}" - rejecting "${videoDetails.title}"`));
            sendChatMessage(`@${request.requester}, sorry, your request for "${videoDetails.title}" could not be added due to a blacklisted keyword.`);
            return;
        }
      }
      // --- END Blacklist Check ---

      // Create song request object
      const songRequest = {
          id: request.id || Date.now().toString(),
          youtubeUrl: request.youtubeUrl,
          requester: request.requester, // Display name
          requesterLogin: requesterLogin, // Login name for URL
          requesterAvatar: requesterAvatar,
          timestamp: request.timestamp || new Date().toISOString(),
          title: videoDetails.title,
          artist: finalArtistName, // Use the determined artist name
          channelId: videoDetails.channelId,
          duration: videoDetails.duration,
          durationSeconds: videoDetails.durationSeconds,
          thumbnailUrl: videoDetails.thumbnailUrl,
          source: 'youtube',
          channelPointReward: request.requestType === 'channelPoint' ? request.channelPointReward : undefined,
          requestType: request.requestType,
          donationInfo: request.requestType === 'donation' ? request.donationInfo : undefined,
          spotify: spotifyTrack // Attach the found Spotify track object (or null)
      };
      
      // Determine queue insertion position based on request type
      let insertIndex = state.queue.length; // Default to end
      let queuePosition = 0;
      let messageType = songRequest.requestType === 'donation' ? 'Priority donation' : 'Channel point';

      if (songRequest.requestType === 'donation') {
          // Find the index of the first non-donation (channelPoint) request
          const firstChannelPointIndex = state.queue.findIndex(song => song.requestType === 'channelPoint');
          if (firstChannelPointIndex !== -1) {
              insertIndex = firstChannelPointIndex; // Insert before the first channel point request
          } else {
              insertIndex = state.queue.length; // If no channel point requests, insert at the end (among donations)
          }
      } else { // channelPoint
          insertIndex = state.queue.length; // Always add channel point requests to the end
      }
      
      // Insert the song into the in-memory queue
      state.queue.splice(insertIndex, 0, songRequest);
      // Persist the newly added song to the database queue
      db.addSongToDbQueue(songRequest);

      // Calculate user-facing queue position (1-based index)
      queuePosition = state.queue.findIndex(song => song.id === songRequest.id) + 1;
      // --- END Queue Insertion Logic ---

      // Emit updates to all clients
      io.emit('newSongRequest', songRequest); // Keep this for potential UI feedback
      io.emit('queueUpdate', state.queue);
      console.log(chalk.green(`[Queue] Added "${songRequest.title}". Type: ${messageType}. Requester: ${songRequest.requester}. Position: #${queuePosition}`));

      // Optionally send a success message to chat
      if (songRequest.requestType === 'donation' && songRequest.donationInfo) {
          const { amount, currency } = songRequest.donationInfo;
          sendChatMessage(`@${songRequest.requester} Thanks for the ${amount} ${currency} donation! Your priority request for "${songRequest.title}" is #${queuePosition} in the queue.`);
      } else { // For channel points or other types
          sendChatMessage(`@${songRequest.requester} requested "${songRequest.title}". You're #${queuePosition} in the queue!`);
      }

  } catch (fetchError) {
      console.error(chalk.red('[YouTube] Error fetching video details:'), fetchError);
      sendChatMessage(`@${request.requester}, sorry, I couldn't fetch the details for that YouTube link.`);
    }
}