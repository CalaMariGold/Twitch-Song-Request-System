const chalk = require('chalk');

let seSocket = null;

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
    });

    // Handle connection errors
    seSocket.on('unauthorized', (reason) => {
        console.error(chalk.red('[StreamElements] Authentication failed:'), reason);
        if(seSocket) seSocket.disconnect();
    });

    seSocket.on('disconnect', () => {
        console.warn(chalk.yellow('[StreamElements] Disconnected. Will attempt reconnect...'));
        // Attempt to reconnect after a delay
        setTimeout(() => connectToStreamElements(config, onTipCallback, onRedemptionCallback), 5000);
    });

    seSocket.on('connect_error', (error) => {
        console.error(chalk.red('[StreamElements] Connection error:'), error);
    });

    // Listen for events (tips/donations)
    seSocket.on('event', async (event) => {
        // Handle Channel Point Redemption events from StreamElements
        if (event.type === 'channelPointsRedemption') {
            const receivedTitle = event.data?.redemption;

            // Check if the received title matches the one configured in .env
            if (!receivedTitle || !TARGET_REWARD_TITLE || receivedTitle !== TARGET_REWARD_TITLE) {
                console.log(chalk.grey(`[StreamElements] Ignored redemption: Title "${receivedTitle || 'N/A'}" does not match TARGET_REWARD_TITLE "${TARGET_REWARD_TITLE || 'Not Set'}".`));
                return; // Ignore this redemption
            }
            
            if (onRedemptionCallback && typeof onRedemptionCallback === 'function') {
                try {
                    const userName = event.data.username || 'Anonymous';
                    const userInput = event.data.message || ''; // Get user input (URL) from message field
                    console.log(chalk.magenta(`[StreamElements] Received channel point redemption: ${userName} - Reward: "${receivedTitle}" - Input: "${userInput}"`));
                    
                    // Call the callback with the redemption data
                    await onRedemptionCallback({
                        id: event.data._id || event._id || Date.now().toString(),
                        username: userName,
                        message: userInput,
                        timestamp: event.createdAt || new Date().toISOString(),
                        rewardTitle: receivedTitle
                    });
                } catch (error) {
                    console.error(chalk.red('[StreamElements] Error processing channel point redemption:'), error);
                }
            }
            return;
        }

        // Check if it's a tip/donation event
        if (event.type === 'tip') {
            if (onTipCallback && typeof onTipCallback === 'function') {
                try {
                    // Extract donation information
                    const userName = event.data.username || 'Anonymous';
                    const amount = event.data.amount || 0;
                    const currency = event.data.currency || 'USD';
                    const message = event.data.message || '';

                    console.log(chalk.magenta(`[StreamElements] Received donation: ${userName} - ${amount} ${currency} - Msg: "${message}"`));
                    
                    // Call the callback with the donation data
                    await onTipCallback({
                        id: event.data._id || Date.now().toString(),
                        username: userName,
                        amount,
                        currency,
                        message,
                        timestamp: event.createdAt || new Date().toISOString()
                    });
                } catch (error) {
                    console.error(chalk.red('[StreamElements] Error processing donation:'), error);
                }
            }
        }
    });

    return seSocket;
}

/**
 * Disconnects from the StreamElements Socket API
 */
function disconnectFromStreamElements() {
    if (seSocket) {
        console.log(chalk.blue('[StreamElements] Disconnecting from StreamElements...'));
        seSocket.disconnect();
        seSocket = null;
    }
}

module.exports = {
    connectToStreamElements,
    disconnectFromStreamElements
}; 