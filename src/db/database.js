const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Create database connection
const db = new sqlite3.Database(path.join(__dirname, '../../data/songRequests.db'), (err) => {
  if (err) {
    console.error('Error connecting to database:', err);
    return;
  }
  console.log('Connected to SQLite database');
  initDatabase();
});

// Initialize database tables
function initDatabase() {
  db.serialize(() => {
    // Users table
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      twitch_id TEXT UNIQUE,
      name TEXT
    )`);

    // Requests table
    db.run(`CREATE TABLE IF NOT EXISTS requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      song_title TEXT,
      song_link TEXT,
      type TEXT,
      priority INTEGER,
      timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
      video_duration TEXT,
      duration_seconds INTEGER,
      thumbnail_url TEXT,
      channel_name TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )`);

    // Settings table
    db.run(`CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )`);

    // Video metadata cache table
    db.run(`CREATE TABLE IF NOT EXISTS video_cache (
      video_id TEXT PRIMARY KEY,
      metadata TEXT,
      timestamp TEXT DEFAULT CURRENT_TIMESTAMP
    )`);

    // Create indexes
    db.run('CREATE INDEX IF NOT EXISTS idx_requests_user_id ON requests(user_id)');
    db.run('CREATE INDEX IF NOT EXISTS idx_requests_priority ON requests(priority)');
    db.run('CREATE INDEX IF NOT EXISTS idx_video_cache_timestamp ON video_cache(timestamp)');
  });
}

// Export database connection
module.exports = db; 