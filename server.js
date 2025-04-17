const { createServer } = require('http')
const { Server } = require('socket.io')
const { watch, writeFileSync } = require('fs')
const { readFile, writeFile } = require('fs/promises')
const path = require('path')
const fetch = require('node-fetch')
require('dotenv').config()

const SOCKET_PORT = 3002
const httpServer = createServer()
const historyFilePath = path.join(__dirname, 'queue', 'history.json');

// Twitch API configuration
const TWITCH_CLIENT_ID = process.env.NEXT_PUBLIC_TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
let twitchAppAccessToken = null;
let twitchTokenExpiry = null;

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
            return
        }
        
        // Validate JSON format
        let request
        try {
            request = JSON.parse(content.trim())
            lastProcessedContent = content
            console.log('Successfully parsed request JSON:', request)
        } catch (parseError) {
            console.error('Invalid JSON content:', content)
            console.error('Parse error:', parseError)
            return
        }
        
        console.log('Processing request:', request)

        // --- START: Fetch Twitch Profile ---
        let requesterAvatar = '/placeholder.svg?height=32&width=32'; // Default placeholder
        if (request.requester) {
            try {
                const twitchProfile = await getTwitchUserProfile(request.requester);
                if (twitchProfile && twitchProfile.profile_image_url) {
                    requesterAvatar = twitchProfile.profile_image_url;
                    console.log(`Fetched Twitch avatar for ${request.requester}: ${requesterAvatar}`);
                } else {
                    console.warn(`Could not find Twitch profile or avatar for ${request.requester}. Using placeholder.`);
                }
            } catch (twitchError) {
                console.error(`Error fetching Twitch profile for ${request.requester}:`, twitchError);
                // Keep placeholder on error
            }
        } else {
             console.warn('Request is missing requester username.');
        }
        // --- END: Fetch Twitch Profile ---

        // Extract video ID
        const videoId = extractVideoId(request.youtubeUrl)
        if (!videoId) {
            console.error('Invalid YouTube URL:', request.youtubeUrl)
            return
        }
        
        console.log('Extracted video ID:', videoId)

        // Check if requester is blocked
        const blockedUsers = state.blockedUsers || []
        if (blockedUsers.some(user => user.username.toLowerCase() === request.requester.toLowerCase())) {
            console.log(`Request from blocked user ${request.requester} - rejecting`)
            return
        }

        // Fetch video details
        try {
            const videoDetails = await fetchYouTubeDetails(videoId)
            console.log('Successfully fetched video details:', videoDetails)
            
            // Check for duration limits
            if (state.settings && state.settings.maxDuration) {
                const maxDurationInSeconds = state.settings.maxDuration * 60
                if (videoDetails.durationSeconds > maxDurationInSeconds) {
                    console.log(`Video duration (${videoDetails.durationSeconds}s) exceeds maximum allowed (${maxDurationInSeconds}s) - rejecting`)
                    return
                }
            }
            
            // Check for blacklisted content
            const blacklist = state.blacklist || []
            const songTitle = videoDetails.title.toLowerCase()
            const artistName = videoDetails.channelTitle.toLowerCase()
            
            // Check for blacklisted songs
            const blacklistedSong = blacklist.find(item => 
                item.type === 'song' && songTitle.includes(item.term.toLowerCase())
            )
            if (blacklistedSong) {
                console.log(`Song "${videoDetails.title}" contains blacklisted term "${blacklistedSong.term}" - rejecting`)
                return
            }
            
            // Check for blacklisted artists
            const blacklistedArtist = blacklist.find(item => 
                item.type === 'artist' && artistName.includes(item.term.toLowerCase())
            )
            if (blacklistedArtist) {
                console.log(`Artist "${videoDetails.channelTitle}" contains blacklisted term "${blacklistedArtist.term}" - rejecting`)
                return
            }
            
            // Check for blacklisted keywords
            const blacklistedKeyword = blacklist.find(item => 
                item.type === 'keyword' && 
                (songTitle.includes(item.term.toLowerCase()) || artistName.includes(item.term.toLowerCase()))
            )
            if (blacklistedKeyword) {
                console.log(`Song contains blacklisted keyword "${blacklistedKeyword.term}" - rejecting`)
                return
            }
            
            // Create song request object
            const songRequest = {
                id: request.id,
                youtubeUrl: request.youtubeUrl,
                requester: request.requester,
                requesterAvatar: requesterAvatar,
                timestamp: request.timestamp,
                title: videoDetails.title,
                artist: videoDetails.channelTitle,
                duration: videoDetails.duration,
                durationSeconds: videoDetails.durationSeconds,
                thumbnailUrl: videoDetails.thumbnailUrl,
                source: 'youtube',
                channelPointReward: request.channelPointReward,
                priority: request.priority || 'normal'
            }
            
            console.log('Created song request object:', songRequest)

            // Update state
            state.queue.push(songRequest)
            
            // Emit updates to all clients
            io.emit('newSongRequest', songRequest)
            io.emit('queueUpdate', state.queue)
            
            console.log('Queue updated. Current queue:', state.queue)
        } catch (fetchError) {
            console.error('Error fetching video details:', fetchError)
        }
    } catch (error) {
        console.error('Error processing request:', error)
    } finally {
        isProcessing = false
    }
}

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

    // Handle queue updates
    socket.on('updateQueue', (updatedQueue) => {
        state.queue = updatedQueue
        socket.broadcast.emit('queueUpdate', state.queue)
    })

    // Handle add song
    socket.on('addSong', (song) => {
        // Add the song with appropriate priority
        if (song.priority === 'high') {
            state.queue.unshift(song) // Add to beginning
        } else {
            state.queue.push(song) // Add to end
        }
        io.emit('queueUpdate', state.queue)
    })

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
        
        if (song) {
            // Move current song to history if it exists
            if (state.nowPlaying) {
                console.log(`[Server] Adding previous song ${state.nowPlaying.id} to history.`);
                state.history.unshift(state.nowPlaying);
                historyUpdated = true;
            }
            state.nowPlaying = song
            state.queue = state.queue.filter(s => s.id !== song.id)
        } else {
            // Song finished or stopped
            if (state.nowPlaying) {
                console.log(`[Server] Adding finished song ${state.nowPlaying.id} to history.`);
                state.history.unshift(state.nowPlaying);
                historyUpdated = true;
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
          console.log(`[Server] Emitting historyUpdate.`); // Restore emission log
          io.emit('historyUpdate', state.history) // Restore history emission
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