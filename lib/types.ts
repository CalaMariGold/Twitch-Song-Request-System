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
  youtubeUrl?: string | null
  /** Username of the person who requested the song */
  requester: string
  /** Login name of the requester (for Twitch URL) */
  requesterLogin?: string
  /** Avatar URL of the requester */
  requesterAvatar?: string | null
  /** ISO timestamp - for queue items: when requested, for history items: completedAt */
  timestamp: string
  /** Title of the song (from YouTube) */
  title: string
  /** Artist/channel name (from YouTube) */
  artist: string
  /** YouTube Channel ID (for linking) */
  channelId?: string | null
  /** Formatted duration (e.g., "3:45") */
  duration?: string
  /** Duration in seconds */
  durationSeconds: number
  /** Thumbnail URL of the song */
  thumbnailUrl?: string | null
  /** Source of the song (youtube, spotify, etc.) */
  source: 'youtube' | 'spotify_search' | 'database' | 'database_history' | 'database_active' | string
  /** Type of request (determines priority and limits) */
  requestType: 'channelPoint' | 'donation' | 'manual' | 'history_requeue' | 'socket' | string
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
  /** Spotify track information if available */
  spotifyData?: SpotifyTrackData | null
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
    adminAuthenticated: () => void; // NEW: Confirmation from server that admin auth succeeded

    // Emitted by Client (Admin)
    getState: () => void;
    authenticateAdmin: (data: { login: string }) => void; // NEW: Admin client sends auth data
    updateQueue: (updatedQueue: SongRequest[]) => void; // For reordering
    addSong: (songRequestData: Partial<SongRequest> & { youtubeUrl: string; requester: string; bypassRestrictions?: boolean }) => void; // Manual add (added bypassRestrictions)
    removeSong: (songId: string) => void;
    clearQueue: () => void;
    resetSystem: () => void;
    setMaxDuration: (minutes: number) => void; // Or seconds, match backend
    updateActiveSong: (song: SongRequest | null) => void; // When admin forces next song or stops
    updateBlacklist: (newBlacklist: BlacklistItem[]) => void;
    updateBlockedUsers: (newBlockedUsers: BlockedUser[]) => void;
    getAllTimeStats: () => void;
    clearHistory: () => void; // Clear all history
    deleteHistoryItem: (id: string) => void; // Delete a single history item
    markSongAsFinished: (song: SongRequest) => void; // Mark the current song as finished and move to history
    returnToQueue: (song: SongRequest) => void; // Return a song from history to the top of the queue
    skipSong: () => void; // Added for admin skipping song

    // Emitted by Client (Public/User)
    getYouTubeDetails: (youtubeUrl: string, callback: (error: { message: string } | null, details?: YouTubeVideoDetails) => void) => void;
    deleteMyRequest: (data: { requestId: string; userLogin: string }) => void;
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
  NEXT_PUBLIC_SOCKET_URL?: string;
}

/**
 * Error types
 */
export interface AppError extends Error {
  code?: string
  context?: any
}

/**
 * Represents a planned song request that a user has saved for later
 */
export interface PlannedRequest {
  /** Unique identifier for the planned request */
  id: string
  /** Full YouTube URL of the song */
  youtubeUrl: string
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
  /** Timestamp when this was added to the plan */
  addedAt: string
  /** Alternative property name for Spotify data, used in some parts of code */
  spotifyData?: SpotifyTrackData | null
}

// Interface for Spotify track data (as received from backend)
export interface SpotifyTrackData {
  id: string;
  name: string;
  artists: { id: string; name: string }[];
  album: {
    id: string;
    name: string;
    releaseDate: string;
    images: { url: string; height: number; width: number }[];
  };
  durationMs: number;
  previewUrl?: string | null;
  externalUrl: string;
  uri: string;
  matchScore?: number; // Score from YouTube matching
  albumName?: string; 
  albumImages?: { url: string; height: number; width: number }[];
}

export {} 