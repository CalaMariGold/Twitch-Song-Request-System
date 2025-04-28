const chalk = require('chalk');

/**
 * Fetches all-time statistics from the database
 * @param {Object} db - The database connection
 * @returns {Object} Statistics including top requesters, songs, and artists
 */
function fetchAllTimeStats(db) {
    try {
        
        // Define the queries for each statistic
        const topRequestersQuery = `
            SELECT MIN(requester) as requester, COUNT(*) as request_count 
            FROM song_history 
            GROUP BY LOWER(requesterLogin) 
            HAVING COUNT(*) > 1
            ORDER BY request_count DESC 
            LIMIT 20
        `;
        
        const topSongsQuery = `
            SELECT title, artist, COUNT(*) as play_count 
            FROM song_history 
            GROUP BY title, artist 
            HAVING COUNT(*) > 1
            ORDER BY play_count DESC 
            LIMIT 20
        `;
        
        const topArtistsQuery = `
            SELECT artist, COUNT(*) as play_count 
            FROM song_history 
            WHERE artist IS NOT NULL AND artist != '' 
            GROUP BY artist 
            HAVING COUNT(*) > 1
            ORDER BY play_count DESC 
            LIMIT 20
        `;
        
        // Execute the queries
        const topRequesters = db.prepare(topRequestersQuery).all();
        const topSongs = db.prepare(topSongsQuery).all();
        const topArtists = db.prepare(topArtistsQuery).all();
        
        const stats = {
            topRequesters,
            topSongs,
            topArtists
        };
        
        return stats;
    } catch (error) {
        console.error(chalk.red('[Statistics] Error fetching all-time statistics:'), error);
        throw error;
    }
}

module.exports = {
    fetchAllTimeStats
}; 