const fetch = require('node-fetch');
const tmi = require('tmi.js');
const chalk = require('chalk');

// Twitch API configuration
let twitchAppAccessToken = null;
let twitchTokenExpiry = null;
let tmiClient = null;

/**
 * Initializes the Twitch chat client and connects to the channel
 * @param {Object} config - Configuration for the Twitch chat client
 * @returns {Object|null} The connected TMI client or null if configuration is missing
 */
function initTwitchChat(config) {
    const { TWITCH_BOT_USERNAME, TWITCH_BOT_OAUTH_TOKEN, TWITCH_CHANNEL_NAME } = config;
    
    if (!TWITCH_BOT_USERNAME || !TWITCH_BOT_OAUTH_TOKEN || !TWITCH_CHANNEL_NAME) {
        console.error(chalk.red('Twitch bot credentials (username, token, channel) are missing in .env file. Chat features disabled.'));
        return null;
    }

    const tmiOpts = {
        identity: {
            username: TWITCH_BOT_USERNAME,
            password: TWITCH_BOT_OAUTH_TOKEN,
        },
        channels: [TWITCH_CHANNEL_NAME],
    };

    tmiClient = new tmi.client(tmiOpts);

    tmiClient.on('message', (channel, tags, message, self) => {
        // Handle incoming messages if needed in the future
        if (self) return; // Ignore messages from the bot itself
    });

    tmiClient.on('connected', (addr, port) => {
        console.log(chalk.green(`✅ [Twitch Chat] Connected (${addr}:${port}) in channel #${TWITCH_CHANNEL_NAME}`));
        // Send startup message for the streamer
        sendChatMessage(`✅ Song Request Bot connected to channel ${TWITCH_CHANNEL_NAME}.`);
    });

    tmiClient.on('disconnected', (reason) => {
        console.log(chalk.yellow(`* [Twitch Chat] Disconnected: ${reason}`));
    });

    tmiClient.connect().catch(err => console.error(chalk.red('[Twitch Chat] Connection error:'), err));
    
    return tmiClient;
}

/**
 * Sends a message to the Twitch chat
 * @param {string} message - The message to send to chat
 */
function sendChatMessage(message) {
    if (tmiClient && tmiClient.readyState() === 'OPEN') {
        tmiClient.say(process.env.TWITCH_CHANNEL_NAME, message)
            .then(() => {})
            .catch((err) => {
                console.error(chalk.red(`[Twitch Chat] Error sending message: ${err}`));
            });
    } else {
        console.warn(chalk.yellow('[Twitch Chat] Could not send message, client not connected or configured.'));
    }
}

/**
 * Gets an app access token for the Twitch API
 * @returns {Promise<string>} The access token
 */
async function getTwitchAppAccessToken() {
    if (twitchAppAccessToken && twitchTokenExpiry && twitchTokenExpiry > Date.now()) {
        return twitchAppAccessToken;
    }

    const TWITCH_CLIENT_ID = process.env.NEXT_PUBLIC_TWITCH_CLIENT_ID;
    const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
    
    if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET) {
        throw new Error('Twitch API credentials (client ID, client secret) are missing');
    }

    const tokenUrl = `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`;

    try {
        const response = await fetch(tokenUrl, { method: 'POST' });
        if (!response.ok) {
            throw new Error(`Twitch token request failed with status ${response.status}: ${await response.text()}`);
        }
        const data = await response.json();
        twitchAppAccessToken = data.access_token;
        // Set expiry a bit earlier than actual expiry for safety
        twitchTokenExpiry = Date.now() + (data.expires_in - 300) * 1000;
        console.log(chalk.green('✅ [Auth] Successfully fetched new Twitch App Access Token.'));
        return twitchAppAccessToken;
    } catch (error) {
        console.error(chalk.red('[Auth] Error fetching Twitch App Access Token:'), error);
        twitchAppAccessToken = null; // Reset token on error
        twitchTokenExpiry = null;
        throw error; // Re-throw error to indicate failure
    }
}

/**
 * Gets user information from the Twitch API
 * @param {string} username - The username to look up
 * @returns {Promise<Object|null>} The user information or null if not found
 */
async function getTwitchUser(username) {
    if (!username) {
        console.warn(chalk.yellow('[Twitch API] getTwitchUser called with no username.'));
        return null; // Return null if no username provided
    }
    
    const TWITCH_CLIENT_ID = process.env.NEXT_PUBLIC_TWITCH_CLIENT_ID;
    
    if (!TWITCH_CLIENT_ID) {
        console.error(chalk.red('[Twitch API] Client ID not configured in .env'));
        return null;
    }

    try {
        const accessToken = await getTwitchAppAccessToken();
        if (!accessToken) {
            throw new Error('Failed to get Twitch App Access Token.');
        }

        const userUrl = `https://api.twitch.tv/helix/users?login=${encodeURIComponent(username)}`;
        const response = await fetch(userUrl, {
            headers: {
                'Client-ID': TWITCH_CLIENT_ID,
                'Authorization': `Bearer ${accessToken}`
            }
        });

        if (!response.ok) {
            if (response.status === 401) { // Token might have expired prematurely
                console.warn(chalk.yellow('[Twitch API] Returned 401, attempting to refresh app token...'));
                twitchAppAccessToken = null; // Force token refresh
                const newAccessToken = await getTwitchAppAccessToken();
                if (!newAccessToken) throw new Error('Failed to refresh Twitch token.');
                // Retry the request with the new token
                const retryResponse = await fetch(userUrl, {
                    headers: {
                        'Client-ID': TWITCH_CLIENT_ID,
                        'Authorization': `Bearer ${newAccessToken}`
                    }
                });
                if (!retryResponse.ok) {
                    throw new Error(`Twitch user request failed after retry with status ${retryResponse.status}: ${await retryResponse.text()}`);
                }
                const retryData = await retryResponse.json();
                return retryData.data && retryData.data.length > 0 ? retryData.data[0] : null;
            } else {
                throw new Error(`Twitch user request failed with status ${response.status}: ${await response.text()}`);
            }
        }

        const data = await response.json();
        // Return the first user found, or null if no user matches
        return data.data && data.data.length > 0 ? data.data[0] : null;
    } catch (error) {
        console.error(chalk.red(`[Twitch API] Error fetching user profile for ${username}:`), error);
        return null; // Return null on error
    }
}

/**
 * Disconnects from Twitch chat
 * @returns {boolean} True if disconnected successfully, false otherwise
 */
function disconnectFromTwitch() {
    if (!tmiClient) {
        console.warn(chalk.yellow('[Twitch Chat] No active Twitch connection to disconnect.'));
        return false;
    }
    
    try {
        tmiClient.disconnect()
            .then(() => console.log(chalk.blue('[Twitch Chat] Disconnected successfully.')))
            .catch(err => console.error(chalk.red('[Twitch Chat] Error during disconnect:'), err));
        
        return true;
    } catch (error) {
        console.error(chalk.red('[Twitch Chat] Error disconnecting:'), error);
        return false;
    }
}

module.exports = {
    initTwitchChat,
    sendChatMessage,
    getTwitchUser,
    disconnectFromTwitch
}; 