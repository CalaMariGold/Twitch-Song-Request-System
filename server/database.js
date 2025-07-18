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
        // Determine the final path for the database file
        const dbFileName = 'songRequestSystem.db';
        let finalDbPath;
        if (process.env.PERSISTENT_DATA_PATH) {
             // Use the persistent volume path directly
            finalDbPath = path.join(process.env.PERSISTENT_DATA_PATH, dbFileName);
        } else if (dbPath) {
            // Use the custom path if provided
            finalDbPath = dbPath;
        } else {
            // Default to project's data directory if no persistent path or custom path is set
            finalDbPath = path.join(__dirname, '..', 'data', dbFileName);
        }

        // Ensure directory exists (whether it's PERSISTENT_DATA_PATH or ../data)
        const dbDir = path.dirname(finalDbPath);
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
            console.log(chalk.yellow(`[Database] Created directory: ${dbDir}`));
        }

        console.log(chalk.blue(`[Database] Initializing database at: ${finalDbPath}`));
        db = new Database(finalDbPath);
        console.log(chalk.blue(`[Database] Connected to SQLite database at ${finalDbPath}`));

        // Enable WAL mode for better concurrency
        db.pragma('journal_mode = WAL');

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
                request_id TEXT UNIQUE,
                youtubeUrl TEXT,
                title TEXT,
                artist TEXT,
                channelId TEXT,
                durationSeconds INTEGER,
                requester TEXT NOT NULL,
                requesterLogin TEXT,
                requesterAvatar TEXT,
                thumbnailUrl TEXT,
                requestType TEXT NOT NULL,
                priority INTEGER DEFAULT 0,
                addedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                spotifyData TEXT
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

        // Run migration logic *after* base tables are guaranteed to exist
        // --- Migration logic placeholder --- 
        try {
            const queueColumns = db.prepare("PRAGMA table_info(active_queue)").all();
            const requestIdColExists = queueColumns.some(col => col.name === 'request_id');
            if (!requestIdColExists) {
                console.log(chalk.blue('[Database] Adding request_id column to active_queue table'));
                // Step 1: Add column WITHOUT UNIQUE constraint
                db.exec('ALTER TABLE active_queue ADD COLUMN request_id TEXT'); 
                console.log(chalk.yellow('[Database] Warning: Added request_id column. Existing rows will have NULL request_id.'));
                // Step 2: Create UNIQUE index separately AFTER adding column
                console.log(chalk.blue('[Database] Creating UNIQUE index on request_id column'));
                db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_queue_request_id_unique ON active_queue (request_id)');
            }
        } catch (migrationError) {
            console.error(chalk.red('[Database] Error during request_id column migration:'), migrationError);
            // If the migration fails, the subsequent index creation might also fail.
        }
        // --- End migration logic --- 
        ensureSpotifyColumnsExist();

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
                requester, requesterLogin, requesterAvatar, thumbnailUrl, 
                requestType, completedAt, spotifyData 
            ) VALUES (
                @youtubeUrl, @title, @artist, @channelId, @durationSeconds, 
                @requester, @requesterLogin, @requesterAvatar, @thumbnailUrl, 
                @requestType, @completedAt, @spotifyData 
            )
        `);
        insertQueueStmt = db.prepare(`
            INSERT INTO active_queue (
                request_id, youtubeUrl, title, artist, channelId, durationSeconds,
                requester, requesterLogin, requesterAvatar, thumbnailUrl, requestType, priority, addedAt, spotifyData
            ) VALUES (
                @request_id, @youtubeUrl, @title, @artist, @channelId, @durationSeconds,
                @requester, @requesterLogin, @requesterAvatar, @thumbnailUrl, @requestType, @priority, @addedAt, @spotifyData
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
                @requester, @requesterLogin, @requesterAvatar, @thumbnailUrl, @requestType, @startedAt, @spotifyData
            )
        `);
        clearActiveSongStmt = db.prepare('DELETE FROM active_song');

        // Settings
        saveSettingStmt = db.prepare(`
            INSERT OR REPLACE INTO settings (key, value) VALUES (@key, @value)
        `);

        // Blacklist
        addBlacklistStmt = db.prepare('INSERT OR IGNORE INTO blacklist (pattern, type, addedAt) VALUES (?, ?, ?)');
        removeBlacklistStmt = db.prepare('DELETE FROM blacklist WHERE pattern = ? AND type = ?');

        // Blocked Users
        addBlockedUserStmt = db.prepare('INSERT OR IGNORE INTO blocked_users (username, addedAt) VALUES (?, ?)');
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

function addBlacklistPattern(pattern, type, addedAt) {
    try {
        const result = addBlacklistStmt.run(pattern, type, addedAt);
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

function addBlockedUser(username, addedAt) {
    try {
        const result = addBlockedUserStmt.run(username, addedAt);
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
        const priority = song.requestType === 'donation' ? 1 : 0;
        const spotifyDataJson = song.spotifyData ? JSON.stringify(song.spotifyData) : null;

        insertQueueStmt.run({
            request_id: song.id,
            youtubeUrl: song.youtubeUrl,
            title: song.title,
            artist: song.artist,
            channelId: song.channelId,
            durationSeconds: song.durationSeconds,
            requester: song.requester,
            requesterLogin: song.requesterLogin,
            requesterAvatar: song.requesterAvatar,
            thumbnailUrl: song.thumbnailUrl,
            requestType: song.requestType,
            priority: song.priority || priority,
            addedAt: song.timestamp || new Date().toISOString(),
            spotifyData: spotifyDataJson
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
        // Use the timestamp from the song object, default to now if missing
        const startedAt = song.timestamp || new Date().toISOString(); 
        
        // Add the new song using the prepared statement
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
            startedAt: startedAt, // Pass the explicit timestamp
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

/**
 * Removes a song from the active_queue table based on its unique request_id.
 * @param {string} requestId - The unique ID generated by the application (e.g., timestamp string).
 * @returns {boolean} True if a row was deleted, false otherwise.
 */
function removeSongFromDbQueue(requestId) { // Renamed parameter for clarity
    if (!db) {
        console.error(chalk.red('[Database] Cannot remove song, database not initialized.'));
        return false;
    }
    if (!requestId) {
        console.warn(chalk.yellow('[Database] removeSongFromDbQueue called with invalid requestId:', requestId));
        return false;
    }
    try {
        // Prepare statement locally if not already done (safer)
        const stmt = db.prepare('DELETE FROM active_queue WHERE request_id = ?');
        // Delete based on the request_id (JavaScript generated ID)
        const result = stmt.run(requestId);
        
        if (result.changes > 0) {
            console.log(chalk.grey(`[DB Write] Removed song with request_id ${requestId} from active_queue.`));
            return true;
        } else {
            // This might happen if the song was manually added and didn't go through the normal DB add flow
            // or if there's a state mismatch. Should be less common now.
            console.warn(chalk.yellow(`[DB Write] No song found with request_id ${requestId} in active_queue to remove.`));
            return false;
        }
    } catch (err) {
        console.error(chalk.red(`[Database] Failed to remove song with request_id ${requestId} from active_queue:`), err);
        return false;
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

function getDb() {
    return db;
}

function logCompletedSong(song) {
    if (!song || !song.id) {
        console.warn(chalk.yellow('[Database] Attempted to log invalid song to history (missing original ID):'), song);
        return false;
    }
    if (!insertHistoryStmt || !deleteQueueStmt) {
        console.error(chalk.red('[Database] Statements not prepared. Cannot log song or ensure queue removal.'));
        return false;
    }
    
    try {
        const logAndCleanTransaction = getDb().transaction(() => {
            const spotifyDataJson = song.spotifyData ? JSON.stringify(song.spotifyData) : null;
            const completedAt = song.completedAt || new Date().toISOString();
            
            const historyParams = {
                youtubeUrl: song.youtubeUrl || null,
                title: song.title || 'Unknown Title',
                artist: song.artist || 'Unknown Artist',
                channelId: song.channelId || null,
                durationSeconds: song.durationSeconds || 0,
                requester: song.requester || 'Unknown Requester',
                requesterLogin: song.requesterLogin || null,
                requesterAvatar: song.requesterAvatar || null,
                thumbnailUrl: song.thumbnailUrl || null,
                requestType: song.requestType || 'unknown',
                completedAt: completedAt,
                spotifyData: spotifyDataJson
            };
            insertHistoryStmt.run(historyParams);
            
            const deleteInfo = deleteQueueStmt.run(song.id);
            return deleteInfo.changes;
        });
        
        const deleteCount = logAndCleanTransaction();
        if (deleteCount > 0) {
            console.log(chalk.grey(`[DB Write] Logged song "${song.title}" (Original ID: ${song.id}) to history and removed from active_queue.`));
        } else {
            console.log(chalk.grey(`[DB Write] Logged song "${song.title}" (Original ID: ${song.id}) to history. (Was already removed from active_queue).`));
        }
        
        return true;
    } catch (err) {
        console.error(chalk.red('[Database] Error in logAndCleanTransaction:'), err);
        console.error(chalk.red('Failed song data:'), song);
        return false;
    }
}

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

/**
 * @returns {SongRequest[]} An array of all history items, formatted as SongRequest objects.
 */
function getRecentHistory() {
    try {
        // Order by completedAt DESC instead of display_order for automatic chronological sorting
        const historyItems = db.prepare('SELECT * FROM song_history ORDER BY completedAt DESC LIMIT 20').all();
        
        return historyItems.map(item => {
            let spotifyData = null;
            if (item.spotifyData) {
                try {
                    spotifyData = JSON.parse(item.spotifyData);
                } catch (e) {
                    console.error(chalk.red('[Database] Failed to parse Spotify data for history item:'), e);
                }
            }
            
            let timestamp = item.completedAt;
            try {
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
                spotifyData: spotifyData
            };
        });
    } catch (err) {
        console.error(chalk.red('[Database] Failed to retrieve song history:'), err);
        return [];
    }
}

/**
 * Retrieves a chunk of history items with an offset and limit.
 * @param {number} limit - The maximum number of items to fetch.
 * @param {number} offset - The number of items to skip.
 * @returns {SongRequest[]} An array of history items, formatted as SongRequest objects.
 */
function getHistoryWithOffset(limit, offset) {
    if (!db) {
        console.error(chalk.red('[Database] Database not initialized. Cannot get history chunk.'));
        return [];
    }
    if (typeof limit !== 'number' || limit <= 0 || typeof offset !== 'number' || offset < 0) {
        console.warn(chalk.yellow(`[Database] Invalid limit (${limit}) or offset (${offset}) for getHistoryWithOffset.`));
        return [];
    }

    try {
        // Use placeholders for safety, order by completedAt DESC for automatic chronological sorting
        const stmt = db.prepare('SELECT * FROM song_history ORDER BY completedAt DESC LIMIT ? OFFSET ?');
        const historyItems = stmt.all(limit, offset);

        return historyItems.map(item => {
            let spotifyData = null;
            if (item.spotifyData) {
                try {
                    spotifyData = JSON.parse(item.spotifyData);
                } catch (e) {
                    console.error(chalk.red('[Database] Failed to parse Spotify data for history item (offset): '), e);
                }
            }

            let timestamp = item.completedAt;
            try {
                if (timestamp && !timestamp.includes('T')) {
                    const date = new Date(timestamp);
                    if (!isNaN(date.getTime())) {
                        timestamp = date.toISOString();
                    }
                }
            } catch (err) {
                console.error(chalk.red('[Database] Error formatting timestamp (offset): '), err);
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
                spotifyData: spotifyData
            };
        });
    } catch (err) {
        console.error(chalk.red(`[Database] Failed to retrieve history chunk (limit: ${limit}, offset: ${offset}):`), err);
        return [];
    }
}

/**
 * Gets the total number of items in the song history.
 * @returns {number} The total count of history items.
 */
function getTotalHistoryCount() {
    try {
        const stmt = db.prepare('SELECT COUNT(*) AS count FROM song_history');
        const result = stmt.get();
        return result.count || 0;
    } catch (error) {
        console.error(chalk.red('[Database] Error getting total history count:'), error);
        return 0;
    }
}

/**
 * Gets the simple counter for songs played today (no time-based logic)
 * @returns {number}
 */
function getTodayHistoryCount() {
    try {
        const stmt = db.prepare('SELECT value FROM settings WHERE key = ?');
        const result = stmt.get('todaysPlayedCount');
        return result ? parseInt(result.value, 10) : 0;
    } catch (error) {
        console.error(chalk.red('[Database] Error getting today\'s history count:'), error);
        return 0;
    }
}

/**
 * Increments the today's played count by 1
 */
function incrementTodaysCount() {
    try {
        const currentCount = getTodayHistoryCount();
        const newCount = currentCount + 1;
        saveSetting('todaysPlayedCount', newCount);
        console.log(chalk.blue(`[Database] Incremented today's count to ${newCount}`));
    } catch (error) {
        console.error(chalk.red('[Database] Error incrementing today\'s count:'), error);
    }
}

/**
 * Resets the today's played count to 0
 */
function resetTodaysCount() {
    try {
        saveSetting('todaysPlayedCount', 0);
        console.log(chalk.blue('[Database] Reset today\'s count to 0'));
    } catch (error) {
        console.error(chalk.red('[Database] Error resetting today\'s count:'), error);
    }
}

function loadInitialState() {
    console.log(chalk.blue('[Database] Loading initial state...'));
    let loadedState = { queue: [], settings: {}, blacklist: [], blockedUsers: [], activeSong: null };
    try {
        const loadQueueStmt = db.prepare(`
            SELECT id, youtubeUrl, title, artist, channelId, durationSeconds,
                   requester, requesterLogin, requesterAvatar, thumbnailUrl, requestType, addedAt, spotifyData
            FROM active_queue ORDER BY priority DESC, id ASC
        `);
        const queueRows = loadQueueStmt.all();
        loadedState.queue = queueRows.map(row => {
            let spotifyData = null;
            if (row.spotifyData) {
                try {
                    spotifyData = JSON.parse(row.spotifyData);
                } catch (e) {
                    console.error(chalk.red('[Database] Failed to parse Spotify data for queue item:'), e);
                }
            }
            
            return {
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
                timestamp: row.addedAt,
                requestType: row.requestType,
                source: 'database',
                spotifyData: spotifyData
            };
        });
        console.log(chalk.blue(`[Database] Loaded ${loadedState.queue.length} songs into the active queue.`));

        loadedState.activeSong = loadActiveSongFromDB();

        const loadSettingsStmt = db.prepare('SELECT key, value FROM settings');
        const settingsRows = loadSettingsStmt.all();
        loadedState.settings = settingsRows.reduce((acc, row) => {
            try {
                acc[row.key] = JSON.parse(row.value);
            } catch (e) {
                acc[row.key] = row.value;
            }
            return acc;
        }, {});
        console.log(chalk.blue(`[Database] Loaded ${Object.keys(loadedState.settings).length} settings.`));

        const loadBlacklistStmt = db.prepare('SELECT id, pattern, type, addedAt FROM blacklist');
        const blacklistRows = loadBlacklistStmt.all();
        loadedState.blacklist = blacklistRows.map(row => ({
            id: row.id.toString(),
            term: row.pattern,
            type: row.type,
            addedAt: row.addedAt
        }));
        console.log(chalk.blue(`[Database] Loaded ${loadedState.blacklist.length} blacklist items.`));

        const loadBlockedUsersStmt = db.prepare('SELECT id, username, addedAt FROM blocked_users');
        const blockedUserRows = loadBlockedUsersStmt.all();
        loadedState.blockedUsers = blockedUserRows.map(row => ({
            id: row.id.toString(),
            username: row.username,
            addedAt: row.addedAt
        }));
        console.log(chalk.blue(`[Database] Loaded ${loadedState.blockedUsers.length} blocked users.`));

    } catch (err) {
        console.error(chalk.red('[Database] Error loading initial state:'), err);
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
        
        db.close();
        db = null;
        console.log(chalk.blue('[Database] Database connection closed successfully.'));
        return true;
    } catch (err) {
        console.error(chalk.red('[Database] Error closing database:'), err);
        return false;
    }
}

/**
 * Updates the spotifyData, title, artist, thumbnail, and duration for a specific song in the active_queue table.
 * @param {string} appRequestId The application-generated unique ID of the song request to update.
 * @param {object | null} spotifyData The new Spotify data object (or null).
 * @param {string} title The new title from Spotify.
 * @param {string} artist The new artist from Spotify.
 * @param {string | null} thumbnailUrl The new thumbnail URL from Spotify.
 * @param {number | null} durationSeconds The new duration in seconds from Spotify.
 */
function updateSongSpotifyDataAndDetailsInDbQueue(appRequestId, spotifyData, title, artist, thumbnailUrl, durationSeconds) {
  if (!db) {
      console.error(chalk.red('[DB] Database not initialized. Cannot update song details.'));
      return;
  }
  if (!appRequestId) {
      console.warn(chalk.yellow('[DB] updateSongSpotifyDataAndDetailsInDbQueue called with invalid appRequestId.'));
      return;
  }

  try {
    // Update spotifyData, title, artist, thumbnailUrl, and durationSeconds using the request_id column
    const stmt = db.prepare('UPDATE active_queue SET spotifyData = ?, title = ?, artist = ?, thumbnailUrl = ?, durationSeconds = ? WHERE request_id = ?');
    const result = stmt.run(
      spotifyData ? JSON.stringify(spotifyData) : null, 
      title || 'Unknown Title', 
      artist || 'Unknown Artist', 
      thumbnailUrl,
      durationSeconds,
      appRequestId
    );
    
    if (result.changes > 0) {
      console.log(chalk.blue(`[DB] Updated Spotify data, title, artist, thumbnail, and duration for queue item with request_id ${appRequestId}.`));
    } else {
      console.log(chalk.yellow(`[DB] Attempted to update details for non-existent queue item with request_id ${appRequestId}.`));
    }
  } catch (error) {
    console.error(chalk.red(`[DB] Error updating song details in queue for request_id ${appRequestId}:`), error);
  }
}

/**
 * Updates the YouTube URL and related details for a specific song in the active_queue table.
 * @param {string} appRequestId The application-generated unique ID of the song request to update.
 * @param {string | null} youtubeUrl The new YouTube URL (or null).
 * @param {string} title The new title from YouTube.
 * @param {string} artist The new artist/channel from YouTube.
 * @param {string | null} channelId The new channel ID from YouTube.
 * @param {string | null} thumbnailUrl The new thumbnail URL from YouTube.
 * @param {number | null} durationSeconds The new duration in seconds from YouTube.
 * @param {object | null} spotifyData The new Spotify data object (or null).
 */
function updateSongYouTubeUrlAndDetailsInDbQueue(appRequestId, youtubeUrl, title, artist, channelId, thumbnailUrl, durationSeconds, spotifyData) {
  if (!db) {
      console.error(chalk.red('[DB] Database not initialized. Cannot update YouTube details.'));
      return false;
  }
  if (!appRequestId) {
      console.warn(chalk.yellow('[DB] updateSongYouTubeUrlAndDetailsInDbQueue called with invalid appRequestId.'));
      return false;
  }

  try {
    // Update all YouTube-related fields using the request_id column
    const stmt = db.prepare('UPDATE active_queue SET youtubeUrl = ?, title = ?, artist = ?, channelId = ?, thumbnailUrl = ?, durationSeconds = ?, spotifyData = ? WHERE request_id = ?');
    const result = stmt.run(
      youtubeUrl,
      title || 'Unknown Title',
      artist || 'Unknown Artist', 
      channelId,
      thumbnailUrl,
      durationSeconds,
      spotifyData ? JSON.stringify(spotifyData) : null,
      appRequestId
    );
    
    if (result.changes > 0) {
      console.log(chalk.blue(`[DB] Updated YouTube URL and details for queue item with request_id ${appRequestId}.`));
      return true;
    } else {
      console.log(chalk.yellow(`[DB] Attempted to update YouTube details for non-existent queue item with request_id ${appRequestId}.`));
      return false;
    }
  } catch (error) {
    console.error(chalk.red(`[DB] Error updating YouTube details in queue for request_id ${appRequestId}:`), error);
    return false;
  }
}

/**
 * Removes Spotify data from a specific song request in the active queue, history, or active song.
 * @param {string} requestId - The unique request ID of the song.
 * @param {string} table - The table to update ('active_queue', 'song_history', or 'active_song').
 */
function removeSpotifyDataFromSong(requestId, table = 'active_queue') {
    if (!db) {
        console.error(chalk.red('[Database] Database not initialized. Cannot remove Spotify data.'));
        return false;
    }
    if (!requestId) {
        console.warn(chalk.yellow('[Database] removeSpotifyDataFromSong called with invalid requestId.'));
        return false;
    }

    const validTables = ['active_queue', 'song_history', 'active_song'];
    if (!validTables.includes(table)) {
        console.warn(chalk.yellow(`[Database] Invalid table "${table}". Valid tables: ${validTables.join(', ')}`));
        return false;
    }

    try {
        let stmt;
        let result;
        
        console.log(chalk.cyan(`[DB] Attempting to remove Spotify data from ${table} for request ID: ${requestId}`));
        
        if (table === 'active_queue') {
            stmt = db.prepare('UPDATE active_queue SET spotifyData = NULL WHERE request_id = ?');
            result = stmt.run(requestId);
        } else if (table === 'song_history') {
            stmt = db.prepare('UPDATE song_history SET spotifyData = NULL WHERE id = ?');
            result = stmt.run(requestId);
        } else if (table === 'active_song') {
            // For active_song table, we need to update all rows since there should only be one
            // The frontend sends the original request ID, but active_song table might have a different structure
            stmt = db.prepare('UPDATE active_song SET spotifyData = NULL');
            result = stmt.run();
            console.log(chalk.cyan(`[DB] Updated active_song table (all rows), changes: ${result.changes}`));
        }

        if (result.changes > 0) {
            console.log(chalk.blue(`[DB] Successfully removed Spotify data from ${table} for request ID ${requestId}. Rows affected: ${result.changes}`));
            return true;
        } else {
            console.log(chalk.yellow(`[DB] No record found in ${table} with request ID ${requestId}. No changes made.`));
            
            return false;
        }
    } catch (error) {
        console.error(chalk.red(`[DB] Error removing Spotify data from ${table} for request ID ${requestId}:`), error);
        return false;
    }
}

/**
 * Updates the completedAt timestamp for a specific song in the history.
 * @param {string} historyId - The ID of the history item to update.
 * @param {string} newTimestamp - The new timestamp in ISO format.
 * @returns {boolean} True if update was successful, false otherwise.
 */
function updateHistoryTimestamp(historyId, newTimestamp) {
    if (!db) {
        console.error(chalk.red('[Database] Database not initialized. Cannot update history timestamp.'));
        return false;
    }
    if (!historyId || !newTimestamp) {
        console.warn(chalk.yellow('[Database] updateHistoryTimestamp called with invalid parameters.'));
        return false;
    }

    try {
        const stmt = db.prepare('UPDATE song_history SET completedAt = ? WHERE id = ?');
        const result = stmt.run(newTimestamp, historyId);
        
        if (result.changes > 0) {
            console.log(chalk.blue(`[DB] Successfully updated timestamp for history item ${historyId} to ${newTimestamp}`));
            return true;
        } else {
            console.log(chalk.yellow(`[DB] No history item found with ID ${historyId}. No changes made.`));
            return false;
        }
    } catch (error) {
        console.error(chalk.red(`[DB] Error updating timestamp for history item ${historyId}:`), error);
        return false;
    }
}

/**
 * Retrieves a paginated list of song history for a specific user and the total count of their requests.
 * @param {string} userLogin - The Twitch login name of the user.
 * @param {number} limit - The maximum number of items to fetch.
 * @param {number} offset - The number of items to skip.
 * @returns {{history: SongRequest[], total: number}} An object containing the user's history and total count.
 */
function getHistoryForUser(userLogin, limit, offset) {
    if (!db) {
        console.error(chalk.red('[Database] Database not initialized. Cannot get user history.'));
        return { history: [], total: 0 };
    }
    if (!userLogin) {
        console.warn(chalk.yellow('[Database] getHistoryForUser called with invalid userLogin.'));
        return { history: [], total: 0 };
    }
    // Allow limit to be 0 for fetching total count only
    if (typeof limit !== 'number' || limit < 0 || typeof offset !== 'number' || offset < 0) {
        console.warn(chalk.yellow(`[Database] Invalid limit (${limit}) or offset (${offset}) for getHistoryForUser.`));
        return { history: [], total: 0 };
    }

    try {
        // First, get the total count for the user
        const totalStmt = db.prepare('SELECT COUNT(*) AS count FROM song_history WHERE requesterLogin = ? COLLATE NOCASE');
        const totalResult = totalStmt.get(userLogin);
        const total = totalResult.count || 0;

        // Return early if limit is 0, no need to query for items
        if (limit === 0) {
            return { history: [], total };
        }

        // Then, get the paginated history for the user, ordered by most recent
        const historyStmt = db.prepare('SELECT * FROM song_history WHERE requesterLogin = ? COLLATE NOCASE ORDER BY completedAt DESC LIMIT ? OFFSET ?');
        const historyItems = historyStmt.all(userLogin, limit, offset);

        const formattedHistory = historyItems.map(item => {
            let spotifyData = null;
            if (item.spotifyData) {
                try {
                    spotifyData = JSON.parse(item.spotifyData);
                } catch (e) {
                    console.error(chalk.red('[Database] Failed to parse Spotify data for user history item:'), e);
                }
            }

            let timestamp = item.completedAt;
            try {
                if (timestamp && !timestamp.includes('T')) {
                    const date = new Date(timestamp);
                    if (!isNaN(date.getTime())) {
                        timestamp = date.toISOString();
                    }
                }
            } catch (err) {
                console.error(chalk.red('[Database] Error formatting timestamp (user history): '), err);
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
                spotifyData: spotifyData
            };
        });

        return { history: formattedHistory, total };

    } catch (err) {
        console.error(chalk.red(`[Database] Failed to retrieve history for user ${userLogin}:`), err);
        return { history: [], total: 0 };
    }
}

/**
 * Replaces all occurrences of a requester name in song_history with a new name (case-insensitive).
 * Updates both 'requester' and 'requesterLogin' fields.
 * @param {string} oldName - The old requester name to replace (case-insensitive).
 * @param {string} newName - The new requester name to set.
 * @returns {number} The number of rows updated.
 */
function replaceRequesterNameInHistory(oldName, newName) {
    if (!db) {
        console.error(chalk.red('[Database] Database not initialized. Cannot replace requester name.'));
        return 0;
    }
    if (!oldName || !newName) {
        console.warn(chalk.yellow('[Database] replaceRequesterNameInHistory called with invalid parameters.'));
        return 0;
    }
    try {
        // Update both 'requester' and 'requesterLogin' fields where either matches oldName (case-insensitive)
        const stmt = db.prepare(`
            UPDATE song_history
            SET requester = @newName, requesterLogin = @newName
            WHERE LOWER(requester) = LOWER(@oldName) OR LOWER(requesterLogin) = LOWER(@oldName)
        `);
        const result = stmt.run({ oldName, newName });
        if (result.changes > 0) {
            console.log(chalk.blue(`[DB] Updated requester name from "${oldName}" to "${newName}" in song_history. Rows affected: ${result.changes}`));
        } else {
            console.log(chalk.yellow(`[DB] No history items found for requester name "${oldName}".`));
        }
        return result.changes;
    } catch (error) {
        console.error(chalk.red(`[Database] Error updating requester name in history from "${oldName}" to "${newName}":`), error);
        return 0;
    }
}

/**
 * Fetches all history entries for a given requester name (case-insensitive, matches either 'requester' or 'requesterLogin').
 * Returns an array of { id, title, artist, completedAt } objects.
 * @param {string} requesterName
 * @returns {Array<{id: string, title: string, artist: string, completedAt: string}>}
 */
function getHistoryEntriesByRequesterName(requesterName) {
    if (!db) {
        console.error(chalk.red('[Database] Database not initialized. Cannot fetch history entries by requester name.'));
        return [];
    }
    if (!requesterName) {
        console.warn(chalk.yellow('[Database] getHistoryEntriesByRequesterName called with invalid requesterName.'));
        return [];
    }
    try {
        const stmt = db.prepare(`
            SELECT id, title, artist, completedAt FROM song_history
            WHERE LOWER(requester) = LOWER(?) OR LOWER(requesterLogin) = LOWER(?)
            ORDER BY completedAt DESC
        `);
        const rows = stmt.all(requesterName, requesterName);
        return rows.map(row => ({
            id: row.id.toString(),
            title: row.title,
            artist: row.artist,
            completedAt: row.completedAt
        }));
    } catch (error) {
        console.error(chalk.red(`[Database] Error fetching history entries for requester name "${requesterName}":`), error);
        return [];
    }
}

/**
 * Gets statistics for the song history: total duration, average duration, donation count, and channel point count.
 * @returns {{ totalDuration: number, averageDuration: number, donationCount: number, channelPointCount: number }}
 */
function getHistoryStats() {
    try {
        const totalDurationStmt = db.prepare('SELECT SUM(durationSeconds) AS totalDuration FROM song_history');
        const totalDurationResult = totalDurationStmt.get();
        const totalDuration = totalDurationResult.totalDuration || 0;

        const countStmt = db.prepare('SELECT COUNT(*) AS count FROM song_history');
        const countResult = countStmt.get();
        const totalCount = countResult.count || 0;

        const averageDuration = totalCount > 0 ? Math.round(totalDuration / totalCount) : 0;

        // Exclude songs where requesterLogin is 'calamarigold' (case-insensitive)
        const donationStmt = db.prepare("SELECT COUNT(*) AS count FROM song_history WHERE requestType = 'donation' AND LOWER(requesterLogin) != 'calamarigold'");
        const donationResult = donationStmt.get();
        const donationCount = donationResult.count || 0;

        const channelPointStmt = db.prepare("SELECT COUNT(*) AS count FROM song_history WHERE requestType = 'channelPoint' AND LOWER(requesterLogin) != 'calamarigold'");
        const channelPointResult = channelPointStmt.get();
        const channelPointCount = channelPointResult.count || 0;

        return {
            totalDuration,
            averageDuration,
            donationCount,
            channelPointCount
        };
    } catch (error) {
        console.error('[Database] Error getting history stats:', error);
        return {
            totalDuration: 0,
            averageDuration: 0,
            donationCount: 0,
            channelPointCount: 0
        };
    }
}

module.exports = {
    initDatabase,
    closeDatabase,
    addSongToDbQueue,
    removeSongFromDbQueue,  
    clearDbQueue,
    loadInitialState,
    saveActiveSongToDB,
    clearActiveSongFromDB,
    loadActiveSongFromDB,
    saveSetting,
    addBlacklistPattern,
    removeBlacklistPattern,
    addBlockedUser,
    removeBlockedUser,
    logCompletedSong,
    clearDbHistory,
    deleteHistoryItem,
    getRecentHistory,
    getHistoryWithOffset,
    getTotalHistoryCount,
    getTodayHistoryCount,
    incrementTodaysCount,
    resetTodaysCount,
    updateSongSpotifyDataAndDetailsInDbQueue,
    updateSongYouTubeUrlAndDetailsInDbQueue,
    removeSpotifyDataFromSong,
    getDb,
    updateHistoryTimestamp,
    getHistoryForUser,
    replaceRequesterNameInHistory,
    getHistoryEntriesByRequesterName,
    getHistoryStats
}; 