require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const http = require('http');
const socketIO = require('socket.io');
const queueRoutes = require('./routes/queue');
const youtubeRoutes = require('./routes/youtube');
const { router: authRoutes, isAuthenticated } = require('./routes/auth');
const db = require('./db/database');
const session = require('express-session');
const passport = require('./config/passport');
const SQLiteStore = require('connect-sqlite3')(session);

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            connectSrc: ["'self'", "ws:", "wss:"],
            imgSrc: ["'self'", "https://i.ytimg.com", "https://brand.twitch.tv"] // Allow Twitch and YouTube images
        }
    }
}));
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Session configuration
app.use(session({
    store: new SQLiteStore({
        db: 'sessions.db',
        dir: './data'
    }),
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// Make io available to routes
app.set('io', io);

// Auth routes
app.use('/auth', authRoutes);

// Public API routes
app.use('/api/queue', queueRoutes);

// Protected API routes - for user-specific features
app.use('/api/user/requests', isAuthenticated, queueRoutes); // Future endpoint for user's request history
app.use('/api/youtube', youtubeRoutes);

// Serve main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// WebSocket connection handling
io.on('connection', (socket) => {
    console.log('Client connected');

    // Send initial queue state
    db.all(`
        SELECT r.*, u.name as requester
        FROM requests r
        LEFT JOIN users u ON r.user_id = u.id
        ORDER BY r.priority DESC, r.timestamp ASC
    `, [], (err, rows) => {
        if (err) {
            console.error('Error fetching initial queue state:', err);
            socket.emit('error', { message: 'Failed to fetch queue state' });
            return;
        }
        socket.emit('queueUpdate', rows);
    });

    // Send initial queue status
    db.get('SELECT value FROM settings WHERE key = "queue_enabled"', [], (err, row) => {
        if (err) {
            console.error('Error fetching queue status:', err);
            socket.emit('error', { message: 'Failed to fetch queue status' });
            return;
        }
        socket.emit('queueStatus', row ? row.value === '1' : true);
    });

    socket.on('error', (error) => {
        console.error('Socket error:', error);
        socket.emit('error', { message: 'An unexpected error occurred' });
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
server.listen(process.env.PORT || 3000, () => {
    console.log(`Server running on port ${process.env.PORT || 3000}`);
}); 