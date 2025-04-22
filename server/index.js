const { createServer } = require('http')
const { Server } = require('socket.io')
const fetch = require('node-fetch')
const tmi = require('tmi.js')
const chalk = require('chalk')
const path = require('path')
const Database = require('better-sqlite3')
require('dotenv').config()

const SOCKET_PORT = 3002
const httpServer = createServer()
const dbPath = path.join(__dirname, '..', 'data', 'songRequestSystem.db');

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

// --- SQLite Database Setup ---
let db;
try {
    db = new Database(dbPath, { /* verbose: console.log */ }); // Connect to DB
    console.log(chalk.blue(`[Database] Connected to SQLite database at ${dbPath}`));

    // Enable WAL mode for better concurrency
    db.pragma('journal_mode = WAL');

    // Schema Setup (Create tables if they don't exist)
    const createHistoryTableStmt = `
        CREATE TABLE IF NOT EXISTS song_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            youtubeUrl TEXT NOT NULL,
            title TEXT,
            artist TEXT,
            channelId TEXT,
            durationSeconds INTEGER,
            requester TEXT NOT NULL,
            requesterLogin TEXT,
            requesterAvatar TEXT,
            thumbnailUrl TEXT,
            requestType TEXT NOT NULL, -- 'channelPoint' or 'donation'
            playedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            completedAt TIMESTAMP
        );
    `;
    db.exec(createHistoryTableStmt);

    const createNowPlayingTableStmt = `
        CREATE TABLE IF NOT EXISTS now_playing (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            youtubeUrl TEXT NOT NULL,
            title TEXT,
            artist TEXT,
            channelId TEXT,
            durationSeconds INTEGER,
            requester TEXT NOT NULL,
            requesterLogin TEXT,
            requesterAvatar TEXT,
            thumbnailUrl TEXT,
            requestType TEXT NOT NULL, -- 'channelPoint' or 'donation'
            startedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `;
    db.exec(createNowPlayingTableStmt);

    const createActiveQueueTableStmt = `
        CREATE TABLE IF NOT EXISTS active_queue (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            youtubeUrl TEXT NOT NULL UNIQUE,
            title TEXT,
            artist TEXT,
            channelId TEXT,
            durationSeconds INTEGER,
            requester TEXT NOT NULL,
            requesterLogin TEXT,
            requesterAvatar TEXT,
            thumbnailUrl TEXT,
            requestType TEXT NOT NULL, -- 'channelPoint' or 'donation'
            priority INTEGER DEFAULT 0, -- e.g., 0=channelPoint, 1=donation
            addedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `;
    db.exec(createActiveQueueTableStmt);

    const createSettingsTableStmt = `
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT -- Store complex values as JSON strings
        );
    `;
    db.exec(createSettingsTableStmt);

    const createBlacklistTableStmt = `
        CREATE TABLE IF NOT EXISTS blacklist (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pattern TEXT NOT NULL UNIQUE,
            type TEXT NOT NULL, -- song, artist, keyword
            addedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `;
    db.exec(createBlacklistTableStmt);

    const createBlockedUsersTableStmt = `
        CREATE TABLE IF NOT EXISTS blocked_users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE COLLATE NOCASE, -- Store usernames case-insensitively
            addedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `;
    db.exec(createBlockedUsersTableStmt);

    // Index Creation
    const createHistoryIndexes = `
        CREATE INDEX IF NOT EXISTS idx_requester ON song_history (requester);
        CREATE INDEX IF NOT EXISTS idx_artist ON song_history (artist);
        CREATE INDEX IF NOT EXISTS idx_title ON song_history (title);
        CREATE INDEX IF NOT EXISTS idx_playedAt ON song_history (playedAt);
    `;
    db.exec(createHistoryIndexes);

    const createQueueIndexes = `
        CREATE INDEX IF NOT EXISTS idx_queue_order ON active_queue (priority DESC, addedAt ASC);
    `;
    db.exec(createQueueIndexes);

    console.log(chalk.blue('[Database] Schema and indexes verified/created.'));

} catch (err) {
    console.error(chalk.red('[Database] Failed to connect or initialize SQLite database:'), err);
    process.exit(1); // Exit if DB connection fails
}
// --- END SQLite Database Setup ---

// --- SQLite Prepared Statements ---
let insertHistoryStmt, insertQueueStmt, deleteQueueStmt, clearQueueStmt;
let saveSettingStmt, addBlacklistStmt, removeBlacklistStmt, addBlockedUserStmt, removeBlockedUserStmt;
let saveNowPlayingStmt, clearNowPlayingStmt;

try {
    // History & Queue (define now, use later)
    insertHistoryStmt = db.prepare(`
        INSERT INTO song_history (
            youtubeUrl, title, artist, channelId, durationSeconds,
            requester, requesterLogin, requesterAvatar, thumbnailUrl, requestType, completedAt
        ) VALUES (
            @youtubeUrl, @title, @artist, @channelId, @durationSeconds,
            @requester, @requesterLogin, @requesterAvatar, @thumbnailUrl, @requestType, CURRENT_TIMESTAMP
        )
    `);
    insertQueueStmt = db.prepare(`
        INSERT INTO active_queue (
            youtubeUrl, title, artist, channelId, durationSeconds,
            requester, requesterLogin, requesterAvatar, thumbnailUrl, requestType, priority
        ) VALUES (
            @youtubeUrl, @title, @artist, @channelId, @durationSeconds,
            @requester, @requesterLogin, @requesterAvatar, @thumbnailUrl, @requestType, @priority
        )
    `);
    deleteQueueStmt = db.prepare('DELETE FROM active_queue WHERE youtubeUrl = ?');
    clearQueueStmt = db.prepare('DELETE FROM active_queue');

    // Now Playing
    saveNowPlayingStmt = db.prepare(`
        INSERT OR REPLACE INTO now_playing (
            youtubeUrl, title, artist, channelId, durationSeconds,
            requester, requesterLogin, requesterAvatar, thumbnailUrl, requestType, startedAt
        ) VALUES (
            @youtubeUrl, @title, @artist, @channelId, @durationSeconds,
            @requester, @requesterLogin, @requesterAvatar, @thumbnailUrl, @requestType, CURRENT_TIMESTAMP
        )
    `);
    clearNowPlayingStmt = db.prepare('DELETE FROM now_playing');

    // Settings
    saveSettingStmt = db.prepare(`
        INSERT OR REPLACE INTO settings (key, value) VALUES (@key, @value)
    `);

    // Blacklist
    addBlacklistStmt = db.prepare('INSERT OR IGNORE INTO blacklist (pattern, type) VALUES (?, ?)');
    removeBlacklistStmt = db.prepare('DELETE FROM blacklist WHERE pattern = ? AND type = ?');

    // Blocked Users
    addBlockedUserStmt = db.prepare('INSERT OR IGNORE INTO blocked_users (username) VALUES (?)');
    removeBlockedUserStmt = db.prepare('DELETE FROM blocked_users WHERE username = ?');

    console.log(chalk.blue('[Database] Prepared statements created.'));

} catch (err) {
    console.error(chalk.red('[Database] Failed to prepare SQL statements:'), err);
    process.exit(1); // Exit if statement preparation fails
}
// --- END SQLite Prepared Statements ---

// Server state - Initial state will be loaded from DB
const state = {
  queue: [], // Will be loaded from active_queue table
  history: [], // History loading from DB deferred for now
  nowPlaying: null,
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

// Function to load initial state from Database
function loadInitialState() {
    console.log(chalk.blue('[Database] Loading initial state...'));
    let loadedState = { queue: [], settings: {}, blacklist: [], blockedUsers: [], nowPlaying: null };
    try {
        // Load Active Queue
        const loadQueueStmt = db.prepare(`
            SELECT id, youtubeUrl, title, artist, channelId, durationSeconds,
                   requester, requesterLogin, requesterAvatar, thumbnailUrl, requestType, addedAt
            FROM active_queue ORDER BY priority DESC, addedAt ASC
        `);
        const queueRows = loadQueueStmt.all();
        // Map DB columns to state.queue song format (adjust if necessary)
        loadedState.queue = queueRows.map(row => ({
             id: row.id.toString(), // Ensure ID is string like original state
             youtubeUrl: row.youtubeUrl,
             title: row.title,
             artist: row.artist,
             channelId: row.channelId,
             duration: row.durationSeconds ? formatDurationFromSeconds(row.durationSeconds) : '0:00', // Format duration string
             durationSeconds: row.durationSeconds,
             requester: row.requester,
             requesterLogin: row.requesterLogin,
             requesterAvatar: row.requesterAvatar,
             thumbnailUrl: row.thumbnailUrl,
             timestamp: row.addedAt, // Use addedAt as timestamp
             requestType: row.requestType,
             source: 'database', // Indicate source
             // priority is DB-only concept for ordering, not needed in state item
        }));
        console.log(chalk.blue(`[Database] Loaded ${loadedState.queue.length} songs into the active queue.`));

        // Load Now Playing Song
        loadedState.nowPlaying = loadNowPlayingFromDB();

        // Load Settings
        const loadSettingsStmt = db.prepare('SELECT key, value FROM settings');
        const settingsRows = loadSettingsStmt.all();
        loadedState.settings = settingsRows.reduce((acc, row) => {
            try {
                acc[row.key] = JSON.parse(row.value);
            } catch (e) {
                acc[row.key] = row.value; // Fallback to raw value if not JSON
            }
            return acc;
        }, {});
        console.log(chalk.blue(`[Database] Loaded ${Object.keys(loadedState.settings).length} settings.`));

        // Load Blacklist - adapting to new schema with 'type'
        const loadBlacklistStmt = db.prepare('SELECT id, pattern, type, addedAt FROM blacklist');
        const blacklistRows = loadBlacklistStmt.all(); // Added detailed logging
        // Map DB columns to state.blacklist format
        loadedState.blacklist = blacklistRows.map(row => ({
            id: row.id.toString(), // Use DB ID
            term: row.pattern, // 'pattern' in DB is 'term' in state
            type: row.type,
            addedAt: row.addedAt
        }));
        console.log(chalk.blue(`[Database] Loaded ${loadedState.blacklist.length} blacklist items.`));

        // Load Blocked Users - adapting to new schema with 'username'
        const loadBlockedUsersStmt = db.prepare('SELECT id, username, addedAt FROM blocked_users');
        const blockedUserRows = loadBlockedUsersStmt.all(); // Added detailed logging
         // Map DB columns to state.blockedUsers format
        loadedState.blockedUsers = blockedUserRows.map(row => ({
            id: row.id.toString(), // Use DB ID
            username: row.username,
            addedAt: row.addedAt
        }));
        console.log(chalk.blue(`[Database] Loaded ${loadedState.blockedUsers.length} blocked users.`));

    } catch (err) {
        console.error(chalk.red('[Database] Error loading initial state:'), err);
        // Return empty state on error to allow server to start, but log the issue
    }
    return loadedState;
}

// --- Database Update Functions ---

function saveSetting(key, value) {
    try {
        const valueToStore = typeof value === 'string' ? value : JSON.stringify(value);
        saveSettingStmt.run({ key, value: valueToStore });
        console.log(chalk.grey(`[DB Write] Saved setting: ${key} = ${valueToStore}`));
    } catch (err) {
        console.error(chalk.red(`[Database] Failed to save setting ${key}:`), err);
    }
}

function addBlacklistPattern(pattern, type) {
    try {
        const result = addBlacklistStmt.run(pattern, type);
        if (result.changes > 0) {
            console.log(chalk.grey(`[DB Write] Added blacklist pattern: ${pattern} (Type: ${type})`));
        }
    } catch (err) {
        console.error(chalk.red(`[Database] Failed to add blacklist pattern ${pattern}:`), err);
    }
}

function removeBlacklistPattern(pattern, type) {
    try {
        const result = removeBlacklistStmt.run(pattern, type);
        if (result.changes > 0) {
            console.log(chalk.grey(`[DB Write] Removed blacklist pattern: ${pattern} (Type: ${type})`));
        }
    } catch (err) {
        console.error(chalk.red(`[Database] Failed to remove blacklist pattern ${pattern}:`), err);
    }
}

function addBlockedUser(username) {
    try {
        const result = addBlockedUserStmt.run(username);
        if (result.changes > 0) {
            console.log(chalk.grey(`[DB Write] Added blocked user: ${username}`));
        }
    } catch (err) {
        console.error(chalk.red(`[Database] Failed to add blocked user ${username}:`), err);
    }
}

function removeBlockedUser(username) {
    try {
        const result = removeBlockedUserStmt.run(username);
        if (result.changes > 0) {
            console.log(chalk.grey(`[DB Write] Removed blocked user: ${username}`));
        }
    } catch (err) {
        console.error(chalk.red(`[Database] Failed to remove blocked user ${username}:`), err);
    }
}

// --- END Database Update Functions ---

// --- Database Queue Functions ---

function addSongToDbQueue(song) {
    try {
        // Determine priority (e.g., higher value for donations)
        const priority = song.requestType === 'donation' ? 1 : 0;
        // Use the prepared statement defined earlier
        insertQueueStmt.run({
            youtubeUrl: song.youtubeUrl,
            title: song.title || null,
            artist: song.artist || null,
            channelId: song.channelId || null,
            durationSeconds: song.durationSeconds || null,
            requester: song.requester,
            requesterLogin: song.requesterLogin || null,
            requesterAvatar: song.requesterAvatar || null,
            thumbnailUrl: song.thumbnailUrl || null,
            requestType: song.requestType,
            priority: priority
        });
        console.log(chalk.grey(`[DB Write] Added song to active_queue: ${song.title}`));
    } catch (err) {
        // Handle potential UNIQUE constraint violation if URL already exists
        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            console.warn(chalk.yellow(`[DB Write] Attempted to add duplicate YouTube URL to active_queue: ${song.youtubeUrl}. Skipping DB insert.`));
        } else {
             console.error(chalk.red('[Database] Failed to add song to active_queue:'), err);
        }
    }
}

function saveNowPlayingToDB(song) {
    if (!song) {
        clearNowPlayingFromDB();
        return;
    }
    
    try {
        // Clear existing now playing entry first
        clearNowPlayingFromDB();
        
        // Add the new song
        saveNowPlayingStmt.run({
            youtubeUrl: song.youtubeUrl,
            title: song.title || null,
            artist: song.artist || null,
            channelId: song.channelId || null,
            durationSeconds: song.durationSeconds || null,
            requester: song.requester,
            requesterLogin: song.requesterLogin || null,
            requesterAvatar: song.requesterAvatar || null,
            thumbnailUrl: song.thumbnailUrl || null,
            requestType: song.requestType
        });
        console.log(chalk.grey(`[DB Write] Saved current playing song: ${song.title}`));
    } catch (err) {
        console.error(chalk.red('[Database] Failed to save now playing song:'), err);
    }
}

function clearNowPlayingFromDB() {
    try {
        clearNowPlayingStmt.run();
        console.log(chalk.grey('[DB Write] Cleared now_playing table.'));
    } catch (err) {
        console.error(chalk.red('[Database] Failed to clear now_playing table:'), err);
    }
}

function loadNowPlayingFromDB() {
    try {
        const loadNowPlayingStmt = db.prepare(`
            SELECT id, youtubeUrl, title, artist, channelId, durationSeconds,
                   requester, requesterLogin, requesterAvatar, thumbnailUrl, requestType, startedAt
            FROM now_playing ORDER BY id DESC LIMIT 1
        `);
        const row = loadNowPlayingStmt.get();
        
        if (!row) {
            console.log(chalk.blue('[Database] No active song found in database.'));
            return null;
        }
        
        // Map DB row to state.nowPlaying format
        const nowPlaying = {
            id: row.id.toString(),
            youtubeUrl: row.youtubeUrl,
            title: row.title,
            artist: row.artist,
            channelId: row.channelId,
            duration: row.durationSeconds ? formatDurationFromSeconds(row.durationSeconds) : '0:00',
            durationSeconds: row.durationSeconds,
            requester: row.requester,
            requesterLogin: row.requesterLogin,
            requesterAvatar: row.requesterAvatar,
            thumbnailUrl: row.thumbnailUrl,
            timestamp: row.startedAt,
            requestType: row.requestType,
            source: 'database'
        };
        
        console.log(chalk.blue(`[Database] Loaded active song: ${nowPlaying.title}`));
        return nowPlaying;
    } catch (err) {
        console.error(chalk.red('[Database] Error loading active song:'), err);
        return null;
    }
}

function removeSongFromDbQueue(youtubeUrl) {
    if (!youtubeUrl) {
        console.warn(chalk.yellow('[DB Write] removeSongFromDbQueue called with null/undefined youtubeUrl'));
        return;
    }
    try {
        // Use the prepared statement defined earlier
        const result = deleteQueueStmt.run(youtubeUrl);
        if (result.changes > 0) {
            console.log(chalk.grey(`[DB Write] Removed song from active_queue: ${youtubeUrl}`));
        }
    } catch (err) {
        console.error(chalk.red(`[Database] Failed to remove song from active_queue (${youtubeUrl}):`), err);
    }
}

function clearDbQueue() {
    try {
        // Use the prepared statement defined earlier
        clearQueueStmt.run();
        console.log(chalk.grey('[DB Write] Cleared active_queue table.'));
    } catch (err) {
        console.error(chalk.red('[Database] Failed to clear active_queue:'), err);
    }
}

// --- END Database Queue Functions ---

// --- Database History Functions ---

function logCompletedSong(song) {
    if (!song || !song.youtubeUrl) {
        console.warn(chalk.yellow('[DB Write] logCompletedSong called with invalid song object'), song);
        return false;
    }
    try {
        // Use the prepared statement defined earlier
        insertHistoryStmt.run({
            youtubeUrl: song.youtubeUrl,
            title: song.title || null,
            artist: song.artist || null,
            channelId: song.channelId || null,
            durationSeconds: song.durationSeconds || null,
            requester: song.requester,
            requesterLogin: song.requesterLogin || null,
            requesterAvatar: song.requesterAvatar || null, // Store URL at time of play
            thumbnailUrl: song.thumbnailUrl || null,
            requestType: song.requestType
            // completedAt is handled by DEFAULT CURRENT_TIMESTAMP in the table
        });
        console.log(chalk.grey(`[DB Write] Logged completed song to history: ${song.title}`));
        
        // Fetch updated history after logging
        try {
            const getHistoryStmt = db.prepare('SELECT * FROM song_history ORDER BY id DESC LIMIT 50');
            const recentHistory = getHistoryStmt.all().map(row => ({
                id: row.id.toString(),
                youtubeUrl: row.youtubeUrl,
                title: row.title,
                artist: row.artist,
                channelId: row.channelId,
                duration: row.durationSeconds ? formatDurationFromSeconds(row.durationSeconds) : '0:00',
                durationSeconds: row.durationSeconds,
                requester: row.requester,
                requesterLogin: row.requesterLogin,
                requesterAvatar: row.requesterAvatar,
                thumbnailUrl: row.thumbnailUrl,
                timestamp: row.completedAt || row.playedAt,
                requestType: row.requestType,
                source: 'database_history'
            }));
            
            // Return success and the updated history (but don't emit here - leave that to the caller)
            return {
                success: true,
                history: recentHistory
            };
        } catch (err) {
            console.error(chalk.red('[Database] Error fetching history after logging song:'), err);
            return true; // Still return true for backward compatibility
        }
    } catch (err) {
        console.error(chalk.red(`[Database] Failed to log song to history (${song.youtubeUrl}):`), err);
        return false;
    }
}

// --- END Database History Functions ---

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
  let requesterAvatar = null; // Default placeholder
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
      
      // Insert the song into the in-memory queue
      state.queue.splice(insertIndex, 0, songRequest);
      // Persist the newly added song to the database queue
      addSongToDbQueue(songRequest);

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

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log(chalk.blue(`[Socket.IO] Client connected: ${socket.id}`))
    
    // Send initial state to newly connected client - fetch history from DB first
    let recentHistory = [];
    try {
        // Fetch recent history from DB (e.g., last 50 played)
        const getHistoryStmt = db.prepare('SELECT * FROM song_history ORDER BY id DESC LIMIT 50');
        recentHistory = getHistoryStmt.all().map(row => ({ // Map DB columns to SongRequest structure
             id: row.id.toString(),
             youtubeUrl: row.youtubeUrl,
             title: row.title,
             artist: row.artist,
             channelId: row.channelId,
             duration: row.durationSeconds ? formatDurationFromSeconds(row.durationSeconds) : '0:00',
             durationSeconds: row.durationSeconds,
             requester: row.requester,
             requesterLogin: row.requesterLogin,
             requesterAvatar: row.requesterAvatar,
             thumbnailUrl: row.thumbnailUrl,
             timestamp: row.completedAt || row.playedAt, // Use completed/played time
             requestType: row.requestType,
             source: 'database_history'
         }));
         console.log(chalk.blue(`[Database] Fetched ${recentHistory.length} recent history items for initial connection.`));
    } catch (err) {
         console.error(chalk.red('[Database] Error fetching recent history for initial connection:'), err);
    }
    
    // Send initial state including fetched history
    socket.emit('initialState', {
         ...state,
         history: recentHistory // Include history from DB
    })

    // Handle explicit getState request
    socket.on('getState', () => {
        let recentHistory = [];
        try {
            // Fetch recent history from DB (e.g., last 50 played)
            const getHistoryStmt = db.prepare('SELECT * FROM song_history ORDER BY id DESC LIMIT 50');
            recentHistory = getHistoryStmt.all().map(row => ({ // Map DB columns to SongRequest structure
                 id: row.id.toString(),
                 youtubeUrl: row.youtubeUrl,
                 title: row.title,
                 artist: row.artist,
                 channelId: row.channelId,
                 duration: row.durationSeconds ? formatDurationFromSeconds(row.durationSeconds) : '0:00',
                 durationSeconds: row.durationSeconds,
                 requester: row.requester,
                 requesterLogin: row.requesterLogin,
                 requesterAvatar: row.requesterAvatar,
                 thumbnailUrl: row.thumbnailUrl,
                 timestamp: row.completedAt || row.playedAt, // Use completed/played time
                 requestType: row.requestType,
                 source: 'database_history'
             }));
             console.log(chalk.blue(`[Database] Fetched ${recentHistory.length} recent history items for getState request.`));
        } catch (err) {
             console.error(chalk.red('[Database] Error fetching recent history for getState request:'), err);
        }
        // Send current state including recent history
        socket.emit('initialState', {
             ...state,
             history: recentHistory // Overwrite in-memory history with recent DB history
         });
    })

    // Handle queue updates
    socket.on('updateQueue', (updatedQueue) => {
        console.log(chalk.grey(`[Socket.IO] Received updateQueue event with ${updatedQueue.length} items.`));
        // Update in-memory queue first
        state.queue = updatedQueue;

        // Sync Database: Clear existing DB queue and re-insert all items from updatedQueue
        clearDbQueue();
        if (Array.isArray(state.queue)) { // Ensure it's an array before iterating
             state.queue.forEach(song => addSongToDbQueue(song));
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
        const songToRemove = state.queue.find(song => song.id === songId);
        if (songToRemove) {
            state.queue = state.queue.filter(song => song.id !== songId);
            removeSongFromDbQueue(songToRemove.youtubeUrl); // Remove from DB
            io.emit('queueUpdate', state.queue);
            console.log(chalk.magenta(`[Admin] Song removed via socket: ${songId} (URL: ${songToRemove.youtubeUrl})`));
        } else {
            console.warn(chalk.yellow(`[Admin] Attempted to remove non-existent song ID: ${songId}`));
        }
    })

    // Handle clear queue
    socket.on('clearQueue', () => {
        state.queue = [];
        clearDbQueue(); // Clear DB
        io.emit('queueUpdate', state.queue);
        console.log(chalk.magenta(`[Admin] Queue cleared via socket.`));
    })

    socket.on('resetSystem', async () => {
        // Clear in-memory state
        state.queue = []
        state.nowPlaying = null
        state.history = []

        // Clear persistent state (Queue)
        clearDbQueue();
        // Clear now playing song from DB
        clearNowPlayingFromDB();
        // Note: History table is NOT cleared by reset. Settings/Blacklist/Blocked are also NOT cleared.

        // Emit updates to all clients
        io.emit('queueUpdate', state.queue)
        io.emit('nowPlaying', state.nowPlaying)
        io.emit('historyUpdate', state.history)
        console.log(chalk.magenta('[Admin] System reset via socket.'));
    })

    // Handle settings
    socket.on('setMaxDuration', (minutes) => {
        state.settings = state.settings || {}
        state.settings.maxDuration = minutes
        saveSetting('maxDuration', minutes); // Save setting to DB
        io.emit('settingsUpdate', state.settings)
        console.log(chalk.magenta(`[Admin] Max Duration set to ${minutes} mins via socket.`));
    })

    // Handle now playing updates
    socket.on('updateNowPlaying', async (song) => {
        const previousSong = state.nowPlaying; // Store previous song
        console.log(chalk.grey(`[Socket.IO] Received updateNowPlaying. New song: ${song ? `ID: ${song.id}, Title: ${song.title}` : 'null'}. Previous song: ${previousSong ? `ID: ${previousSong.id}, Title: ${previousSong.title}` : 'null'}`)); 

        if (song) {
            if (previousSong) { // No need to check history array anymore, just log if previous existed
                 const result = logCompletedSong(previousSong); // Log previous song to DB
                 if (result) {
                     io.emit('songFinished', previousSong); // Emit event for clients
                     
                     // Check if result has history array (new format) or is boolean (old format)
                     if (typeof result === 'object' && result.history) {
                         io.emit('historyUpdate', result.history);
                         console.log(chalk.blue(`[Database] Emitted historyUpdate with ${result.history.length} items after song completion.`));
                     } else {
                         // Fallback to fetching history (should not happen with updated code)
                         try {
                             const getHistoryStmt = db.prepare('SELECT * FROM song_history ORDER BY id DESC LIMIT 50');
                             const recentHistory = getHistoryStmt.all().map(row => ({
                                 id: row.id.toString(),
                                 youtubeUrl: row.youtubeUrl,
                                 title: row.title,
                                 artist: row.artist,
                                 channelId: row.channelId,
                                 duration: row.durationSeconds ? formatDurationFromSeconds(row.durationSeconds) : '0:00',
                                 durationSeconds: row.durationSeconds,
                                 requester: row.requester,
                                 requesterLogin: row.requesterLogin,
                                 requesterAvatar: row.requesterAvatar,
                                 thumbnailUrl: row.thumbnailUrl,
                                 timestamp: row.completedAt || row.playedAt,
                                 requestType: row.requestType,
                                 source: 'database_history'
                             }));
                             io.emit('historyUpdate', recentHistory);
                             console.log(chalk.blue(`[Database] Emitted historyUpdate with ${recentHistory.length} items after song completion (fallback).`));
                         } catch (err) {
                             console.error(chalk.red('[Database] Error fetching history for historyUpdate:'), err);
                         }
                     }
                 }
            }
            state.nowPlaying = song
            // Save the now playing song to the database
            saveNowPlayingToDB(song);
            
            // Remove song from IN-MEMORY queue first
            const queueBeforeFilterLength = state.queue.length;
            state.queue = state.queue.filter(s => s.id !== song.id);
            const queueAfterFilterLength = state.queue.length;
            if (queueBeforeFilterLength === queueAfterFilterLength) {
            }
            // THEN remove from DB queue
            removeSongFromDbQueue(song.youtubeUrl);
            console.log(chalk.yellow(`[Queue] Active song: "${song.title}" (Requester: ${song.requester}) - Removed from queue & DB.`));
        } else {
            // Song finished or stopped
            if (previousSong) { // Log previous song if it existed
                const result = logCompletedSong(previousSong); // Log previous song to DB
                 if (result) {
                     io.emit('songFinished', previousSong); // Emit event for clients
                     
                     // Check if result has history array (new format) or is boolean (old format)
                     if (typeof result === 'object' && result.history) {
                         io.emit('historyUpdate', result.history);
                         console.log(chalk.blue(`[Database] Emitted historyUpdate with ${result.history.length} items after song completion.`));
                     } else {
                         // Fallback to fetching history (should not happen with updated code)
                         try {
                             const getHistoryStmt = db.prepare('SELECT * FROM song_history ORDER BY id DESC LIMIT 50');
                             const recentHistory = getHistoryStmt.all().map(row => ({
                                 id: row.id.toString(),
                                 youtubeUrl: row.youtubeUrl,
                                 title: row.title,
                                 artist: row.artist,
                                 channelId: row.channelId,
                                 duration: row.durationSeconds ? formatDurationFromSeconds(row.durationSeconds) : '0:00',
                                 durationSeconds: row.durationSeconds,
                                 requester: row.requester,
                                 requesterLogin: row.requesterLogin,
                                 requesterAvatar: row.requesterAvatar,
                                 thumbnailUrl: row.thumbnailUrl,
                                 timestamp: row.completedAt || row.playedAt,
                                 requestType: row.requestType,
                                 source: 'database_history'
                             }));
                             io.emit('historyUpdate', recentHistory);
                             console.log(chalk.blue(`[Database] Emitted historyUpdate with ${recentHistory.length} items after song completion (fallback).`));
                         } catch (err) {
                             console.error(chalk.red('[Database] Error fetching history for historyUpdate:'), err);
                         }
                     }
                 }
            }
            if (previousSong) { // Only log console message if there *was* a song playing
                console.log(chalk.yellow(`[Queue] Song finished/removed: "${previousSong.title}"`));
            }
            state.nowPlaying = null
            // Clear the now playing song from the database
            clearNowPlayingFromDB();
        }
        
        // Broadcast updates
        io.emit('nowPlaying', state.nowPlaying)
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

        addedItems.forEach(item => addBlacklistPattern(item.term, item.type));
        removedItems.forEach(item => removeBlacklistPattern(item.term, item.type));

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

        addedUsers.forEach(user => addBlockedUser(user.username));
        removedUsers.forEach(user => removeBlockedUser(user.username));

        io.emit('blockedUsersUpdate', state.blockedUsers)
        console.log(chalk.magenta(`[Admin] Blocked users updated via socket (${state.blockedUsers.length} users). Added: ${addedUsers.length}, Removed: ${removedUsers.length}`));
    })

    // Handle marking a song as finished (from admin)
    socket.on('markSongAsFinished', (song) => {
        if (!song) {
            console.warn(chalk.yellow('[Socket.IO] markSongAsFinished called with null/undefined song'));
            return;
        }

        console.log(chalk.magenta(`[Admin] Marking song "${song.title}" (ID: ${song.id}) as finished via socket.`));
        
        // Log the song to history
        const result = logCompletedSong(song);
        if (result) {
            // Clear the nowPlaying state
            state.nowPlaying = null;
            // Clear the now playing song from the database
            clearNowPlayingFromDB();
            
            // Emit events to clients
            io.emit('songFinished', song);
            io.emit('nowPlaying', null);

            // Update history for all clients
            if (typeof result === 'object' && result.history) {
                io.emit('historyUpdate', result.history);
            } else {
                // Fallback to fetching history
                try {
                    const getHistoryStmt = db.prepare('SELECT * FROM song_history ORDER BY id DESC LIMIT 50');
                    const recentHistory = getHistoryStmt.all().map(row => ({
                        id: row.id.toString(),
                        youtubeUrl: row.youtubeUrl,
                        title: row.title,
                        artist: row.artist,
                        channelId: row.channelId,
                        duration: row.durationSeconds ? formatDurationFromSeconds(row.durationSeconds) : '0:00',
                        durationSeconds: row.durationSeconds,
                        requester: row.requester,
                        requesterLogin: row.requesterLogin,
                        requesterAvatar: row.requesterAvatar,
                        thumbnailUrl: row.thumbnailUrl,
                        timestamp: row.completedAt || row.playedAt,
                        requestType: row.requestType,
                        source: 'database_history'
                    }));
                    io.emit('historyUpdate', recentHistory);
                } catch (err) {
                    console.error(chalk.red('[Database] Error fetching history after marking song as finished:'), err);
                }
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
            requestType: song.requestType || 'manual_admin', // Keep original request type or default
            source: 'history_requeue'
        };

        // Add to the beginning of the queue
        state.queue.unshift(newSong);
        
        // Add to DB queue
        addSongToDbQueue(newSong);

        // Emit queue update to all clients
        io.emit('queueUpdate', state.queue);
    });

    // Add handler for clearing history
    socket.on('clearHistory', () => {
        const success = clearDbHistory();
        if (success) {
            // Send empty history to all clients
            io.emit('historyUpdate', []);
            console.log(chalk.magenta('[Admin] History cleared via socket.'));
        }
    });

    // Add handler for deleting individual history items
    socket.on('deleteHistoryItem', (id) => {
        const success = deleteHistoryItem(id);
        if (success) {
            // Fetch and send updated history to all clients
            try {
                const getHistoryStmt = db.prepare('SELECT * FROM song_history ORDER BY id DESC LIMIT 50');
                const recentHistory = getHistoryStmt.all().map(row => ({
                    id: row.id.toString(),
                    youtubeUrl: row.youtubeUrl,
                    title: row.title,
                    artist: row.artist,
                    channelId: row.channelId,
                    duration: row.durationSeconds ? formatDurationFromSeconds(row.durationSeconds) : '0:00',
                    durationSeconds: row.durationSeconds,
                    requester: row.requester,
                    requesterLogin: row.requesterLogin,
                    requesterAvatar: row.requesterAvatar,
                    thumbnailUrl: row.thumbnailUrl,
                    timestamp: row.completedAt || row.playedAt,
                    requestType: row.requestType,
                    source: 'database_history'
                }));
                io.emit('historyUpdate', recentHistory);
                console.log(chalk.magenta(`[Admin] History item ${id} deleted via socket.`));
            } catch (err) {
                console.error(chalk.red('[Database] Error fetching history after deletion:'), err);
            }
        }
    });

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

    // Import socket.io-client only when needed
    const ioClient = require('socket.io-client');
    
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
        console.log(chalk.green('✅ [StreamElements] Connected and Authenticated. Listening for donations and channel point redemptions.'));
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
  process.exit(0);
}

// Listen for termination signals
process.on('SIGINT', () => shutdown('SIGINT')); // Ctrl+C
process.on('SIGTERM', () => shutdown('SIGTERM')); // kill command
process.on('exit', () => { // Ensure DB connection is closed on any exit
    if (db && db.open) {
        console.log(chalk.blue('[Database] Closing SQLite connection.'));
        db.close();
    }
});

// Start the server and load initial data
async function startServer() {
  const loadedState = loadInitialState();
  state.queue = loadedState.queue;
  state.settings = { ...state.settings, ...loadedState.settings }; // Merge defaults with loaded
  state.blacklist = loadedState.blacklist;
  state.blockedUsers = loadedState.blockedUsers;
  state.nowPlaying = loadedState.nowPlaying; // Set the nowPlaying state from loaded data

  // Log the nowPlaying state for debugging
  console.log(chalk.blue(`[Server] Loaded nowPlaying: ${state.nowPlaying ? state.nowPlaying.title : 'null'}`));

  // Connect to StreamElements Socket API for donation/redemption events
  connectToStreamElements();
  
  console.log(chalk.blue('[Server] Initializing HTTP listener...')); // Added detailed logging
  // Use the custom HTTP server for listening
  // Explicitly bind to 0.0.0.0 to allow access from all interfaces
  httpServer.listen(SOCKET_PORT, '0.0.0.0', async () => {
      console.log(chalk.green(`🚀 Server running at http://0.0.0.0:${SOCKET_PORT}/`))
      console.log(chalk.blue("   Initializing subsystems..."));
  })
}

startServer();

// Helper functions
function extractVideoId(urlStr) {
    if (!urlStr) {
        console.error(chalk.red('[Util] extractVideoId called with undefined/empty URL'))
        return null
    }
    const match = urlStr.match(/(?:youtube\.com\/watch\?v=|youtu.be\/)([^&\n?#]+)/)
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

// Helper function to format duration from seconds
function formatDurationFromSeconds(totalSeconds) {
    if (totalSeconds === null || totalSeconds === undefined || totalSeconds < 0) {
        return '0:00';
    }
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const paddedSeconds = seconds.toString().padStart(2, '0');

    if (hours > 0) {
        const paddedMinutes = minutes.toString().padStart(2, '0');
        return `${hours}:${paddedMinutes}:${paddedSeconds}`;
    } else {
        return `${minutes}:${paddedSeconds}`;
    }
}

// Function to clear history
function clearDbHistory() {
    try {
        const clearHistoryStmt = db.prepare('DELETE FROM song_history');
        const result = clearHistoryStmt.run();
        console.log(chalk.yellow(`[DB Write] Cleared song_history table. Deleted ${result.changes} records.`));
        return true;
    } catch (err) {
        console.error(chalk.red('[Database] Failed to clear song_history:'), err);
        return false;
    }
}

// Function to delete a single history item
function deleteHistoryItem(id) {
    if (!id) {
        console.warn(chalk.yellow('[DB Write] deleteHistoryItem called with null/undefined id'));
        return false;
    }
    try {
        const deleteStmt = db.prepare('DELETE FROM song_history WHERE id = ?');
        const result = deleteStmt.run(id);
        if (result.changes > 0) {
            console.log(chalk.grey(`[DB Write] Deleted history item with ID: ${id}`));
            return true;
        } else {
            console.warn(chalk.yellow(`[DB Write] No history item found with ID: ${id}`));
            return false;
        }
    } catch (err) {
        console.error(chalk.red(`[Database] Failed to delete history item with ID ${id}:`), err);
        return false;
    }
}