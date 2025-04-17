const { createServer } = require('http')
const { Server } = require('socket.io')
const { watch, writeFileSync } = require('fs')
const { readFile, writeFile } = require('fs/promises')
const path = require('path')
const fetch = require('node-fetch')
const tmi = require('tmi.js')
require('dotenv').config()

const SOCKET_PORT = 3002
const httpServer = createServer()
const historyFilePath = path.join(__dirname, 'queue', 'history.json');

// Twitch API configuration
const TWITCH_CLIENT_ID = process.env.NEXT_PUBLIC_TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
let twitchAppAccessToken = null;
let twitchTokenExpiry = null;

// Twitch Chat Bot Configuration
const TWITCH_BOT_USERNAME = process.env.TWITCH_BOT_USERNAME;
const TWITCH_BOT_OAUTH_TOKEN = process.env.TWITCH_BOT_OAUTH_TOKEN;
const TWITCH_CHANNEL_NAME = process.env.TWITCH_CHANNEL_NAME;

if (!TWITCH_BOT_USERNAME || !TWITCH_BOT_OAUTH_TOKEN || !TWITCH_CHANNEL_NAME) {
  console.error('Twitch bot credentials (username, token, channel) are missing in .env file. Chat features disabled.');
}

const tmiOpts = {
  identity: {
    username: TWITCH_BOT_USERNAME,
    password: TWITCH_BOT_OAUTH_TOKEN,
  },
  channels: [TWITCH_CHANNEL_NAME],
};

let tmiClient = null;
if (TWITCH_BOT_USERNAME && TWITCH_BOT_OAUTH_TOKEN && TWITCH_CHANNEL_NAME) {
  tmiClient = new tmi.client(tmiOpts);

  tmiClient.on('message', (channel, tags, message, self) => {
    // Handle incoming messages if needed in the future
    if (self) return; // Ignore messages from the bot itself
    // Example: console.log(`${tags['display-name']}: ${message}`);
  });

  tmiClient.on('connected', (addr, port) => {
    console.log(`* Connected to Twitch chat (${addr}:${port}) in channel #${TWITCH_CHANNEL_NAME}`);
  });

  tmiClient.on('disconnected', (reason) => {
    console.log(`* Disconnected from Twitch chat: ${reason}`);
    // Optionally attempt to reconnect
  });

  tmiClient.connect().catch(console.error);
}

// Function to send a message to Twitch chat
function sendChatMessage(message) {
  if (tmiClient && tmiClient.readyState() === 'OPEN') {
    tmiClient.say(TWITCH_CHANNEL_NAME, message)
      .then(() => {
        console.log(`[Twitch Chat] Sent: "${message}"`);
      })
      .catch((err) => {
        console.error(`[Twitch Chat] Error sending message: ${err}`);
      });
  } else {
    console.warn('[Twitch Chat] Could not send message, client not connected or configured.');
  }
}

// Function to get Twitch App Access Token
async function getTwitchAppAccessToken() {
  if (twitchAppAccessToken && twitchTokenExpiry && twitchTokenExpiry > Date.now()) {
    return twitchAppAccessToken;
  }

  console.log('Fetching new Twitch App Access Token...');
  const tokenUrl = `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`;

  try {
    const response = await fetch(tokenUrl, { method: 'POST' });
    if (!response.ok) {
      throw new Error(`Twitch token request failed with status ${response.status}: ${await response.text()}`);
    }
    const data = await response.json();
    twitchAppAccessToken = data.access_token;
    // Set expiry a bit earlier than actual expiry for safety
    twitchTokenExpiry = Date.now() + (data.expires_in - 300) * 1000;
    console.log('Successfully fetched new Twitch App Access Token.');
    return twitchAppAccessToken;
  } catch (error) {
    console.error('Error fetching Twitch App Access Token:', error);
    twitchAppAccessToken = null; // Reset token on error
    twitchTokenExpiry = null;
    throw error; // Re-throw error to indicate failure
  }
}

// Function to get Twitch User Profile
async function getTwitchUserProfile(username) {
  if (!username) {
    console.warn('getTwitchUserProfile called with no username.');
    return null; // Return null if no username provided
  }
  if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET) {
    console.error('Twitch Client ID or Secret not configured in .env');
    return null;
  }

  try {
    const accessToken = await getTwitchAppAccessToken();
    if (!accessToken) {
      throw new Error('Failed to get Twitch App Access Token.');
    }

    const userUrl = `https://api.twitch.tv/helix/users?login=${encodeURIComponent(username)}`;
    const response = await fetch(userUrl, {
      headers: {
        'Client-ID': TWITCH_CLIENT_ID,
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
        if (response.status === 401) { // Token might have expired prematurely
            console.warn('Twitch API returned 401, attempting to refresh token...');
            twitchAppAccessToken = null; // Force token refresh
            const newAccessToken = await getTwitchAppAccessToken();
            if (!newAccessToken) throw new Error('Failed to refresh Twitch token.');
            // Retry the request with the new token
             const retryResponse = await fetch(userUrl, {
                headers: {
                    'Client-ID': TWITCH_CLIENT_ID,
                    'Authorization': `Bearer ${newAccessToken}`
                }
            });
             if (!retryResponse.ok) {
                throw new Error(`Twitch user request failed after retry with status ${retryResponse.status}: ${await retryResponse.text()}`);
             }
             const retryData = await retryResponse.json();
             return retryData.data && retryData.data.length > 0 ? retryData.data[0] : null;
        } else {
             throw new Error(`Twitch user request failed with status ${response.status}: ${await response.text()}`);
        }
    }

    const data = await response.json();
    // Return the first user found, or null if no user matches
    return data.data && data.data.length > 0 ? data.data[0] : null;
  } catch (error) {
    console.error(`Error fetching Twitch user profile for ${username}:`, error);
    return null; // Return null on error
  }
}

// Server state
const state = {
  queue: [],
  history: [],
  nowPlaying: null,
  settings: {},
  blacklist: [],
  blockedUsers: []
}

const io = new Server(httpServer, {
    cors: {
        origin: ["http://localhost:3000", "http://localhost:3001"],
        methods: ["GET", "POST"],
        credentials: true
    }
})

// File watcher setup
const queueDir = path.join(process.cwd(), 'queue')
const requestsFile = path.join(queueDir, 'requests.json')
let isProcessing = false
let lastProcessedContent = ''

// Function to load history from file
async function loadHistory() {
  try {
    const data = await readFile(historyFilePath, 'utf-8');
    state.history = JSON.parse(data);
    console.log(`Loaded ${state.history.length} items from history file.`);
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log('History file not found, starting with empty history.');
      state.history = [];
    } else {
      console.error('Error loading history file:', error);
      state.history = []; // Start with empty history on error
    }
  }
}

// Function to save history to file
async function saveHistory() {
  console.log(`[Server] Entering saveHistory function. History length: ${state.history.length}`); // Log entry
  try {
    await writeFile(historyFilePath, JSON.stringify(state.history, null, 2), 'utf-8');
    console.log(`Saved ${state.history.length} items to history file.`);
  } catch (error) {
    console.error('Error saving history file:', error);
  }
}

// --- NEW Function: Validate and Add Song ---
async function validateAndAddSong(request) {
  console.log('Validating and adding song request:', request);

  // Validate essential request data
  if (!request || !request.youtubeUrl || !request.requester || !request.requestType) {
      console.error('Invalid request object received (missing url, requester, or requestType):', request);
      // Optionally send a generic error message if possible, though requester might be unknown
      return;
  }

  // Check if requester is blocked
  const blockedUsers = state.blockedUsers || [];
  const isBlocked = blockedUsers.some(user => user.username.toLowerCase() === request.requester.toLowerCase());
  if (isBlocked) {
      console.log(`Request from blocked user ${request.requester} - rejecting`);
      sendChatMessage(`@${request.requester}, you are currently blocked from making song requests.`);
      return; // Stop processing
  }

  // --- Check User Queue Limit for Channel Point Requests ---
  if (request.requestType === 'channelPoint') {
    const existingRequest = state.queue.find(song => song.requester.toLowerCase() === request.requester.toLowerCase());
    if (existingRequest) {
      console.log(`User ${request.requester} already has a song in the queue - rejecting channel point request`);
      sendChatMessage(`@${request.requester}, you already have a song in the queue. Please wait for it to play.`);
      return; // Stop processing
    }
  }
  // --- END User Limit Check ---

  // --- Always fetch Twitch Profile for Avatar AND Login Name ---
  let requesterAvatar = '/placeholder.svg?height=32&width=32'; // Default placeholder
  let requesterLogin = request.requester.toLowerCase(); // Default to lowercase display name for URL
  let twitchProfile = null; // Store profile to get login name later
  try {
      twitchProfile = await getTwitchUserProfile(request.requester);
      if (twitchProfile) {
          if (twitchProfile.profile_image_url) {
              requesterAvatar = twitchProfile.profile_image_url;
              console.log(`Fetched Twitch avatar for ${request.requester}: ${requesterAvatar}`);
          } else {
              console.warn(`Could not find Twitch avatar for ${request.requester}. Using placeholder.`);
          }
          if (twitchProfile.login) {
              requesterLogin = twitchProfile.login;
              console.log(`Fetched Twitch login for ${request.requester}: ${requesterLogin}`);
          } else {
              console.warn(`Could not find Twitch login name for ${request.requester}. Using default.`);
          }
      } else {
          console.warn(`Could not find Twitch profile for ${request.requester}. Using placeholders.`);
      }
  } catch (twitchError) {
      console.error(`Error fetching Twitch profile for ${request.requester}:`, twitchError);
      // Keep default placeholders on error
  }
  // --- END TWITCH FETCH ---

  // Extract video ID
  const videoId = extractVideoId(request.youtubeUrl);
  if (!videoId) {
      console.error('Invalid YouTube URL:', request.youtubeUrl);
      sendChatMessage(`@${request.requester}, the YouTube link you provided seems invalid.`);
      return;
  }
  console.log('Extracted video ID:', videoId);

  // Fetch video details
  try {
      const videoDetails = await fetchYouTubeDetails(videoId);
      console.log('Successfully fetched video details:', videoDetails);

      // --- NEW: Duration Checks based on Request Type ---
      const MAX_CHANNEL_POINT_DURATION_SECONDS = 300; // 5 minutes
      const MAX_DONATION_DURATION_SECONDS = 600; // 10 minutes

      if (request.requestType === 'channelPoint' && videoDetails.durationSeconds > MAX_CHANNEL_POINT_DURATION_SECONDS) {
          console.log(`Channel Point request duration (${videoDetails.durationSeconds}s) exceeds limit (${MAX_CHANNEL_POINT_DURATION_SECONDS}s) - rejecting`);
          sendChatMessage(`@${request.requester} Sorry, channel point songs cannot be longer than 5 minutes. Donate for priority and up to 10 minute songs.`);
          return; // Stop processing this request
      }
      if (request.requestType === 'donation' && videoDetails.durationSeconds > MAX_DONATION_DURATION_SECONDS) {
          console.log(`Donation request duration (${videoDetails.durationSeconds}s) exceeds limit (${MAX_DONATION_DURATION_SECONDS}s) - rejecting`);
          sendChatMessage(`@${request.requester} Sorry, donation songs cannot be longer than 10 minutes.`);
          return; // Stop processing this request
      }
      // --- END Duration Checks ---

      // Check for blacklisted content
      const blacklist = state.blacklist || [];
      const songTitle = videoDetails.title.toLowerCase();
      const artistName = videoDetails.channelTitle.toLowerCase();

      const blacklistedSong = blacklist.find(item =>
          item.type === 'song' && songTitle.includes(item.term.toLowerCase())
      );
      if (blacklistedSong) {
          console.log(`Song "${videoDetails.title}" contains blacklisted term "${blacklistedSong.term}" - rejecting`);
          sendChatMessage(`@${request.requester}, sorry, the song "${videoDetails.title}" is currently blacklisted.`);
          return;
      }

      const blacklistedArtist = blacklist.find(item =>
          item.type === 'artist' && artistName.includes(item.term.toLowerCase())
      );
      if (blacklistedArtist) {
          console.log(`Artist "${videoDetails.channelTitle}" contains blacklisted term "${blacklistedArtist.term}" - rejecting`);
           sendChatMessage(`@${request.requester}, sorry, songs by "${videoDetails.channelTitle}" are currently blacklisted.`);
          return;
      }

      const blacklistedKeyword = blacklist.find(item =>
          item.type === 'keyword' &&
          (songTitle.includes(item.term.toLowerCase()) || artistName.includes(item.term.toLowerCase()))
      );
      if (blacklistedKeyword) {
          console.log(`Song contains blacklisted keyword "${blacklistedKeyword.term}" - rejecting`);
           sendChatMessage(`@${request.requester}, sorry, your request for "${videoDetails.title}" could not be added due to a blacklisted keyword.`);
          return;
      }

      // Create song request object
      const songRequest = {
          id: request.id || Date.now().toString(),
          youtubeUrl: request.youtubeUrl,
          requester: request.requester, // Display name
          requesterLogin: requesterLogin, // Login name for URL
          requesterAvatar: requesterAvatar,
          timestamp: request.timestamp || new Date().toISOString(),
          title: videoDetails.title,
          artist: videoDetails.channelTitle,
          channelId: videoDetails.channelId,
          duration: videoDetails.duration,
          durationSeconds: videoDetails.durationSeconds,
          thumbnailUrl: videoDetails.thumbnailUrl,
          source: 'youtube',
          channelPointReward: request.requestType === 'channelPoint' ? request.channelPointReward : undefined,
          requestType: request.requestType,
          donationInfo: request.requestType === 'donation' ? request.donationInfo : undefined
      };

      console.log('Created song request object:', songRequest);

      // --- NEW: Queue Insertion Logic based on Request Type ---
      let insertIndex = state.queue.length; // Default to end
      let queuePosition = 0;

      if (songRequest.requestType === 'donation') {
          // Find the index of the first non-donation (channelPoint) request
          const firstChannelPointIndex = state.queue.findIndex(song => song.requestType === 'channelPoint');
          if (firstChannelPointIndex !== -1) {
              insertIndex = firstChannelPointIndex; // Insert before the first channel point request
          } else {
              insertIndex = state.queue.length; // If no channel point requests, insert at the end (among donations)
          }
          console.log(`Adding donation song ${songRequest.id} at index ${insertIndex}`);
      } else { // channelPoint
          insertIndex = state.queue.length; // Always add channel point requests to the end
          console.log(`Adding channelPoint song ${songRequest.id} at index ${insertIndex}`);
      }
      
      // Insert the song
      state.queue.splice(insertIndex, 0, songRequest);

      // Calculate user-facing queue position (1-based index)
      queuePosition = state.queue.findIndex(song => song.id === songRequest.id) + 1;
      // --- END Queue Insertion Logic ---

      // Emit updates to all clients
      io.emit('newSongRequest', songRequest); // Keep this for potential UI feedback
      io.emit('queueUpdate', state.queue);

      console.log('Queue updated. Current queue length:', state.queue.length);
      // Optionally send a success message to chat
      sendChatMessage(`@${request.requester} requested "${songRequest.title}". You're #${queuePosition} in the queue!`);

  } catch (fetchError) {
      console.error('Error fetching video details:', fetchError);
      sendChatMessage(`@${request.requester}, sorry, I couldn't fetch the details for that YouTube link.`);
  }
}
// --- END NEW Function ---

// --- MODIFIED processRequest ---
async function processRequest(filePath) {
    if (isProcessing) return

    try {
        isProcessing = true

        // Add a small delay to ensure the file is completely written
        await new Promise(resolve => setTimeout(resolve, 100))

        // Read and parse the request file
        const content = await readFile(filePath, 'utf-8')

        // Skip if we've already processed this content
        if (content === lastProcessedContent) {
            console.log('Skipping already processed content')
            isProcessing = false; // Reset flag here
            return
        }

        // Validate JSON format
        let request
        try {
            request = JSON.parse(content.trim())
            lastProcessedContent = content
            console.log('Successfully parsed request JSON from file:', request)
        } catch (parseError) {
            console.error('Invalid JSON content in file:', content)
            console.error('Parse error:', parseError)
            isProcessing = false; // Reset flag here
            return
        }

        // Determine request type: Use file data if present, otherwise default to channelPoint
        const determinedRequestType = request.hasOwnProperty('requestType') && request.requestType 
                                      ? request.requestType 
                                      : 'channelPoint';

        const finalRequest = {
            ...request,
            requestType: determinedRequestType
        };
        console.log(`Processing file request. Determined type: ${finalRequest.requestType}`); // Add log

        // Call the centralized validation and adding function
        await validateAndAddSong(finalRequest); // Pass the request with ensured requestType

    } catch (error) {
        console.error('Error processing request from file:', error)
    } finally {
        isProcessing = false
    }
}
// --- END MODIFIED processRequest ---

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id)
    
    // Send initial state to newly connected client
    socket.emit('initialState', state)

    // Handle get state request
    socket.on('getState', () => {
        socket.emit('queueUpdate', state.queue)
        socket.emit('nowPlaying', state.nowPlaying)
        socket.emit('historyUpdate', state.history)
    })

    // Handle queue updates (mostly for admin drag/drop?)
    socket.on('updateQueue', (updatedQueue) => {
        console.log('[Server] Received \'updateQueue\' (likely admin action)');
        state.queue = updatedQueue
        socket.broadcast.emit('queueUpdate', state.queue) // Inform other clients
    })

    // --- MODIFIED addSong Handler ---
    socket.on('addSong', async (songRequestData) => {
        console.log('[Server] Received \'addSong\' event via socket:', songRequestData);
        // Ensure the incoming data has necessary fields before validating
        if (!songRequestData || !songRequestData.youtubeUrl || !songRequestData.requester) {
             console.error('Received invalid song request data via socket:', songRequestData);
             // Cannot easily notify user as this might be an admin action without a clear target
             return;
        }
        // Call the centralized validation and adding function
        await validateAndAddSong(songRequestData);
    })
    // --- END MODIFIED addSong Handler ---

    // Handle remove song
    socket.on('removeSong', (songId) => {
        state.queue = state.queue.filter(song => song.id !== songId)
        io.emit('queueUpdate', state.queue)
    })

    // Handle clear queue
    socket.on('clearQueue', () => {
        state.queue = []
        io.emit('queueUpdate', state.queue)
    })

    // Handle prioritize song
    socket.on('prioritizeSong', (songId) => {
        const song = state.queue.find(s => s.id === songId)
        if (song) {
            // Remove the song from its current position
            state.queue = state.queue.filter(s => s.id !== songId)
            // Add it to the beginning
            state.queue.unshift(song)
            io.emit('queueUpdate', state.queue)
        }
    })

    // Handle playback controls
    socket.on('pausePlaying', () => {
        // Emit pause event to clients
        io.emit('playerControl', { action: 'pause' })
    })

    socket.on('resumePlaying', () => {
        // Emit resume event to clients
        io.emit('playerControl', { action: 'resume' })
    })

    socket.on('resetSystem', async () => {
        // Clear everything
        state.queue = []
        state.nowPlaying = null
        state.history = []

        await saveHistory();

        // Emit updates to all clients
        io.emit('queueUpdate', state.queue)
        io.emit('nowPlaying', state.nowPlaying)
        io.emit('historyUpdate', state.history)
    })

    // Handle settings
    socket.on('setAutoplay', (enabled) => {
        state.settings = state.settings || {}
        state.settings.autoplay = enabled
        io.emit('settingsUpdate', state.settings)
    })

    socket.on('setMaxDuration', (minutes) => {
        state.settings = state.settings || {}
        state.settings.maxDuration = minutes
        io.emit('settingsUpdate', state.settings)
    })

    // Handle now playing updates
    socket.on('updateNowPlaying', async (song) => {
        console.log(`[Server] Received 'updateNowPlaying' event. Incoming song:`, song ? song.id : 'null');
        console.log(`[Server] State BEFORE update: nowPlaying=${state.nowPlaying?.id}, history[0]=${state.history[0]?.id}`);
        
        let historyUpdated = false; 
        const previousSong = state.nowPlaying; // Store previous song

        if (song) {
            // Move current song to history if it exists and is not already the most recent history item
            if (previousSong && (!state.history.length || state.history[0].id !== previousSong.id)) {
                 // *** Check for duplicates before adding ***
                 if (!state.history.some(historySong => historySong.id === previousSong.id)) {
                     console.log(`[Server] Adding previous song ${previousSong.id} to history.`);
                     state.history.unshift(previousSong);
                     historyUpdated = true;
                 } else {
                    console.log(`[Server] Skipped adding previous song ${previousSong.id} to history (duplicate ID found).`);
                 }
            }
            state.nowPlaying = song
            state.queue = state.queue.filter(s => s.id !== song.id)
        } else {
            // Song finished or stopped
            if (previousSong && (!state.history.length || state.history[0].id !== previousSong.id)) {
                // *** Check for duplicates before adding ***
                if (!state.history.some(historySong => historySong.id === previousSong.id)) {
                    console.log(`[Server] Adding finished song ${previousSong.id} to history.`);
                    state.history.unshift(previousSong);
                    historyUpdated = true;
                } else {
                    console.log(`[Server] Skipped adding finished song ${previousSong.id} to history (duplicate ID found).`);
                }
            }
            state.nowPlaying = null
        }
        
        // Save history if it was updated in this event
        if (historyUpdated) {
          console.log(`[Server] historyUpdated is true. History length BEFORE save call: ${state.history.length}`);
          console.log(`[Server] Calling saveHistory...`); 
          await saveHistory(); // Save whenever history changed
        }

        // Broadcast updates
        io.emit('nowPlaying', state.nowPlaying)
        io.emit('queueUpdate', state.queue)
        // Emit history update if it actually changed
        if (historyUpdated) { 
          console.log(`[Server] Emitting historyUpdate.`); 
          io.emit('historyUpdate', state.history)
        }
    })

    // Handle blacklist updates
    socket.on('updateBlacklist', (blacklist) => {
        state.blacklist = blacklist
        io.emit('blacklistUpdate', state.blacklist)
    })

    // Handle blocked users
    socket.on('updateBlockedUsers', (blockedUsers) => {
        state.blockedUsers = blockedUsers
        io.emit('blockedUsersUpdate', state.blockedUsers)
    })

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id)
    })
})

// Function to gracefully shutdown and save state
function shutdown(signal) {
  console.log(`Received ${signal}. Shutting down server...`);
  if (state.nowPlaying) {
    console.log('Moving now playing song to history before shutdown:', state.nowPlaying.id);
    // Avoid duplicates if shutdown signal comes right after updateNowPlaying(null)
    if (!state.history.length || state.history[0].id !== state.nowPlaying.id) {
       state.history.unshift(state.nowPlaying);
    }
    state.nowPlaying = null; // Clear now playing as it's moved/finished
  }
  try {
      // Use synchronous write for shutdown handler
      writeFileSync(historyFilePath, JSON.stringify(state.history, null, 2), 'utf-8');
      console.log('Final state saved successfully.');
      process.exit(0);
  } catch(err) {
      console.error('Error saving history during shutdown:', err);
      process.exit(1);
  }
}

// Listen for termination signals
process.on('SIGINT', () => shutdown('SIGINT')); // Ctrl+C
process.on('SIGTERM', () => shutdown('SIGTERM')); // kill command
// Optional: Handle unexpected exit events, though less reliable for async saves
// process.on('exit', async (code) => {
//     console.log(`Process exit event with code: ${code}`);
//     // Might be too late for async operations like saveHistory here
// });

// Start watching the queue directory
watch(queueDir, { persistent: true }, async (eventType, filename) => {
    if (filename === 'requests.json') {
        await processRequest(requestsFile)
    } else if (filename === path.basename(historyFilePath)) {
        // Optional: Could add logic to reload history if file is manually changed,
        // but be careful of loops if saveHistory triggers the watcher.
        // For now, we assume history is only changed by the server itself.
        // console.log(`History file ${filename} changed.`); // Remove noisy log
    }
})

// Start the server and load initial data
async function startServer() {
  await loadHistory(); // Load history before starting watcher/server

  // Start file watcher only after loading history
  watch(queueDir, async (eventType, filename) => {
      if (filename === path.basename(requestsFile) && eventType === 'change') {
          console.log(`File ${filename} changed, processing...`)
          await processRequest(requestsFile)
      } else if (filename === path.basename(historyFilePath)) {
          // Optional: Could add logic to reload history if file is manually changed,
          // but be careful of loops if saveHistory triggers the watcher.
          // For now, we assume history is only changed by the server itself.
          // console.log(`History file ${filename} changed.`); // Remove noisy log
      }
  })

  httpServer.listen(SOCKET_PORT, () => {
      console.log(`Socket.IO server running at http://localhost:${SOCKET_PORT}/`)
      console.log(`Watching directory: ${queueDir}`)
  })
}

startServer();

// Helper functions
function extractVideoId(url) {
    if (!url) {
        console.error('YouTube URL is undefined or empty')
        return null
    }
    console.log('Extracting video ID from:', url)
    const match = url.match(/(?:youtube\.com\/watch\?v=|youtu.be\/)([^&\n?#]+)/)
    const result = match ? match[1] : null
    console.log('Extracted video ID:', result)
    return result
}

async function fetchYouTubeDetails(videoId) {
    try {
        if (!process.env.YOUTUBE_API_KEY) {
            console.error('YouTube API key not configured in environment variables')
            throw new Error('YouTube API key not configured')
        }

        console.log('Fetching details for video ID:', videoId)
        console.log('Using YouTube API key:', process.env.YOUTUBE_API_KEY ? 'Key is present' : 'Key is missing')

        const apiUrl = `https://www.googleapis.com/youtube/v3/videos?id=${videoId}&part=snippet,contentDetails&key=${process.env.YOUTUBE_API_KEY}`
        console.log('YouTube API URL:', apiUrl)
        
        const response = await fetch(
            apiUrl,
            { headers: { 'Accept': 'application/json' } }
        )
        
        console.log('YouTube API response status:', response.status)
        
        if (!response.ok) {
            console.error('YouTube API error status:', response.status, response.statusText)
            throw new Error(`YouTube API error: ${response.statusText}`)
        }

        const data = await response.json()
        console.log('YouTube API response data:', JSON.stringify(data, null, 2))
        
        if (!data.items?.[0]) {
            console.error('Video not found in YouTube API response')
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
        console.error('Error fetching YouTube details:', error)
        throw error
    }
}

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

        return hours > 0 ? 
            `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}` : 
            `${minutes}:${seconds.toString().padStart(2, '0')}`
    } catch (error) {
        console.error('Error formatting duration:', error)
        return '0:00'
    }
}

// Function to parse ISO 8601 duration to seconds
function parseIsoDuration(isoDuration) {
    const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
    if (!match) return 0
    
    const hours = match[1] ? parseInt(match[1]) : 0
    const minutes = match[2] ? parseInt(match[2]) : 0
    const seconds = match[3] ? parseInt(match[3]) : 0
    
    return hours * 3600 + minutes * 60 + seconds
} 