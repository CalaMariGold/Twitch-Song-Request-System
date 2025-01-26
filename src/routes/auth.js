const express = require('express');
const passport = require('passport');
const router = express.Router();

// Middleware to check if user is authenticated
const isAuthenticated = (req, res, next) => {
    if (req.isAuthenticated()) {
        return next();
    }
    res.status(401).json({ error: 'Unauthorized' });
};

// Initiate Twitch OAuth login
router.get('/twitch', passport.authenticate('twitch'));

// Twitch OAuth callback
router.get('/twitch/callback',
    passport.authenticate('twitch', {
        successRedirect: '/',
        failureRedirect: '/login'
    })
);

// Get current user
router.get('/user', isAuthenticated, (req, res) => {
    res.json({
        id: req.user.id,
        twitch_id: req.user.twitch_id,
        name: req.user.name
    });
});

// Logout
router.post('/logout', (req, res) => {
    req.logout((err) => {
        if (err) {
            console.error('Error during logout:', err);
            return res.status(500).json({ error: 'Error during logout' });
        }
        res.json({ message: 'Logged out successfully' });
    });
});

module.exports = {
    router,
    isAuthenticated
}; 