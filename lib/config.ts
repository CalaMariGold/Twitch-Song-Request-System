import { EnvConfig } from './types'

/**
 * Environment variable configuration with validation
 */
export const config: EnvConfig = {
  YOUTUBE_API_KEY: process.env.YOUTUBE_API_KEY || '',
  SOCKET_PORT: parseInt(process.env.SOCKET_PORT || '3002', 10),
  NODE_ENV: (process.env.NODE_ENV || 'development') as 'development' | 'production',
  NEXT_PUBLIC_TWITCH_CLIENT_ID: process.env.NEXT_PUBLIC_TWITCH_CLIENT_ID || '',
  TWITCH_CLIENT_SECRET: process.env.TWITCH_CLIENT_SECRET || '',
  NEXT_PUBLIC_TWITCH_REDIRECT_URI: process.env.NEXT_PUBLIC_TWITCH_REDIRECT_URI || ''
}

/**
 * Validates required environment variables
 */
export function validateConfig() {
  const required = [
    'YOUTUBE_API_KEY',
    'NEXT_PUBLIC_TWITCH_CLIENT_ID',
    'TWITCH_CLIENT_SECRET',
    'NEXT_PUBLIC_TWITCH_REDIRECT_URI'
  ]
  const missing = required.filter(key => !config[key as keyof EnvConfig])
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`)
  }
}

/**
 * Application constants
 */
export const constants = {
  SOCKET_RECONNECT_ATTEMPTS: 5,
  SOCKET_RECONNECT_DELAY: 1000,
  MAX_SONG_DURATION_MINUTES: 5,
  YOUTUBE_API_BASE_URL: 'https://www.googleapis.com/youtube/v3',
} as const

/**
 * Socket.IO event names
 */
export const socketEvents = {
  // Server -> Client events
  INITIAL_STATE: 'initialState',
  QUEUE_UPDATE: 'queueUpdate',
  HISTORY_UPDATE: 'historyUpdate',
  ACTIVE_SONG: 'activeSong',
  NEW_SONG_REQUEST: 'newSongRequest',
  SONG_FINISHED: 'songFinished',
  SETTINGS_UPDATE: 'settingsUpdate',
  BLACKLIST_UPDATE: 'blacklistUpdate',
  BLOCKED_USERS_UPDATE: 'blockedUsersUpdate',
  ALL_TIME_STATS_UPDATE: 'allTimeStatsUpdate',
  ALL_TIME_STATS_ERROR: 'allTimeStatsError',
  MORE_HISTORY_DATA: 'moreHistoryData',
  TOTAL_COUNTS_UPDATE: 'totalCountsUpdate',
  TODAYS_COUNT_UPDATE: 'todaysCountUpdate',
  SONG_DETAILS_FOR_PLAN_RESPONSE: 'songDetailsForPlanResponse',
  EDIT_SPOTIFY_SUCCESS: 'editSpotifySuccess',
  EDIT_SPOTIFY_ERROR: 'editSpotifyError',
  
  // Client -> Server events
  GET_STATE: 'getState',
  GET_YOUTUBE_DETAILS: 'getYouTubeDetails',
  UPDATE_QUEUE: 'updateQueue',
  ADD_SONG: 'addSong',
  REMOVE_SONG: 'removeSong',
  CLEAR_QUEUE: 'clearQueue',
  RESET_SYSTEM: 'resetSystem',
  SET_MAX_DURATION: 'setMaxDuration',
  UPDATE_ACTIVE_SONG: 'updateActiveSong',
  MARK_SONG_AS_FINISHED: 'markSongAsFinished',
  RETURN_TO_QUEUE: 'returnToQueue',
  UPDATE_BLACKLIST: 'updateBlacklist',
  UPDATE_BLOCKED_USERS: 'updateBlockedUsers',
  GET_ALL_TIME_STATS: 'getAllTimeStats',
  DELETE_HISTORY_ITEM: 'deleteHistoryItem',
  GET_MORE_HISTORY: 'getMoreHistory',
  DELETE_MY_REQUEST: 'deleteMyRequest',
  GET_SONG_DETAILS_FOR_PLAN: 'getSongDetailsForPlan',
  EDIT_MY_SONG_SPOTIFY: 'editMySongSpotify'
} as const 