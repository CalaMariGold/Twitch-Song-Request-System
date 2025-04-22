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
const chalk = require('chalk')
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
  });

  tmiClient.on('connected', (addr, port) => {
    console.log(chalk.green(`✅ [Twitch Chat] Connected (${addr}:${port}) in channel #${TWITCH_CHANNEL_NAME}`));
    // Send startup message for the streamer
    sendChatMessage(`✅ Song Request Bot connected to channel ${TWITCH_CHANNEL_NAME}.`);
  });

  tmiClient.on('disconnected', (reason) => {
    console.log(chalk.yellow(`* [Twitch Chat] Disconnected: ${reason}`));
  });

  tmiClient.connect().catch(err => console.error(chalk.red('[Twitch Chat] Connection error:'), err));
}

// Function to send a message to Twitch chat
function sendChatMessage(message) {
  if (tmiClient && tmiClient.readyState() === 'OPEN') {
    tmiClient.say(TWITCH_CHANNEL_NAME, message)
      .then(() => {
      })
      .catch((err) => {
        console.error(chalk.red(`[Twitch Chat] Error sending message: ${err}`));
      });
  } else {
    console.warn(chalk.yellow('[Twitch Chat] Could not send message, client not connected or configured.'));
  }
}

// Function to get Twitch App Access Token
async function getTwitchAppAccessToken() {
  if (twitchAppAccessToken && twitchTokenExpiry && twitchTokenExpiry > Date.now()) {
    return twitchAppAccessToken;
  }

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
    console.log(chalk.green('✅ [Auth] Successfully fetched new Twitch App Access Token.'));
    return twitchAppAccessToken;
  } catch (error) {
    console.error(chalk.red('[Auth] Error fetching Twitch App Access Token:'), error);
    twitchAppAccessToken = null; // Reset token on error
    twitchTokenExpiry = null;
    throw error; // Re-throw error to indicate failure
  }
}

// Function to get Twitch User Profile
async function getTwitchUser(username) {
  if (!username) {
    console.warn(chalk.yellow('[Twitch API] getTwitchUser called with no username.'));
    return null; // Return null if no username provided
  }
  if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET) {
    console.error(chalk.red('[Twitch API] Client ID or Secret not configured in .env'));
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
            console.warn(chalk.yellow('[Twitch API] Returned 401, attempting to refresh app token...'));
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
    console.error(chalk.red(`[Twitch API] Error fetching user profile for ${username}:`), error);
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

// Function to load history from file
async function loadHistory() {
  try {
    const data = await readFile(historyFilePath, 'utf-8');
    state.history = JSON.parse(data);
    console.log(chalk.blue(`[History] Loaded ${state.history.length} items from ${path.basename(historyFilePath)}`));
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log(chalk.yellow(`[History] File not found (${path.basename(historyFilePath)}), starting empty.`));
      state.history = [];
    } else {
      console.error(chalk.red('[History] Error loading file:'), error);
      state.history = []; // Start with empty history on error
    }
  }
}

// Function to save history to file
async function saveHistory() {
  try {
    await writeFile(historyFilePath, JSON.stringify(state.history, null, 2), 'utf-8');
  } catch (error) {
    console.error(chalk.red('[History] Error saving file:'), error);
  }
}

// --- Function to validate and add a song request ---
async function validateAndAddSong(request) {

  // Validate essential request data
  if (!request || !request.youtubeUrl || !request.requester || !request.requestType) {
      console.error(chalk.red('[Queue] Invalid request object received (missing url, requester, or requestType):'), request);
      return;
  }

  // Check if requester is blocked
  const blockedUsers = state.blockedUsers || [];
  const isBlocked = blockedUsers.some(user => user.username.toLowerCase() === request.requester.toLowerCase());
  if (isBlocked) {
      console.log(chalk.yellow(`[Queue] Request from blocked user ${request.requester} - rejecting`));
      sendChatMessage(`@${request.requester}, you are currently blocked from making song requests.`);
      return; // Stop processing
  }

  // --- Check User Queue Limit for Channel Point Requests ---
  if (request.requestType === 'channelPoint') {
    const existingRequest = state.queue.find(song => song.requester.toLowerCase() === request.requester.toLowerCase());
    if (existingRequest) {
      console.log(chalk.yellow(`[Queue] User ${request.requester} already has a song in the queue - rejecting channel point request`));
      sendChatMessage(`@${request.requester}, you already have a song in the queue. Please wait for it to play.`);
      return; // Stop processing
    }
  }

  // --- Always fetch Twitch Profile for Avatar AND Login Name ---
  let requesterAvatar = '/placeholder.svg?height=32&width=32'; // Default placeholder
  let requesterLogin = request.requester.toLowerCase(); // Default to lowercase display name for URL
  let twitchProfile = null; // Store profile to get login name later
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

      // Check song duration based on request type
      const MAX_CHANNEL_POINT_DURATION_SECONDS = 300; // 5 minutes
      const MAX_DONATION_DURATION_SECONDS = 600; // 10 minutes

      if (request.requestType === 'channelPoint' && videoDetails.durationSeconds > MAX_CHANNEL_POINT_DURATION_SECONDS) {
          console.log(chalk.yellow(`[Queue] Channel Point request duration (${videoDetails.durationSeconds}s) exceeds limit (${MAX_CHANNEL_POINT_DURATION_SECONDS}s) - rejecting "${videoDetails.title}"`));
          sendChatMessage(`@${request.requester} Sorry, channel point songs cannot be longer than 5 minutes. Donate for priority and up to 10 minute songs.`);
          return; // Stop processing this request
      }
      if (request.requestType === 'donation' && videoDetails.durationSeconds > MAX_DONATION_DURATION_SECONDS) {
          console.log(chalk.yellow(`[Queue] Donation request duration (${videoDetails.durationSeconds}s) exceeds limit (${MAX_DONATION_DURATION_SECONDS}s) - rejecting "${videoDetails.title}"`));
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
          console.log(chalk.yellow(`[Blacklist] Song "${videoDetails.title}" contains term "${blacklistedSong.term}" - rejecting`));
          sendChatMessage(`@${request.requester}, sorry, the song "${videoDetails.title}" is currently blacklisted.`);
          return;
      }

      const blacklistedArtist = blacklist.find(item =>
          item.type === 'artist' && artistName.includes(item.term.toLowerCase())
      );
      if (blacklistedArtist) {
          console.log(chalk.yellow(`[Blacklist] Artist "${videoDetails.channelTitle}" contains term "${blacklistedArtist.term}" - rejecting`));
           sendChatMessage(`@${request.requester}, sorry, songs by "${videoDetails.channelTitle}" are currently blacklisted.`);
          return;
      }

      const blacklistedKeyword = blacklist.find(item =>
          item.type === 'keyword' &&
          (songTitle.includes(item.term.toLowerCase()) || artistName.includes(item.term.toLowerCase()))
      );
      if (blacklistedKeyword) {
          console.log(chalk.yellow(`[Blacklist] Song contains keyword "${blacklistedKeyword.term}" - rejecting "${videoDetails.title}"`));
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
      
      // Insert the song
      state.queue.splice(insertIndex, 0, songRequest);

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
// --- END NEW Function ---

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log(chalk.blue(`[Socket.IO] Client connected: ${socket.id}`))
    
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
        console.log(chalk.grey(`[Socket.IO] Received ${updatedQueue} event`));
        state.queue = updatedQueue
        socket.broadcast.emit('queueUpdate', state.queue) // Inform other clients
        console.log(chalk.magenta('[Admin] Queue updated via socket.'));
    })

    // Handle addSong event
    socket.on('addSong', async (songRequestData) => {
        console.log(chalk.grey(`[Socket.IO] Received ${songRequestData} event`));
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
        state.queue = state.queue.filter(song => song.id !== songId)
        io.emit('queueUpdate', state.queue)
        console.log(chalk.magenta(`[Admin] Song removed via socket: ${songId}`));
    })

    // Handle clear queue
    socket.on('clearQueue', () => {
        state.queue = []
        io.emit('queueUpdate', state.queue)
        console.log(chalk.magenta('[Admin] Queue cleared via socket.'));
    })

    // Handle playback controls
    socket.on('pausePlaying', () => {
        // Emit pause event to clients
        io.emit('playerControl', { action: 'pause' })
        console.log(chalk.magenta('[Admin] Playback paused via socket.'));
    })

    socket.on('resumePlaying', () => {
        // Emit resume event to clients
        io.emit('playerControl', { action: 'resume' })
        console.log(chalk.magenta('[Admin] Playback resumed via socket.'));
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
        console.log(chalk.magenta('[Admin] System reset via socket.'));
    })

    // Handle settings
    socket.on('setAutoplay', (enabled) => {
        state.settings = state.settings || {}
        state.settings.autoplay = enabled
        io.emit('settingsUpdate', state.settings)
        console.log(chalk.magenta(`[Admin] Autoplay set to ${enabled} via socket.`));
    })

    socket.on('setMaxDuration', (minutes) => {
        state.settings = state.settings || {}
        state.settings.maxDuration = minutes
        io.emit('settingsUpdate', state.settings)
        console.log(chalk.magenta(`[Admin] Max Duration set to ${minutes} mins via socket.`));
    })

    // Handle now playing updates
    socket.on('updateNowPlaying', async (song) => {
        let historyUpdated = false;
        const previousSong = state.nowPlaying; // Store previous song

        if (song) {
            // Move current song to history if it exists and is not already the most recent history item
            if (previousSong && (!state.history.length || state.history[0].id !== previousSong.id)) {
                 // Check for duplicates before adding to history
                 if (!state.history.some(historySong => historySong.id === previousSong.id)) {
                     state.history.unshift(previousSong);
                     historyUpdated = true;
                 }
            }
            state.nowPlaying = song
            state.queue = state.queue.filter(s => s.id !== song.id)
            console.log(chalk.yellow(`[Player] Now Playing: "${song.title}" (ID: ${song.id})`));
        } else {
            // Song finished or stopped
            if (previousSong && (!state.history.length || state.history[0].id !== previousSong.id)) {
                // Check for duplicates before adding to history
                if (!state.history.some(historySong => historySong.id === previousSong.id)) {
                    state.history.unshift(previousSong);
                    historyUpdated = true;
                }
            }
            if (previousSong) { // Only log if there *was* a song playing
                console.log(chalk.yellow(`[Player] Playback stopped/finished for: "${previousSong.title}"`));
            }
            state.nowPlaying = null
        }
        
        // Save history if it was updated in this event
        if (historyUpdated) {
          await saveHistory(); // Save whenever history changed
        }

        // Broadcast updates
        io.emit('nowPlaying', state.nowPlaying)
        io.emit('queueUpdate', state.queue)
        // Emit history update if it actually changed
        if (historyUpdated) {
          io.emit('historyUpdate', state.history)
        }
    })

    // Handle blacklist updates
    socket.on('updateBlacklist', (blacklist) => {
        state.blacklist = blacklist
        io.emit('blacklistUpdate', state.blacklist)
        console.log(chalk.magenta(`[Admin] Blacklist updated via socket (${blacklist.length} items).`));
    })

    // Handle blocked users
    socket.on('updateBlockedUsers', (blockedUsers) => {
        state.blockedUsers = blockedUsers
        io.emit('blockedUsersUpdate', state.blockedUsers)
        console.log(chalk.magenta(`[Admin] Blocked users updated via socket (${blockedUsers.length} users).`));
    })

    socket.on('disconnect', () => {
        console.log(chalk.blue(`[Socket.IO] Client disconnected: ${socket.id}`))
    })
})

// StreamElements Socket.io connection
let seSocket = null;

// Function to connect to StreamElements Socket API
function connectToStreamElements() {
    if (!SE_JWT_TOKEN) {
        console.warn(chalk.yellow('[StreamElements] JWT token missing, connection skipped.'));
        return;
    }

    
    // Connect to StreamElements socket server
    seSocket = ioClient.connect('https://realtime.streamelements.com', {
        transports: ['websocket']
    });

    // Connection event handlers
    seSocket.on('connect', () => {
        // Authenticate with JWT
        seSocket.emit('authenticate', {
            method: 'jwt',
            token: SE_JWT_TOKEN
        });
    });

    seSocket.on('authenticated', () => {
        console.log(chalk.green('✅ [StreamElements] Connected and Authenticated. Listening for donations.'));
    });

    // Handle connection errors
    seSocket.on('unauthorized', (reason) => {
        console.error(chalk.red('[StreamElements] Authentication failed:'), reason);
        if(seSocket) seSocket.disconnect();
    });

    seSocket.on('disconnect', () => {
        console.warn(chalk.yellow('[StreamElements] Disconnected. Will attempt reconnect...'));
        // Attempt to reconnect after a delay
        setTimeout(connectToStreamElements, 5000);
    });

    seSocket.on('connect_error', (error) => {
        console.error(chalk.red('[StreamElements] Connection error:'), error);
    });

    // Listen for events (tips/donations)
    seSocket.on('event', async (event) => {

        // Handle Channel Point Redemption events from StreamElements
        // Check if it's a channel point redemption event AND matches the target title
        if (event.type === 'channelPointsRedemption') { 

            const receivedTitle = event.data?.redemption;

            // Check if the received title matches the one configured in .env
            if (!receivedTitle || !TARGET_REWARD_TITLE || receivedTitle !== TARGET_REWARD_TITLE) {
                console.log(chalk.grey(`[StreamElements] Ignored redemption: Title "${receivedTitle || 'N/A'}" does not match TARGET_REWARD_TITLE "${TARGET_REWARD_TITLE || 'Not Set'}".`));
                return; // Ignore this redemption
            }
            
            try {
                const userName = event.data.username || 'Anonymous';
                const userInput = event.data.message || ''; // Get user input (URL) from message field

                console.log(chalk.magenta(`[StreamElements] Received channel point redemption: ${userName} - Reward: "${receivedTitle}" - Input: "${userInput}"`));

                const youtubeUrl = extractYouTubeUrlFromText(userInput);

                if (!youtubeUrl) {
                    console.warn(chalk.yellow(`[StreamElements] No YouTube URL found in redemption from ${userName}: "${userInput}"`));
                    sendChatMessage(`@${userName}, I couldn't find a YouTube link in your '${receivedTitle}' redemption message!`);
                    return; // Don't process further
                }

                 // Create song request object
                 const songRequest = {
                    id: event.data._id || event._id || Date.now().toString(),
                    youtubeUrl: youtubeUrl,
                    requester: userName,
                    timestamp: event.createdAt || new Date().toISOString(),
                    requestType: 'channelPoint',
                    channelPointReward: { 
                        title: receivedTitle
                    },
                    source: 'streamelements_redemption'
                };

                await validateAndAddSong(songRequest);

             } catch (error) {
                 console.error(chalk.red('[StreamElements] Error processing channel point redemption:'), error);
                 sendChatMessage(`@${userName}, sorry, there was an error processing your song request.`);
             }
             return; // Stop processing this event here
        }
        // --- END Channel Point Handling ---

        // Check if it's a tip/donation event
        if (event.type === 'tip') {
            try {
                // Extract donation information
                const userName = event.data.username || 'Anonymous';
                const amount = event.data.amount || 0;
                const currency = event.data.currency || 'USD';
                const message = event.data.message || '';

                console.log(chalk.magenta(`[StreamElements] Received donation: ${userName} - ${amount} ${currency} - Msg: "${message}"`));
                
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

                await validateAndAddSong(songRequest);
                
            } catch (error) {
                console.error(chalk.red('[StreamElements] Error processing donation:'), error);
                sendChatMessage(`@${userName}, sorry, there was an error processing your song request.`);
            }
        }
    });
}

// Function to gracefully shutdown and save state
function shutdown(signal) {
  console.log(chalk.yellow(`Received ${signal}. Shutting down server...`));
  if (state.nowPlaying) {
    console.log(chalk.yellow('Moving now playing song to history before shutdown:'), state.nowPlaying.id);
    // Avoid duplicates if shutdown signal comes right after updateNowPlaying(null)
    if (!state.history.length || state.history[0].id !== state.nowPlaying.id) {
       state.history.unshift(state.nowPlaying);
    }
    state.nowPlaying = null; // Clear now playing as it's moved/finished
  }
  try {
      // Use synchronous write for shutdown handler
      writeFileSync(historyFilePath, JSON.stringify(state.history, null, 2), 'utf-8');
      console.log(chalk.green('[Server] State saved. Goodbye!'));
      process.exit(0);
  } catch(err) {
      console.error(chalk.red('[History] Error saving during shutdown:'), err);
      process.exit(1);
  }
}

// Listen for termination signals
process.on('SIGINT', () => shutdown('SIGINT')); // Ctrl+C
process.on('SIGTERM', () => shutdown('SIGTERM')); // kill command

// Start the server and load initial data
async function startServer() {
  await loadHistory(); // Load history before starting watcher/server

  // Connect to StreamElements Socket API for donation/redemption events
  connectToStreamElements();

  // Use the custom HTTP server for listening
  // Explicitly bind to 0.0.0.0 to allow access from all interfaces
  customHttpServer.listen(SOCKET_PORT, '0.0.0.0', async () => {
      console.log(chalk.green(`🚀 Server running at http://0.0.0.0:${SOCKET_PORT}/`))
      console.log(chalk.blue("   Initializing subsystems..."));
  })
}

startServer();

// Helper functions
function extractVideoId(url) {
    if (!url) {
        console.error(chalk.red('[Util] extractVideoId called with undefined/empty URL'))
        return null
    }
    const match = url.match(/(?:youtube\.com\/watch\?v=|youtu.be\/)([^&\n?#]+)/)
    const result = match ? match[1] : null
    return result
}

async function fetchYouTubeDetails(videoId) {
    try {
        if (!process.env.YOUTUBE_API_KEY) {
            console.error(chalk.red('[YouTube] API key not configured in environment variables'))
            throw new Error('YouTube API key not configured')
        }


        const apiUrl = `https://www.googleapis.com/youtube/v3/videos?id=${videoId}&part=snippet,contentDetails&key=${process.env.YOUTUBE_API_KEY}`
        
        const response = await fetch(
            apiUrl,
            { headers: { 'Accept': 'application/json' } }
        )
        
        
        if (!response.ok) {
            console.error(chalk.red(`[YouTube] API error status: ${response.status} ${response.statusText}`))
            throw new Error(`YouTube API error: ${response.statusText}`)
        }

        const data = await response.json()
        
        if (!data.items?.[0]) {
            console.error(chalk.red('[YouTube] Video not found in API response for ID:'), videoId)
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

// Function to parse ISO 8601 duration to seconds
function parseIsoDuration(isoDuration) {
    const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
    if (!match) return 0
    
    const hours = match[1] ? parseInt(match[1]) : 0
    const minutes = match[2] ? parseInt(match[2]) : 0
    const seconds = match[3] ? parseInt(match[3]) : 0
    
    return hours * 3600 + minutes * 60 + seconds
}

// Regex to find YouTube URL in text
function extractYouTubeUrlFromText(text) {
    if (!text) return null;
    // Basic regex to find YouTube watch URLs or short URLs
    const regex = /(https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+))/i;
    const match = text.match(regex);
    return match ? match[0] : null; // Return the full matched URL
}

// HTTP Server Request Handler
const customHttpServer = createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const { pathname } = parsedUrl;
    const method = req.method;

    // Simple health check endpoint
    if (pathname === '/health-check' && method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', server: 'twitch-integration-server' }));
        return;
    }

    // Default: Not Found or handle other routes if necessary
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found - Use Socket.IO or /health-check');
    
});

// Attach Socket.IO to the custom HTTP server
io.attach(customHttpServer); 