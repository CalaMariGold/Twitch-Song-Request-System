const { createServer } = require('http')
const { Server } = require('socket.io')
const { watch, writeFileSync } = require('fs')
const { readFile, writeFile } = require('fs/promises')
const path = require('path')
const fetch = require('node-fetch')
const tmi = require('tmi.js')
const crypto = require('crypto')
const url = require('url')
const ioClient = require('socket.io-client')
require('dotenv').config()

const SOCKET_PORT = 3002
const httpServer = createServer()
const historyFilePath = path.join(__dirname, 'queue', 'history.json');
const userTokenFilePath = path.join(__dirname, 'queue', 'user_token.json');

// Twitch API configuration
const TWITCH_CLIENT_ID = process.env.NEXT_PUBLIC_TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
let twitchAppAccessToken = null;
let twitchTokenExpiry = null;
let twitchBroadcasterId = null;
let targetRewardId = null;
let broadcasterUserAccessToken = null;

// Twitch Chat Bot Configuration
const TWITCH_BOT_USERNAME = process.env.TWITCH_BOT_USERNAME;
const TWITCH_BOT_OAUTH_TOKEN = process.env.TWITCH_BOT_OAUTH_TOKEN;
const TWITCH_CHANNEL_NAME = process.env.TWITCH_CHANNEL_NAME;

// EventSub Configuration
const EVENTSUB_SECRET = process.env.EVENTSUB_SECRET;
const CALLBACK_URL = process.env.CALLBACK_URL;
const TARGET_REWARD_ID = process.env.TARGET_REWARD_ID;

// StreamElements Configuration
const SE_JWT_TOKEN = process.env.STREAMELEMENTS_JWT_TOKEN;
const SE_ACCOUNT_ID = process.env.STREAMELEMENTS_ACCOUNT_ID;
const SE_WEBHOOK_SECRET = process.env.STREAMELEMENTS_WEBHOOK_SECRET;

if (!SE_JWT_TOKEN || !SE_ACCOUNT_ID) {
  console.warn('StreamElements configuration (JWT token, account ID) are missing in .env file. StreamElements donations disabled.');
}

if (!TWITCH_BOT_USERNAME || !TWITCH_BOT_OAUTH_TOKEN || !TWITCH_CHANNEL_NAME) {
  console.error('Twitch bot credentials (username, token, channel) are missing in .env file. Chat features disabled.');
}
if (!EVENTSUB_SECRET || !CALLBACK_URL) {
    console.error('EVENTSUB_SECRET or CALLBACK_URL not configured in .env. EventSub disabled.');
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
async function getTwitchUser(username) {
  if (!username) {
    console.warn('getTwitchUser called with no username.');
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

// --- NEW: Function to get Broadcaster ID ---
async function getBroadcasterId() {
    if (twitchBroadcasterId) {
        return twitchBroadcasterId;
    }
    if (!TWITCH_CHANNEL_NAME) {
        console.error("Cannot get Broadcaster ID: TWITCH_CHANNEL_NAME not set in .env");
        return null;
    }
    console.log(`Fetching Broadcaster ID for channel: ${TWITCH_CHANNEL_NAME}...`);
    try {
        const user = await getTwitchUser(TWITCH_CHANNEL_NAME);
        if (user && user.id) {
            twitchBroadcasterId = user.id;
            console.log(`Found Broadcaster ID: ${twitchBroadcasterId}`);
            return twitchBroadcasterId;
        } else {
            console.error(`Could not find Twitch user for channel: ${TWITCH_CHANNEL_NAME}`);
            return null;
        }
    } catch (error) {
        console.error("Error fetching broadcaster ID:", error);
        return null;
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

const queueDir = path.join(process.cwd(), 'queue') // Define queueDir here

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
      twitchProfile = await getTwitchUser(request.requester);
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
      console.error('Invalid or missing YouTube URL:', request.youtubeUrl);
      if (request.source !== 'eventsub') {
           sendChatMessage(`@${request.requester}, the YouTube link you provided seems invalid or wasn't found in your message.`);
      }
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
        await validateAndAddSong({ ...songRequestData, source: 'socket' });
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

// StreamElements Socket.io connection
let seSocket = null;

// Function to connect to StreamElements Socket API
function connectToStreamElements() {
    if (!SE_JWT_TOKEN) {
        console.warn('No StreamElements JWT token provided, skipping StreamElements connection');
        return;
    }

    console.log('Connecting to StreamElements Socket API...');
    
    // Connect to StreamElements socket server
    seSocket = ioClient.connect('https://realtime.streamelements.com', {
        transports: ['websocket']
    });

    // Connection event handlers
    seSocket.on('connect', () => {
        console.log('Successfully connected to StreamElements Socket API');
        
        // Authenticate with JWT
        seSocket.emit('authenticate', {
            method: 'jwt',
            token: SE_JWT_TOKEN
        });
    });

    seSocket.on('authenticated', () => {
        console.log('Successfully authenticated with StreamElements');
    });

    // Handle connection errors
    seSocket.on('unauthorized', (reason) => {
        console.error('StreamElements authentication failed:', reason);
    });

    seSocket.on('disconnect', () => {
        console.warn('Disconnected from StreamElements Socket API');
        // Attempt to reconnect after a delay
        setTimeout(connectToStreamElements, 5000);
    });

    seSocket.on('connect_error', (error) => {
        console.error('StreamElements connection error:', error);
    });

    // Listen for events (tips/donations)
    seSocket.on('event', async (event) => {
        console.log('Received StreamElements event:', JSON.stringify(event, null, 2));

        // Check if it's a tip/donation event
        if (event.type === 'tip') {
            try {
                // Extract donation information
                const userName = event.data.username || 'Anonymous';
                const amount = event.data.amount || 0;
                const currency = event.data.currency || 'USD';
                const message = event.data.message || '';

                console.log(`Received donation from ${userName}: ${amount} ${currency} - Message: ${message}`);
                
                // Extract YouTube URL from donation message
                const youtubeUrl = extractYouTubeUrlFromText(message);

                // If no YouTube URL, thank them for the donation but don't process as song request
                if (!youtubeUrl) {
                    console.warn(`No YouTube URL found in donation message from ${userName}: "${message}"`);
                    sendChatMessage(`Thanks @${userName} for the ${amount} ${currency} donation!`);
                    return;
                }
                
                // Now that we found a YouTube link, check minimum donation amount ($3)
                const MIN_DONATION_AMOUNT = 3;
                if (amount < MIN_DONATION_AMOUNT) {
                    console.log(`Donation with YouTube link from ${userName}, but amount (${amount} ${currency}) is below minimum required (${MIN_DONATION_AMOUNT} ${currency})`);
                    sendChatMessage(`Thanks @${userName} for the ${amount} ${currency} donation! Song requests require a minimum donation of ${MIN_DONATION_AMOUNT} ${currency}.`);
                    return;
                }

                // Create song request from donation
                const songRequest = {
                    id: event.data._id || Date.now().toString(),
                    youtubeUrl: youtubeUrl,
                    requester: userName,
                    timestamp: new Date().toISOString(),
                    requestType: 'donation',
                    donationInfo: {
                        amount: amount,
                        currency: currency
                    },
                    source: 'streamelements'
                };

                console.log(`Processing StreamElements donation request from ${userName} for URL: ${youtubeUrl}`);
                await validateAndAddSong(songRequest);
                
            } catch (error) {
                console.error('Error processing StreamElements donation:', error);
            }
        }
    });
}

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

// Function to check Tailscale connectivity
async function checkTailscaleConnectivity() {
  try {
    console.log(`Checking if Tailscale URL (${CALLBACK_URL}) is accessible...`);
    // Check if the callback URL can be reached from the server
    const response = await fetch(`${CALLBACK_URL}/health-check`, { 
      method: 'GET',
      timeout: 5000 // 5 second timeout
    }).catch(err => {
      console.error(`Fetch error: ${err.message}`);
      return null;
    });
    
    if (!response) {
      console.warn(`❌ Tailscale connectivity check failed - no response from ${CALLBACK_URL}/health-check`);
      console.warn(`  Make sure Tailscale is running and your machine is connected to the Tailscale network.`);
      return false;
    }
    
    if (!response.ok) {
      console.warn(`❌ Tailscale connectivity check failed - status: ${response.status}`);
      return false;
    }
    
    console.log(`✅ Tailscale connectivity check passed: ${CALLBACK_URL} is accessible!`);
    return true;
  } catch (error) {
    console.error(`❌ Tailscale connectivity check error:`, error);
    console.warn(`  Make sure Tailscale is running and your machine is connected to the Tailscale network.`);
    return false;
  }
}

// Start the server and load initial data
async function startServer() {
  await loadHistory(); // Load history before starting watcher/server

  // Check Tailscale connectivity
  if (CALLBACK_URL && CALLBACK_URL.includes('.ts.net')) {
    const tailscaleConnected = await checkTailscaleConnectivity();
    if (!tailscaleConnected) {
      console.warn(`⚠️ Tailscale connectivity issues detected. Twitch EventSub notifications may not work.`);
      console.warn(`⚠️ Check that Tailscale is running and your machine is connected to the Tailscale network.`);
      // Continue anyway to allow local development and testing
    }
  }

  // Try to load the broadcaster's user token
  await loadBroadcasterUserToken();

  // Fetch necessary Twitch Broadcaster ID
  const broadcasterId = await getBroadcasterId();

  // Use the Target Reward ID directly from environment variable
  targetRewardId = TARGET_REWARD_ID; // Assign to the global variable for the webhook handler

  // Create EventSub subscription if IDs were found AND broadcaster has logged in (token exists)
  if (broadcasterId && targetRewardId) {
      // Check if Callback URL and Secret are also present
      if (!CALLBACK_URL || !EVENTSUB_SECRET) {
          console.error("CALLBACK_URL or EVENTSUB_SECRET missing in .env. Cannot create EventSub subscription.");
      } else {
        // Create subscription with App Token
        console.log("Proceeding to create subscription with App Token...");
        await createEventSubSubscription(broadcasterId, targetRewardId);
      }
  } else {
      console.error(`Could not find necessary IDs (Broadcaster: ${broadcasterId}, Reward: ${targetRewardId}), EventSub subscription skipped.`);
  }

  // Connect to StreamElements Socket API for donation events
  connectToStreamElements();

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

  // Use the custom HTTP server for listening
  // Explicitly bind to 0.0.0.0 to allow access from all interfaces
  customHttpServer.listen(SOCKET_PORT, '0.0.0.0', () => {
      console.log(`HTTP/Socket.IO server running at http://0.0.0.0:${SOCKET_PORT}/`)
      console.log(`EventSub expecting requests at ${CALLBACK_URL}/twitch/eventsub`);
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

// --- NEW: Twitch EventSub Webhook Verification Middleware ---
function verifyTwitchSignature(req, reqBodyBuffer) {
    const messageId = req.headers['twitch-eventsub-message-id'];
    const timestamp = req.headers['twitch-eventsub-message-timestamp'];
    const signature = req.headers['twitch-eventsub-message-signature'];

    if (!messageId || !timestamp || !signature) {
        console.warn('Missing Twitch signature headers');
        return false;
    }

    const computedSignature = 'sha256=' + crypto.createHmac('sha256', EVENTSUB_SECRET)
        .update(messageId + timestamp + reqBodyBuffer)
        .digest('hex');

    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(computedSignature))) {
        console.warn('Twitch signature validation failed!');
        return false;
    }
    console.log('Twitch signature verified.');
    return true;
}

// --- NEW: StreamElements Webhook Verification ---
function verifyStreamElementsSignature(req, reqBodyBuffer) {
    const signature = req.headers['x-signature'];
    
    if (!signature || !SE_WEBHOOK_SECRET) {
        console.warn('Missing StreamElements signature header or webhook secret');
        return false;
    }

    const computedSignature = crypto.createHmac('sha256', SE_WEBHOOK_SECRET)
        .update(reqBodyBuffer)
        .digest('hex');
    
    if (signature !== computedSignature) {
        console.warn('StreamElements signature validation failed!');
        return false;
    }
    console.log('StreamElements signature verified.');
    return true;
}

// --- REVERTED: EventSub Subscription Function - Uses App Token ---
async function createEventSubSubscription(broadcasterId, rewardId) { // <-- Removed userAccessToken parameter
    if (!broadcasterId || !rewardId) {
        console.error("Cannot create subscription: Missing broadcaster or reward ID.");
        return;
    }
    if (!EVENTSUB_SECRET || !CALLBACK_URL) {
         console.error("Cannot create subscription: Missing EVENTSUB_SECRET or CALLBACK_URL.");
        return;
    }
    // REMOVED Check for userAccessToken
    // if (!userAccessToken) {
    //     console.error("Cannot create subscription: Missing Broadcaster User Access Token. Please log in via the website.");
    //     return; 
    // }

    console.log(`Attempting to create EventSub subscription for reward ${rewardId} using App Token...`);
    // Get the App Access Token for this call
    const appAccessToken = await getTwitchAppAccessToken();
    if (!appAccessToken) {
        console.error("Cannot create subscription: Failed to get App Access Token.");
        return;
    }

    const body = {
        type: "channel.channel_points_custom_reward_redemption.add",
        version: "1",
        condition: {
            broadcaster_user_id: broadcasterId,
            reward_id: rewardId // Only subscribe to the specific reward
        },
        transport: {
            method: "webhook",
            callback: CALLBACK_URL + '/twitch/eventsub', // Ensure this matches the endpoint path
            secret: EVENTSUB_SECRET
        }
    };

    try {
        const response = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
            method: 'POST',
            body: JSON.stringify(body),
            headers: {
                'Client-ID': TWITCH_CLIENT_ID,
                'Authorization': `Bearer ${appAccessToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
             // Check for 409 Conflict (Subscription already exists) - often safe to ignore
             if (response.status === 409) {
                console.warn(`EventSub subscription likely already exists (Status 409). ${errorText}`);
                // Optional: Query existing subscriptions and delete/recreate if needed,
                // or just assume it's okay if it exists. For simplicity, we'll proceed.
            } else {
                throw new Error(`Subscription request failed with status ${response.status}: ${errorText}`);
            }
        } else {
             const data = await response.json();
             console.log("Successfully created/verified EventSub subscription:", data);
             // You might want to store data.data[0].id (the subscription ID) if you plan to manage/delete it later
        }

    } catch (error) {
        console.error("Error creating EventSub subscription:", error);
    }
}

// --- NEW: Regex to find YouTube URL in text ---
function extractYouTubeUrlFromText(text) {
    if (!text) return null;
    // Basic regex to find YouTube watch URLs or short URLs
    const regex = /(https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+))/i;
    const match = text.match(regex);
    return match ? match[0] : null; // Return the full matched URL
}

// --- NEW: Function to load Broadcaster User Token from file ---
async function loadBroadcasterUserToken() {
    console.log(`Attempting to load broadcaster user token from ${userTokenFilePath}...`);
    try {
        const data = await readFile(userTokenFilePath, 'utf-8');
        const tokenData = JSON.parse(data);
        // Basic validation: Check if token exists and maybe if it has expired
        if (tokenData && tokenData.access_token) {
            // Optional: Check expiry (add a buffer, e.g., 5 minutes)
            if (tokenData.expires_at && tokenData.expires_at < (Date.now() + 5 * 60 * 1000)) {
                console.warn(`Broadcaster user token found in ${userTokenFilePath} has expired or will expire soon.`);
                 // TODO: Implement refresh token logic here if needed later
                 broadcasterUserAccessToken = null; // Don't use expired token
                 return false;
            }
            console.log("Successfully loaded broadcaster user token.");
            broadcasterUserAccessToken = tokenData.access_token;
            return true;
        } else {
            console.warn(`Invalid token data structure found in ${userTokenFilePath}.`);
            broadcasterUserAccessToken = null;
            return false;
        }
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.warn(`Broadcaster user token file not found: ${userTokenFilePath}. Broadcaster needs to log in via website.`);
        } else {
            console.error(`Error loading broadcaster user token from ${userTokenFilePath}:`, error);
        }
        broadcasterUserAccessToken = null;
        return false;
    }
}

// --- MODIFIED: HTTP Server Request Handler ---
const customHttpServer = createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const { pathname } = parsedUrl;
    const method = req.method;

    // Simple health check endpoint for Tailscale connectivity testing
    if (pathname === '/health-check' && method === 'GET') {
        console.log(`[${new Date().toISOString()}] Received health check request`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', server: 'twitch-integration-server' }));
        return;
    }

    // Route for Twitch EventSub Webhook
    if (pathname === '/twitch/eventsub' && method === 'POST') {
        console.log(`[${new Date().toISOString()}] Received POST request on /twitch/eventsub`);
        console.log(`Headers: ${JSON.stringify(req.headers, null, 2)}`);
        
        let rawBody = [];
        req.on('data', (chunk) => {
            rawBody.push(chunk);
        }).on('end', async () => {
            const bodyBuffer = Buffer.concat(rawBody);
            console.log(`Request body: ${bodyBuffer.toString('utf-8')}`);

            // 1. Verify Signature
            if (!verifyTwitchSignature(req, bodyBuffer)) {
                console.error('❌ Signature validation failed - this could mean:');
                console.error('   1. The request is not from Twitch');
                console.error('   2. The EVENTSUB_SECRET in .env does not match the one used when creating the subscription');
                console.error('   3. The request payload was tampered with during transmission');
                res.writeHead(403);
                res.end("Signature validation failed.");
                return;
            }

            const bodyString = bodyBuffer.toString('utf-8');
            const notification = JSON.parse(bodyString);
            const messageType = req.headers['twitch-eventsub-message-type'];

            // 2. Handle Challenge Request
            if (messageType === 'webhook_callback_verification') {
                console.log('Received Twitch webhook verification challenge.');
                res.writeHead(200, { 'Content-Type': 'text/plain' });
                res.end(notification.challenge); // Send challenge back
                console.log('Responded to challenge.');
                return;
            }

            // 3. Handle Notification Request
            if (messageType === 'notification') {
                console.log('Received Twitch notification:', JSON.stringify(notification.event, null, 2));
                const { event, subscription } = notification;

                // Check if it's the correct event type and reward ID
                if (targetRewardId && 
                    subscription.type === 'channel.channel_points_custom_reward_redemption.add' &&
                    event.reward.id === targetRewardId) {

                    // Extract needed info
                    const youtubeUrl = extractYouTubeUrlFromText(event.user_input);
                    const requester = event.user_name; // Display Name
                    const requesterLogin = event.user_login; // Login Name

                    if (!youtubeUrl) {
                        console.warn(`No YouTube URL found in redemption input from ${requester}: "${event.user_input}"`);
                         // Send a failure message to Twitch chat
                         sendChatMessage(`@${requester}, I couldn't find a YouTube link in your channel point redemption message!`);
                        // Respond 200 OK to Twitch anyway, as we acknowledged the event
                        res.writeHead(200);
                        res.end("OK");
                        return;
                    }

                    // Construct the request object for validateAndAddSong
                    const songRequest = {
                        id: event.id, // Use the redemption event ID
                        youtubeUrl: youtubeUrl,
                        requester: requester,
                        timestamp: event.redeemed_at || new Date().toISOString(),
                        requestType: 'channelPoint',
                        channelPointReward: {
                            id: event.reward.id,
                            title: event.reward.title,
                            cost: event.reward.cost,
                            prompt: event.reward.prompt
                        },
                        source: 'eventsub' // Indicate the source
                    };

                    console.log(`Processing EventSub request from ${requester} for URL: ${youtubeUrl}`);
                    // Call the existing validation function
                    await validateAndAddSong(songRequest);

                } else {
                     console.log(`Received notification for ignored type (${subscription.type}) or reward ID (${event.reward?.id}).`);
                }

                // Respond 200 OK to Twitch to acknowledge receipt
                res.writeHead(200);
                res.end("OK");
                return;
            }

            // Handle other message types if needed (e.g., 'revocation')
             console.log(`Received unhandled message type: ${messageType}`);
             res.writeHead(200); // Acknowledge receipt even if not fully handled
             res.end("OK");


        });
    } else if (pathname === '/streamelements/webhook' && method === 'POST') {
        console.log(`[${new Date().toISOString()}] Received POST request on /streamelements/webhook`);
        console.log(`Headers: ${JSON.stringify(req.headers, null, 2)}`);
        
        let rawBody = [];
        req.on('data', (chunk) => {
            rawBody.push(chunk);
        }).on('end', async () => {
            const bodyBuffer = Buffer.concat(rawBody);
            console.log(`StreamElements request body: ${bodyBuffer.toString('utf-8')}`);

            // 1. Verify signature if secret is configured
            if (SE_WEBHOOK_SECRET) {
                if (!verifyStreamElementsSignature(req, bodyBuffer)) {
                    console.error('❌ StreamElements signature validation failed');
                    res.writeHead(403);
                    res.end("Signature validation failed");
                    return;
                }
            } else {
                console.warn('⚠️ StreamElements webhook secret not configured, skipping signature verification');
            }

            try {
                const bodyString = bodyBuffer.toString('utf-8');
                const event = JSON.parse(bodyString);
                
                // 2. Verify it's a donation event
                if (event.type !== 'tip' && event.type !== 'donation') {
                    console.log(`Ignoring non-donation StreamElements event: ${event.type}`);
                    res.writeHead(200);
                    res.end("OK");
                    return;
                }
                
                console.log('Received StreamElements donation event:', JSON.stringify(event, null, 2));
                
                // 3. Extract data from the donation
                const userName = event.data.username || 'Anonymous';
                const amount = event.data.amount || 0;
                const currency = event.data.currency || 'USD';
                const message = event.data.message || '';
                
                // 4. Check minimum donation amount ($3)
                const MIN_DONATION_AMOUNT = 3;
                if (amount < MIN_DONATION_AMOUNT) {
                    console.log(`Donation amount (${amount} ${currency}) is below minimum required (${MIN_DONATION_AMOUNT} ${currency})`);
                    sendChatMessage(`Thanks @${userName} for the ${amount} ${currency} donation! Song requests require a minimum donation of ${MIN_DONATION_AMOUNT} ${currency}.`);
                    res.writeHead(200);
                    res.end("OK");
                    return;
                }
                
                // 5. Extract YouTube URL from the donation message
                const youtubeUrl = extractYouTubeUrlFromText(message);
                
                if (!youtubeUrl) {
                    console.warn(`No YouTube URL found in donation message from ${userName}: "${message}"`);
                    sendChatMessage(`Thanks @${userName} for the ${amount} ${currency} donation! To request a song, include a YouTube link in your donation message.`);
                    res.writeHead(200);
                    res.end("OK");
                    return;
                }
                
                // 6. Create song request from donation
                const songRequest = {
                    id: event.data._id || Date.now().toString(),
                    youtubeUrl: youtubeUrl,
                    requester: userName,
                    timestamp: event.data.createdAt || new Date().toISOString(),
                    requestType: 'donation',
                    donationInfo: {
                        amount: amount,
                        currency: currency
                    },
                    source: 'streamelements'
                };
                
                console.log(`Processing StreamElements donation request from ${userName} for URL: ${youtubeUrl}`);
                await validateAndAddSong(songRequest);
                
                // 7. Respond to StreamElements
                res.writeHead(200);
                res.end("OK");
                
            } catch (error) {
                console.error('Error processing StreamElements webhook:', error);
                res.writeHead(400);
                res.end("Error processing webhook");
            }
        });
    } else {
        // Default: Not Found or handle other routes if necessary
        res.writeHead(404);
        res.end('Not Found');
    }
});

// Attach Socket.IO to the custom HTTP server
io.attach(customHttpServer); 