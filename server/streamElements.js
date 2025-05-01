const chalk = require('chalk');
// Use the socket.io-client library for type hinting if using TypeScript, otherwise just for info
const ioClient = require('socket.io-client'); 

/** @type {ioClient.Socket | null} */
let seSocket = null;
let wasAuthFailure = false; // Flag to track authentication failures
let reconnectTimer = null; // Timer for delayed reconnection attempts

/**
 * Connects to the StreamElements Socket API for real-time events
 * @param {Object} config - StreamElements configuration
 * @param {string} config.SE_JWT_TOKEN - StreamElements JWT token
 * @param {string} config.SE_ACCOUNT_ID - StreamElements account ID
 * @param {string} config.TARGET_REWARD_TITLE - Title to match for redemptions
 * @param {Function} onTipCallback - Callback for tip/donation events
 * @param {Function} onRedemptionCallback - Callback for redemption events
 * @returns {Object|null} StreamElements socket connection or null if configuration is missing
 */
function connectToStreamElements(config, onTipCallback, onRedemptionCallback) {
    const { SE_JWT_TOKEN, SE_ACCOUNT_ID, TARGET_REWARD_TITLE } = config;
    
    if (!SE_JWT_TOKEN || !SE_ACCOUNT_ID) {
        console.warn(chalk.yellow('StreamElements configuration (JWT token, account ID) are missing in .env file. StreamElements donations disabled.'));
        return null;
    }

    // --- Check if already connected or connecting ---
    if (seSocket && (seSocket.connected || seSocket.connecting)) {
        console.log(chalk.blue('[StreamElements] Already connected or connecting. Ignoring request.'));
        return seSocket;
    }
    // --- Clear any existing reconnect timer ---
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
    // --- Ensure previous socket is cleaned up if exists ---
    if (seSocket) {
        console.log(chalk.blue('[StreamElements] Cleaning up previous socket instance before reconnecting...'));
        seSocket.removeAllListeners(); // Remove all listeners
        seSocket.disconnect();      // Ensure disconnect is called
        seSocket = null;            // Nullify reference
    }

    // Import socket.io-client only when needed (already imported above for types)
    // const ioClient = require('socket.io-client'); 
    
    console.log(chalk.blue('[StreamElements] Attempting to connect...'));
    // Connect to StreamElements socket server
    seSocket = ioClient.connect('https://realtime.streamelements.com', {
        transports: ['websocket'],
        reconnection: true,         // Enable built-in reconnection attempts
        reconnectionAttempts: 5,    // Limit automatic attempts (adjust as needed)
        reconnectionDelay: 5000,    // Delay between automatic attempts
        reconnectionDelayMax: 30000 // Maximum delay
    });

    // --- Remove previous listeners if any lingered (defensive) ---
    seSocket.removeAllListeners(); 

    // Connection event handlers
    seSocket.on('connect', () => {
        // Authenticate with JWT
        seSocket.emit('authenticate', {
            method: 'jwt',
            token: SE_JWT_TOKEN
        });
        // --- Clear reconnect timer on successful connect ---
        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }
    });

    seSocket.on('authenticated', () => {
        console.log(chalk.green('✅ [StreamElements] Connected and Authenticated. Listening for donations and channel point redemptions.'));
        wasAuthFailure = false; // Reset flag on successful authentication
    });

    // Handle connection errors
    seSocket.on('unauthorized', (reason) => {
        console.error(chalk.red('[StreamElements] Authentication failed:'), reason);
        wasAuthFailure = true; // Set flag indicating auth failure
        if(seSocket) {
            seSocket.disconnect(); // Disconnect on auth failure
            // No automatic reconnect needed here, handled by disconnect event
        }
    });

    seSocket.on('disconnect', (reason) => {
        console.warn(chalk.yellow(`[StreamElements] Disconnected (Reason: ${reason || 'N/A'}).`));
        
        // If auth failure occurred, log and prevent any further action
        if (wasAuthFailure) {
            console.error(chalk.red.bold('[StreamElements] Authentication failed. Automatic reconnection disabled. Please check your JWT token and restart the server.'));
            // Ensure socket is fully cleaned up
            if (seSocket) {
                seSocket.removeAllListeners();
                seSocket.disconnect(); // Explicitly disconnect again if needed
                seSocket = null;
            }
            if (reconnectTimer) {
                clearTimeout(reconnectTimer);
                reconnectTimer = null;
            }
            return; // Stop further processing
        }

        // Handle regular disconnections (network issues, etc.) only if socket exists and not already reconnecting via timer
        if (seSocket && !reconnectTimer) { 
            console.log(chalk.blue('[StreamElements] Will attempt manual reconnect after delay if automatic reconnection fails...'));
            
            // Schedule a manual reconnection attempt as a fallback
            // This timer will be cleared if 'connect' fires successfully before the timeout
            reconnectTimer = setTimeout(() => {
                console.log(chalk.blue('[StreamElements] Manual reconnection timer triggered. Attempting to reconnect...'));
                reconnectTimer = null; // Clear timer ref
                 // --- Check socket status before attempting manual reconnect ---
                if (seSocket && !seSocket.connected && !seSocket.connecting && !wasAuthFailure) {
                    // Attempt to trigger the client's reconnect mechanism if available,
                    // or re-initiate connection sequence carefully.
                    // Using connect() might re-initiate the handshake.
                     console.log(chalk.blue('[StreamElements] Calling socket.connect() for manual attempt...'));
                    seSocket.connect(); 
                    // Avoid calling the main connectToStreamElements recursively
                } else if (!seSocket) {
                     console.log(chalk.yellow('[StreamElements] Manual reconnect aborted: Socket is null.'));
                     // Optionally, attempt a full re-initiation if desired, but be cautious
                     // connectToStreamElements(config, onTipCallback, onRedemptionCallback); 
                } else if (seSocket.connected) {
                     console.log(chalk.green('[StreamElements] Manual reconnect aborted: Socket already connected.'));
                } else if (seSocket.connecting) {
                    console.log(chalk.blue('[StreamElements] Manual reconnect aborted: Socket already connecting.'));
                } else if (wasAuthFailure) {
                    console.log(chalk.yellow('[StreamElements] Manual reconnect aborted due to previous authentication failure.'));
                }
            }, 15000); // Increased fallback delay (e.g., 15 seconds)
        } else if (reconnectTimer) {
             console.log(chalk.blue('[StreamElements] Disconnected, but manual reconnect timer already pending.'));
        } else {
             console.log(chalk.blue('[StreamElements] Disconnected, but socket reference was already null. No reconnection attempt needed.'));
        }
    });

    seSocket.on('connect_error', (error) => {
        console.error(chalk.red('[StreamElements] Connection error:'), error.message || error);
        // Built-in reconnection attempts handle this, but log is useful.
        // If the error is the TLS one specifically, log extra details if possible
        if (error.message && error.message.includes('TLS connection')) {
             console.error(chalk.red.bold('[StreamElements] TLS connection error detail:'), error);
        }
        // If it's a persistent error, the disconnect handler will eventually trigger
        // the manual reconnect fallback or stop if it's an auth failure.
    });

    // --- Handle reconnection attempts provided by socket.io-client ---
    seSocket.on('reconnect_attempt', (attemptNumber) => {
        console.log(chalk.blue(`[StreamElements] Automatic reconnect attempt #${attemptNumber}...`));
    });

    seSocket.on('reconnect_error', (error) => {
        console.error(chalk.red(`[StreamElements] Automatic reconnect error:`), error.message || error);
    });

    seSocket.on('reconnect_failed', () => {
        console.error(chalk.red.bold('[StreamElements] Automatic reconnection failed after multiple attempts. Manual fallback might trigger if configured.'));
        // The disconnect handler's timeout might take over here if still active
    });

    // Listen for events (tips/donations)
    seSocket.on('event', async (event) => {
        // Process the event based on its type
        try {
            switch (event.type) {
                case 'channelPointsRedemption':
                    await processRedemptionEvent(event, TARGET_REWARD_TITLE, onRedemptionCallback);
                    break;
                    
                case 'tip':
                    await processTipEvent(event, onTipCallback);
                    break;
                    
                default:
                    // Ignore other event types
                    break;
            }
        } catch (error) {
            console.error(chalk.red(`[StreamElements] Error processing ${event.type} event:`), error);
        }
    });

    return seSocket;
}

/**
 * Process channel point redemption events
 * @param {Object} event - The StreamElements event object
 * @param {string} targetRewardTitle - The configured reward title to match
 * @param {Function} callback - The callback function to execute
 */
async function processRedemptionEvent(event, targetRewardTitle, callback) {
    const receivedTitle = event.data?.redemption;

    // Check if the received title matches the one configured in .env
    if (!receivedTitle || !targetRewardTitle || receivedTitle !== targetRewardTitle) {
        console.log(chalk.grey(`[StreamElements] Ignored redemption: Title "${receivedTitle || 'N/A'}" does not match target "${targetRewardTitle || 'Not Set'}".`));
        return; // Ignore this redemption
    }
    
    if (!callback || typeof callback !== 'function') {
        return; // No callback to execute
    }
    
    const userName = event.data.username || 'Anonymous';
    const userInput = event.data.message || ''; // Get user input (URL) from message field
    console.log(chalk.magenta(`[StreamElements] Received channel point redemption: ${userName} - Reward: "${receivedTitle}" - Input: "${userInput}"`));
    
    // Call the callback with the redemption data
    await callback({
        id: event.data._id || event._id || Date.now().toString(),
        username: userName,
        message: userInput,
        timestamp: event.createdAt || new Date().toISOString(),
        rewardTitle: receivedTitle
    });
}

/**
 * Process tip/donation events
 * @param {Object} event - The StreamElements event object
 * @param {Function} callback - The callback function to execute
 */
async function processTipEvent(event, callback) {
    if (!callback || typeof callback !== 'function') {
        return; // No callback to execute
    }
    
    // Extract donation information
    const userName = event.data.username || 'Anonymous';
    const amount = event.data.amount || 0;
    const currency = event.data.currency || 'USD';
    const message = event.data.message || '';

    console.log(chalk.magenta(`[StreamElements] Received donation: ${userName} - ${amount} ${currency} - Msg: "${message}"`));
    
    // Call the callback with the donation data
    await callback({
        id: event.data._id || Date.now().toString(),
        username: userName,
        amount,
        currency,
        message,
        timestamp: event.createdAt || new Date().toISOString()
    });
}

/**
 * Disconnects from the StreamElements Socket API
 */
function disconnectFromStreamElements() {
    // --- Clear any pending reconnect timer ---
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
    if (seSocket) {
        console.log(chalk.blue('[StreamElements] Disconnecting from StreamElements manually...'));
        wasAuthFailure = false; // Reset flag on manual disconnect
        seSocket.removeAllListeners(); // Remove listeners before disconnecting
        seSocket.disconnect();
        seSocket = null;
    } else {
         console.log(chalk.blue('[StreamElements] Already disconnected.'));
    }
}

module.exports = {
    connectToStreamElements,
    disconnectFromStreamElements
}; 