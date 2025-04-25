const chalk = require('chalk');

let seSocket = null;
let wasAuthFailure = false; // Flag to track authentication failures

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
        wasAuthFailure = false; // Reset flag on successful authentication
    });

    // Handle connection errors
    seSocket.on('unauthorized', (reason) => {
        console.error(chalk.red('[StreamElements] Authentication failed:'), reason);
        wasAuthFailure = true; // Set flag indicating auth failure
        if(seSocket) seSocket.disconnect();
    });

    seSocket.on('disconnect', (reason) => {
        // Check if disconnection was due to auth failure
        if (wasAuthFailure) {
            console.error(chalk.red.bold('[StreamElements] Authentication failed. Automatic reconnection disabled. Please check your JWT token and restart the server.'));
            seSocket = null; // Clear the socket reference
            // Do NOT attempt to reconnect automatically
        } else {
            // Handle regular disconnections (network issues, etc.)
            console.warn(chalk.yellow(`[StreamElements] Disconnected (Reason: ${reason || 'N/A'}). Will attempt reconnect...`));
            
            // Attempt to reconnect only if not manually disconnected and not an auth failure
            if (seSocket) { // Check if socket still exists (might be null if disconnectFromStreamElements was called)
                // Use a timeout for reconnection attempt
                setTimeout(() => {
                    // Check again inside timeout in case it was disconnected in the meantime
                    if (seSocket && !wasAuthFailure) { // Double-check flag and socket status
                         console.log(chalk.blue('[StreamElements] Attempting reconnection...'));
                         // Re-establish connection - this will create a new socket instance
                         connectToStreamElements(config, onTipCallback, onRedemptionCallback);
                    } else if (wasAuthFailure) {
                        console.log(chalk.yellow('[StreamElements] Reconnection attempt aborted due to previous authentication failure.'));
                    } else {
                        console.log(chalk.blue('[StreamElements] Disconnected, socket reference became null before reconnection attempt.'));
                    }
                }, 5000); // 5-second delay
            } else {
                 console.log(chalk.blue('[StreamElements] Disconnected, but socket reference already null. No automatic reconnection attempt.'));
            }
        }
    });

    seSocket.on('connect_error', (error) => {
        console.error(chalk.red('[StreamElements] Connection error:'), error);
        // Optionally handle connection errors differently, e.g., exponential backoff
        // For now, rely on disconnect event for retries unless it's an auth failure
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
    if (seSocket) {
        console.log(chalk.blue('[StreamElements] Disconnecting from StreamElements...'));
        wasAuthFailure = false; // Reset flag on manual disconnect
        seSocket.disconnect();
        seSocket = null;
    }
}

module.exports = {
    connectToStreamElements,
    disconnectFromStreamElements
}; 