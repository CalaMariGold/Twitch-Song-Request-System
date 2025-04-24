const chalk = require('chalk');
const path = require('path');
const Database = require('better-sqlite3');
const { formatDurationFromSeconds } = require('./helpers');
const fs = require('fs');

let db = null;
let insertHistoryStmt, insertQueueStmt, deleteQueueStmt, clearQueueStmt;
let saveSettingStmt, addBlacklistStmt, removeBlacklistStmt, addBlockedUserStmt, removeBlockedUserStmt;
let saveActiveSongStmt, clearActiveSongStmt;

/**
 * Initializes the SQLite database with required tables
 * @param {string} [dbPath] - Optional custom path to the database file
 */
function initDatabase(dbPath) {
    try {
        // Use provided dbPath or default
        const defaultPath = path.join(__dirname, '..', 'data', 'songRequestSystem.db');
        const finalDbPath = dbPath || defaultPath;
        
        // Ensure directory exists
        const dbDir = path.dirname(finalDbPath);
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
        }
        
        console.log(chalk.blue(`[Database] Initializing database at: ${finalDbPath}`));
        db = new Database(finalDbPath);
        console.log(chalk.blue(`[Database] Connected to SQLite database at ${finalDbPath}`));

        // Enable WAL mode for better concurrency
        db.pragma('journal_mode = WAL');

        // Alter existing tables to add Spotify column if it doesn't exist
        ensureSpotifyColumnsExist();

        // Schema Setup (Create tables if they don't exist)
        const createHistoryTableStmt = `
            CREATE TABLE IF NOT EXISTS song_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                youtubeUrl TEXT, -- Not required
                title TEXT,
                artist TEXT,
                channelId TEXT,
                durationSeconds INTEGER,
                requester TEXT NOT NULL,
                requesterLogin TEXT,
                requesterAvatar TEXT,
                thumbnailUrl TEXT,
                requestType TEXT NOT NULL, -- 'channelPoint' or 'donation'
                completedAt TEXT DEFAULT (datetime('now')), -- Ensure this is ISO format
                spotifyData TEXT -- Spotify data as JSON string
            );
        `;
        db.exec(createHistoryTableStmt);

        const createActiveSongTableStmt = `
            CREATE TABLE IF NOT EXISTS active_song (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                youtubeUrl TEXT, -- Not required
                title TEXT,
                artist TEXT,
                channelId TEXT,
                durationSeconds INTEGER,
                requester TEXT NOT NULL,
                requesterLogin TEXT,
                requesterAvatar TEXT,
                thumbnailUrl TEXT,
                requestType TEXT NOT NULL, -- 'channelPoint' or 'donation'
                startedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                spotifyData TEXT -- Spotify data as JSON string
            );
        `;
        db.exec(createActiveSongTableStmt);

        const createActiveQueueTableStmt = `
            CREATE TABLE IF NOT EXISTS active_queue (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                youtubeUrl TEXT, -- Not required anymore
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
                addedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                spotifyData TEXT -- Spotify data as JSON string
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
            CREATE INDEX IF NOT EXISTS idx_completedAt ON song_history (completedAt);
        `;
        db.exec(createHistoryIndexes);

        const createQueueIndexes = `
            CREATE INDEX IF NOT EXISTS idx_queue_order ON active_queue (priority DESC, addedAt ASC);
        `;
        db.exec(createQueueIndexes);

        console.log(chalk.blue('[Database] Schema and indexes verified/created.'));

        // Prepare statements
        prepareStatements();

        return db;

    } catch (err) {
        console.error(chalk.red('[Database] Failed to connect or initialize SQLite database:'), err);
        throw err; // Re-throw to indicate failure
    }
}

// Function to ensure Spotify columns exist and youtubeUrl is NULLable
function ensureSpotifyColumnsExist() {
    try {
        // First, let's check the current schema of each table
        const historyColumns = db.prepare("PRAGMA table_info(song_history)").all();
        const queueColumns = db.prepare("PRAGMA table_info(active_queue)").all();
        const activeSongColumns = db.prepare("PRAGMA table_info(active_song)").all();
        
        // Check if the spotifyData column exists in each table
        const historySpotifyColExists = historyColumns.some(col => col.name === 'spotifyData');
        const queueSpotifyColExists = queueColumns.some(col => col.name === 'spotifyData');
        const activeSongSpotifyColExists = activeSongColumns.some(col => col.name === 'spotifyData');
        
        // Add spotifyData column to each table if it doesn't exist
        if (!historySpotifyColExists) {
            console.log(chalk.blue('[Database] Adding spotifyData column to song_history table'));
            db.exec('ALTER TABLE song_history ADD COLUMN spotifyData TEXT');
        }
        
        if (!queueSpotifyColExists) {
            console.log(chalk.blue('[Database] Adding spotifyData column to active_queue table'));
            db.exec('ALTER TABLE active_queue ADD COLUMN spotifyData TEXT');
        }
        
        if (!activeSongSpotifyColExists) {
            console.log(chalk.blue('[Database] Adding spotifyData column to active_song table'));
            db.exec('ALTER TABLE active_song ADD COLUMN spotifyData TEXT');
        }
        
        // Now let's check if youtubeUrl already allows NULL
        const historyYoutubeIsNotNull = historyColumns.find(col => col.name === 'youtubeUrl')?.notnull === 1;
        const queueYoutubeIsNotNull = queueColumns.find(col => col.name === 'youtubeUrl')?.notnull === 1;
        const activeSongYoutubeIsNotNull = activeSongColumns.find(col => col.name === 'youtubeUrl')?.notnull === 1;
        
        // Make youtubeUrl nullable in each table if it's currently NOT NULL
        if (historyYoutubeIsNotNull) {
            console.log(chalk.blue('[Database] Making youtubeUrl nullable in song_history table'));
            
            // Generate column definitions, skipping the id column (we'll add it separately)
            let columnDefs = historyColumns
                .filter(col => col.name !== 'id') // Skip the id column
                .map(col => {
                    // For the youtubeUrl column, don't include NOT NULL
                    if (col.name === 'youtubeUrl') {
                        return `${col.name} ${col.type}`;
                    }
                    // For other columns, preserve their original definition
                    return `${col.name} ${col.type}${col.notnull ? ' NOT NULL' : ''}${col.dflt_value ? ` DEFAULT ${col.dflt_value}` : ''}`;
                }).join(', ');
            
            db.exec(`
                BEGIN TRANSACTION;
                CREATE TABLE song_history_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ${columnDefs}
                );
                INSERT INTO song_history_new SELECT * FROM song_history;
                DROP TABLE song_history;
                ALTER TABLE song_history_new RENAME TO song_history;
                COMMIT;
            `);
        }
        
        if (queueYoutubeIsNotNull) {
            console.log(chalk.blue('[Database] Making youtubeUrl nullable in active_queue table'));
            
            // Generate column definitions, skipping the id column
            let columnDefs = queueColumns
                .filter(col => col.name !== 'id') // Skip the id column
                .map(col => {
                    // Remove both NOT NULL and UNIQUE constraints from youtubeUrl
                    if (col.name === 'youtubeUrl') {
                        return `${col.name} ${col.type}`;
                    }
                    // For other columns, preserve their original definition
                    return `${col.name} ${col.type}${col.notnull ? ' NOT NULL' : ''}${col.dflt_value ? ` DEFAULT ${col.dflt_value}` : ''}`;
                }).join(', ');
            
            db.exec(`
                BEGIN TRANSACTION;
                CREATE TABLE active_queue_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ${columnDefs}
                );
                INSERT INTO active_queue_new SELECT * FROM active_queue;
                DROP TABLE active_queue;
                ALTER TABLE active_queue_new RENAME TO active_queue;
                COMMIT;
            `);
            
            // We need to recreate the index for the queue order
            db.exec('CREATE INDEX IF NOT EXISTS idx_queue_order ON active_queue (priority DESC, addedAt ASC)');
        }
        
        if (activeSongYoutubeIsNotNull) {
            console.log(chalk.blue('[Database] Making youtubeUrl nullable in active_song table'));
            
            // Generate column definitions, skipping the id column
            let columnDefs = activeSongColumns
                .filter(col => col.name !== 'id') // Skip the id column
                .map(col => {
                    // For the youtubeUrl column, don't include NOT NULL
                    if (col.name === 'youtubeUrl') {
                        return `${col.name} ${col.type}`;
                    }
                    // For other columns, preserve their original definition
                    return `${col.name} ${col.type}${col.notnull ? ' NOT NULL' : ''}${col.dflt_value ? ` DEFAULT ${col.dflt_value}` : ''}`;
                }).join(', ');
            
            db.exec(`
                BEGIN TRANSACTION;
                CREATE TABLE active_song_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ${columnDefs}
                );
                INSERT INTO active_song_new SELECT * FROM active_song;
                DROP TABLE active_song;
                ALTER TABLE active_song_new RENAME TO active_song;
                COMMIT;
            `);
        }
        
        console.log(chalk.green('[Database] Schema updated to support Spotify-only requests'));
    } catch (error) {
        console.error(chalk.red('[Database] Error updating database schema:'), error);
        // Attempt to rollback any in-progress transaction
        try {
            db.exec('ROLLBACK;');
        } catch (rollbackError) {
            console.error(chalk.red('[Database] Error rolling back transaction:'), rollbackError);
        }
    }
}

function prepareStatements() {
    try {
        // History & Queue statements
        insertHistoryStmt = db.prepare(`
            INSERT INTO song_history (
                youtubeUrl, title, artist, channelId, durationSeconds,
                requester, requesterLogin, requesterAvatar, thumbnailUrl, requestType, completedAt, spotifyData
            ) VALUES (
                @youtubeUrl, @title, @artist, @channelId, @durationSeconds,
                @requester, @requesterLogin, @requesterAvatar, @thumbnailUrl, @requestType, CURRENT_TIMESTAMP, @spotifyData
            )
        `);
        insertQueueStmt = db.prepare(`
            INSERT INTO active_queue (
                youtubeUrl, title, artist, channelId, durationSeconds,
                requester, requesterLogin, requesterAvatar, thumbnailUrl, requestType, priority, spotifyData
            ) VALUES (
                @youtubeUrl, @title, @artist, @channelId, @durationSeconds,
                @requester, @requesterLogin, @requesterAvatar, @thumbnailUrl, @requestType, @priority, @spotifyData
            )
        `);
        deleteQueueStmt = db.prepare('DELETE FROM active_queue WHERE id = ?');
        clearQueueStmt = db.prepare('DELETE FROM active_queue');

        // Active Song
        saveActiveSongStmt = db.prepare(`
            INSERT OR REPLACE INTO active_song (
                youtubeUrl, title, artist, channelId, durationSeconds,
                requester, requesterLogin, requesterAvatar, thumbnailUrl, requestType, startedAt, spotifyData
            ) VALUES (
                @youtubeUrl, @title, @artist, @channelId, @durationSeconds,
                @requester, @requesterLogin, @requesterAvatar, @thumbnailUrl, @requestType, CURRENT_TIMESTAMP, @spotifyData
            )
        `);
        clearActiveSongStmt = db.prepare('DELETE FROM active_song');

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
        throw err; // Re-throw error for caller to handle
    }
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

// --- Database Queue Functions ---

function addSongToDbQueue(song) {
    try {
        // Determine priority (e.g., higher value for donations)
        const priority = song.requestType === 'donation' ? 1 : 0;
        
        // Serialize Spotify data if present
        const spotifyData = song.spotifyData ? JSON.stringify(song.spotifyData) : null;
        
        // Use the prepared statement defined earlier
        insertQueueStmt.run({
            youtubeUrl: song.youtubeUrl || null,
            title: song.title || null,
            artist: song.artist || null,
            channelId: song.channelId || null,
            durationSeconds: song.durationSeconds || null,
            requester: song.requester,
            requesterLogin: song.requesterLogin || null,
            requesterAvatar: song.requesterAvatar || null,
            thumbnailUrl: song.thumbnailUrl || null,
            requestType: song.requestType,
            priority: priority,
            spotifyData: spotifyData
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

function saveActiveSongToDB(song) {
    if (!song) {
        clearActiveSongFromDB();
        return;
    }
    
    try {
        // Clear existing active song entry first
        clearActiveSongFromDB();
        
        // Serialize Spotify data if present
        const spotifyData = song.spotifyData ? JSON.stringify(song.spotifyData) : null;
        
        // Add the new song
        saveActiveSongStmt.run({
            youtubeUrl: song.youtubeUrl || null,
            title: song.title || null,
            artist: song.artist || null,
            channelId: song.channelId || null,
            durationSeconds: song.durationSeconds || null,
            requester: song.requester,
            requesterLogin: song.requesterLogin || null,
            requesterAvatar: song.requesterAvatar || null,
            thumbnailUrl: song.thumbnailUrl || null,
            requestType: song.requestType,
            spotifyData: spotifyData
        });
        console.log(chalk.grey(`[DB Write] Saved current active song: ${song.title}`));
    } catch (err) {
        console.error(chalk.red('[Database] Failed to save active song:'), err);
    }
}

function clearActiveSongFromDB() {
    try {
        clearActiveSongStmt.run();
        console.log(chalk.grey('[DB Write] Cleared active_song table.'));
    } catch (err) {
        console.error(chalk.red('[Database] Failed to clear active_song table:'), err);
    }
}

function loadActiveSongFromDB() {
    try {
        const activeSong = db.prepare('SELECT * FROM active_song ORDER BY id DESC LIMIT 1').get();
        if (!activeSong) {
            return null; // No active song
        }
        
        // Parse Spotify data if present
        let spotifyData = null;
        if (activeSong.spotifyData) {
            try {
                spotifyData = JSON.parse(activeSong.spotifyData);
            } catch (e) {
                console.error(chalk.red('[Database] Failed to parse Spotify data for active song:'), e);
            }
            delete activeSong.spotifyData; // Remove raw JSON string after parsing
        }
        
        // Convert database data to SongRequest format and add formatting
        return {
            id: activeSong.id.toString(),
            youtubeUrl: activeSong.youtubeUrl,
            title: activeSong.title,
            artist: activeSong.artist,
            channelId: activeSong.channelId,
            requester: activeSong.requester,
            requesterLogin: activeSong.requesterLogin,
            requesterAvatar: activeSong.requesterAvatar,
            timestamp: activeSong.startedAt,
            duration: activeSong.durationSeconds ? formatDurationFromSeconds(activeSong.durationSeconds) : null,
            durationSeconds: activeSong.durationSeconds,
            thumbnailUrl: activeSong.thumbnailUrl,
            requestType: activeSong.requestType,
            source: 'database_active',
            spotifyData: spotifyData // Use consistent property name
        };
    } catch (err) {
        console.error(chalk.red('[Database] Failed to load active song:'), err);
        return null;
    }
}

function removeSongFromDbQueue(songId) {
    if (!songId) {
        console.warn(chalk.yellow('[DB Write] removeSongFromDbQueue called with null/undefined songId'));
        return;
    }
    try {
        // Update to use song ID instead of youtubeUrl
        const deleteByIdStmt = db.prepare('DELETE FROM active_queue WHERE id = ?');
        const result = deleteByIdStmt.run(songId);
        if (result.changes > 0) {
            console.log(chalk.grey(`[DB Write] Removed song from active_queue with ID: ${songId}`));
        }
    } catch (err) {
        console.error(chalk.red(`[Database] Failed to remove song from active_queue (ID: ${songId}):`), err);
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

// --- Database History Functions ---

function logCompletedSong(song) {
    if (!song) {
        console.warn(chalk.yellow('[DB Write] logCompletedSong called with null/undefined song'));
        return false; // Return false if song is invalid
    }

    try {
        // Serialize Spotify data if present
        const spotifyData = song.spotifyData ? JSON.stringify(song.spotifyData) : null;

        // Use the prepared statement defined earlier
        insertHistoryStmt.run({
            youtubeUrl: song.youtubeUrl || null,
            title: song.title || null,
            artist: song.artist || null,
            channelId: song.channelId || null,
            durationSeconds: song.durationSeconds || null,
            requester: song.requester,
            requesterLogin: song.requesterLogin || null,
            requesterAvatar: song.requesterAvatar || null,
            thumbnailUrl: song.thumbnailUrl || null,
            requestType: song.requestType,
            spotifyData: spotifyData
        });
        console.log(chalk.grey(`[DB Write] Logged completed song to history: ${song.title}`));
        return true; // Return true on success
    } catch (err) {
        console.error(chalk.red('[Database] Failed to log completed song to history:'), err);
        return false; // Return false on failure
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

// Function to fetch recent history items
function getRecentHistory(limit = 50) {
    try {
        const historyItems = db.prepare('SELECT * FROM song_history ORDER BY id DESC LIMIT ?').all(limit);
        
        return historyItems.map(item => {
            // Parse Spotify data if present
            let spotifyData = null;
            if (item.spotifyData) {
                try {
                    spotifyData = JSON.parse(item.spotifyData);
                } catch (e) {
                    console.error(chalk.red('[Database] Failed to parse Spotify data for history item:'), e);
                }
            }
            
            // Ensure the timestamp is properly converted to an ISO string
            // SQLite may store as UTC, but we need to ensure it's properly formatted for the client
            let timestamp = item.completedAt;
            try {
                // If not already an ISO string, convert to a proper one
                if (timestamp && !timestamp.includes('T')) {
                    const date = new Date(timestamp);
                    if (!isNaN(date.getTime())) {
                        timestamp = date.toISOString();
                    }
                }
            } catch (err) {
                console.error(chalk.red('[Database] Error formatting timestamp:'), err);
            }
            
            return {
                id: item.id.toString(),
                youtubeUrl: item.youtubeUrl,
                title: item.title,
                artist: item.artist,
                channelId: item.channelId,
                requester: item.requester,
                requesterLogin: item.requesterLogin,
                requesterAvatar: item.requesterAvatar,
                timestamp: timestamp,
                duration: item.durationSeconds ? formatDurationFromSeconds(item.durationSeconds) : null,
                durationSeconds: item.durationSeconds,
                thumbnailUrl: item.thumbnailUrl,
                requestType: item.requestType,
                source: 'database_history',
                spotifyData: spotifyData // Use consistent property name for Spotify data
            };
        });
    } catch (err) {
        console.error(chalk.red('[Database] Failed to retrieve song history:'), err);
        return [];
    }
}

// Function to load initial state from Database
function loadInitialState() {
    console.log(chalk.blue('[Database] Loading initial state...'));
    let loadedState = { queue: [], settings: {}, blacklist: [], blockedUsers: [], activeSong: null };
    try {
        // Load Active Queue
        const loadQueueStmt = db.prepare(`
            SELECT id, youtubeUrl, title, artist, channelId, durationSeconds,
                   requester, requesterLogin, requesterAvatar, thumbnailUrl, requestType, addedAt, spotifyData
            FROM active_queue ORDER BY priority DESC, addedAt ASC
        `);
        const queueRows = loadQueueStmt.all();
        // Map DB columns to state.queue song format (adjust if necessary)
        loadedState.queue = queueRows.map(row => {
            // Parse Spotify data if present
            let spotifyData = null;
            if (row.spotifyData) {
                try {
                    spotifyData = JSON.parse(row.spotifyData);
                } catch (e) {
                    console.error(chalk.red('[Database] Failed to parse Spotify data for queue item:'), e);
                }
            }
            
            return {
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
                source: 'database',
                spotifyData: spotifyData // Use consistent property name for Spotify data
            };
        });
        console.log(chalk.blue(`[Database] Loaded ${loadedState.queue.length} songs into the active queue.`));

        // Load Active song
        loadedState.activeSong = loadActiveSongFromDB();

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

/**
 * Closes the database connection and cleans up prepared statements
 * @returns {boolean} True if closed successfully, false otherwise
 */
function closeDatabase() {
    if (!db) {
        console.warn(chalk.yellow('[Database] No database connection to close.'));
        return false;
    }
    
    try {
        console.log(chalk.blue('[Database] Closing database connection...'));
        
        // Clean up prepared statements
        insertHistoryStmt = null;
        insertQueueStmt = null;
        deleteQueueStmt = null;
        clearQueueStmt = null;
        saveSettingStmt = null;
        addBlacklistStmt = null;
        removeBlacklistStmt = null;
        addBlockedUserStmt = null;
        removeBlockedUserStmt = null;
        saveActiveSongStmt = null;
        clearActiveSongStmt = null;
        
        // Close database
        db.close();
        db = null;
        console.log(chalk.blue('[Database] Database connection closed successfully.'));
        return true;
    } catch (err) {
        console.error(chalk.red('[Database] Error closing database:'), err);
        return false;
    }
}

module.exports = {
    initDatabase,
    loadInitialState,
    getRecentHistory,
    
    // Settings functions
    saveSetting,
    
    // Blacklist functions
    addBlacklistPattern,
    removeBlacklistPattern,
    
    // Blocked user functions
    addBlockedUser,
    removeBlockedUser,
    
    // Queue functions
    addSongToDbQueue,
    removeSongFromDbQueue,
    clearDbQueue,
    
    // Active song functions
    saveActiveSongToDB,
    clearActiveSongFromDB,
    loadActiveSongFromDB,
    
    // History functions
    logCompletedSong,
    clearDbHistory,
    deleteHistoryItem,
    
    // Utility
    closeDatabase,
    
    // Reference to the DB for direct operations
    getDb: () => db
}; 