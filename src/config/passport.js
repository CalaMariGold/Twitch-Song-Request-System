const passport = require('passport');
const TwitchStrategy = require('passport-twitch-new').Strategy;
const db = require('../db/database');

// Serialize user for the session
passport.serializeUser((user, done) => {
    done(null, user.id);
});

// Deserialize user from the session
passport.deserializeUser((id, done) => {
    db.get('SELECT * FROM users WHERE id = ?', [id], (err, user) => {
        if (err) return done(err);
        done(null, user);
    });
});

// Configure Twitch Strategy
passport.use(new TwitchStrategy({
    clientID: process.env.TWITCH_CLIENT_ID,
    clientSecret: process.env.TWITCH_CLIENT_SECRET,
    callbackURL: process.env.TWITCH_CALLBACK_URL || 'http://localhost:3000/auth/twitch/callback',
    scope: ['user:read:email']
}, async (accessToken, refreshToken, profile, done) => {
    try {
        // Check if user exists
        db.get('SELECT * FROM users WHERE twitch_id = ?', [profile.id], (err, user) => {
            if (err) return done(err);
            
            if (user) {
                // Update existing user
                db.run('UPDATE users SET name = ? WHERE twitch_id = ?', 
                    [profile.display_name, profile.id],
                    (err) => {
                        if (err) return done(err);
                        return done(null, user);
                    }
                );
            } else {
                // Create new user
                db.run('INSERT INTO users (twitch_id, name) VALUES (?, ?)',
                    [profile.id, profile.display_name],
                    function(err) {
                        if (err) return done(err);
                        return done(null, { id: this.lastID, twitch_id: profile.id, name: profile.display_name });
                    }
                );
            }
        });
    } catch (error) {
        return done(error);
    }
}));

module.exports = passport; 