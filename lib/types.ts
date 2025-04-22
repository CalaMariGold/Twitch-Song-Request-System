import { Server as SocketIOServer } from 'socket.io'

declare global {
    var io: SocketIOServer | undefined
}

/**
 * Represents a song request in the queue or history
 */
export interface SongRequest {
  /** Unique identifier for the request */
  id: string
  /** Full YouTube URL of the requested song */
  youtubeUrl: string
  /** Username of the person who requested the song */
  requester: string
  /** Login name of the requester (for Twitch URL) */
  requesterLogin?: string
  /** Avatar URL of the requester */
  requesterAvatar: string
  /** ISO timestamp - for queue items: when requested, for history items: completedAt */
  timestamp: string
  /** Title of the song (from YouTube) */
  title?: string
  /** Artist/channel name (from YouTube) */
  artist?: string
  /** YouTube Channel ID (for linking) */
  channelId?: string
  /** Formatted duration (e.g., "3:45") */
  duration?: string
  /** Duration in seconds */
  durationSeconds?: number
  /** Thumbnail URL of the song */
  thumbnailUrl?: string
  /** Source of the song (youtube, spotify, etc.) */
  source?: string // Be more flexible than just 'youtube' | 'spotify'
  /** Type of request (determines priority and limits) */
  requestType: 'channelPoint' | 'donation' | string // Allow for other types potentially
  /** Donation details (if requestType is 'donation') */
  donationInfo?: {
    amount: number;
    currency: string;
  }
  /** Channel point redemption details */
  channelPointReward?: {
      title: string; // Simplified from backend for frontend use
  };
  /** Status for history display if needed */
  status?: 'completed' | 'skipped'
  /** Origin of the data (database, socket event, etc.) */
  origin?: string;
}

/**
 * Simplified state for the public page queue view
 */
export interface QueueState {
  queue: SongRequest[];
  history: SongRequest[];
  activeSong: SongRequest | null;
  isLoading: boolean;
  error: Error | null;
}

/**
 * YouTube API response interfaces
 */
export interface YouTubeVideoDetails {
  title: string
  channelTitle: string
  channelId: string
  duration: string
  durationSeconds: number
  thumbnailUrl: string
}

/**
 * Application Settings
 */
export interface Settings {
  maxDuration?: number; // in minutes
}

/**
 * Blacklist Item
 */
export interface BlacklistItem {
    id: string; // From DB
    term: string; // 'pattern' in DB
    type: 'song' | 'artist' | 'keyword';
    addedAt?: string; // ISO timestamp
}

/**
 * Blocked User
 */
export interface BlockedUser {
    id: string; // From DB
    username: string;
    addedAt?: string; // ISO timestamp
}

/**
 * All-Time Statistics Structure
 */
export interface AllTimeStats {
    topRequesters: { requester: string; request_count: number }[];
    topSongs: { title: string | null; artist: string | null; play_count: number }[]; // Title/Artist can be null
    topArtists: { artist: string | null; play_count: number }[]; // Artist can be null
}

/**
 * Overall application state managed via Socket.IO
 */
export interface AppState {
  queue: SongRequest[]
  history: SongRequest[] // Typically recent history for display
  activeSong: SongRequest | null
  settings: Settings
  blacklist: BlacklistItem[]
  blockedUsers: BlockedUser[]
  isLoading: boolean
  error: Error | null
}

/**
 * Socket event types (consider defining payload types more strictly)
 */
export interface SocketEvents {
    // Emitted by Server
    initialState: (state: AppState) => void;
    queueUpdate: (queue: SongRequest[]) => void;
    historyUpdate: (history: SongRequest[]) => void; // For broadcasting recent history changes
    activeSong: (song: SongRequest | null) => void;
    newSongRequest: (request: SongRequest) => void; // Feedback for successful request
    settingsUpdate: (settings: Settings) => void;
    blacklistUpdate: (blacklist: BlacklistItem[]) => void;
    blockedUsersUpdate: (blockedUsers: BlockedUser[]) => void;
    songFinished: (song: SongRequest) => void; // When a song completes or is skipped
    allTimeStatsUpdate: (stats: AllTimeStats) => void;
    allTimeStatsError: (error: { message: string }) => void;

    // Emitted by Client (Admin)
    getState: () => void;
    updateQueue: (updatedQueue: SongRequest[]) => void; // For reordering
    addSong: (songRequestData: Partial<SongRequest> & { youtubeUrl: string; requester: string }) => void; // Manual add
    removeSong: (songId: string) => void;
    clearQueue: () => void;
    resetSystem: () => void; // Consider removing if clearQueue/stop is enough
    setMaxDuration: (minutes: number) => void; // Or seconds, match backend
    updateActiveSong: (song: SongRequest | null) => void; // When admin forces next song or stops
    updateBlacklist: (newBlacklist: BlacklistItem[]) => void;
    updateBlockedUsers: (newBlockedUsers: BlockedUser[]) => void;
    getAllTimeStats: () => void;
    clearHistory: () => void; // Clear all history
    deleteHistoryItem: (id: string) => void; // Delete a single history item
    markSongAsFinished: (song: SongRequest) => void; // Mark the current song as finished and move to history
    returnToQueue: (song: SongRequest) => void; // Return a song from history to the top of the queue
}

/**
 * Environment variables configuration
 */
export interface EnvConfig {
  YOUTUBE_API_KEY: string
  SOCKET_PORT: number
  NODE_ENV: 'development' | 'production'
  NEXT_PUBLIC_TWITCH_CLIENT_ID: string
  TWITCH_CLIENT_SECRET: string
  NEXT_PUBLIC_TWITCH_REDIRECT_URI: string
  NEXT_PUBLIC_SOCKET_URL?: string; // Added optional socket URL
}

/**
 * Error types
 */
export interface AppError extends Error {
  code?: string
  context?: any
}

export {} 