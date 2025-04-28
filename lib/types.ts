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
    // === Server -> Client ===
    initialState: (state: AppState) => void;
    queueUpdate: (queue: SongRequest[]) => void;
    historyUpdate: (history: SongRequest[]) => void;
    historyOrderChanged: () => void;
    activeSong: (song: SongRequest | null) => void;
    newSongRequest: (request: SongRequest) => void;
    settingsUpdate: (settings: Settings) => void;
    blacklistUpdate: (blacklist: BlacklistItem[]) => void;
    blockedUsersUpdate: (blockedUsers: BlockedUser[]) => void;
    songFinished: (song: SongRequest) => void;
    allTimeStatsUpdate: (stats: AllTimeStats) => void;
    allTimeStatsError: (error: { message: string }) => void;
    adminAuthenticated: () => void;
    adminAuthFailed?: () => void; // Optional: If server sends this
    adminError?: (payload: { message: string }) => void; // Optional: Generic admin error
    // --- History Pagination Event ---
    moreHistoryData: (historyChunk: SongRequest[]) => void;
    // --- Total Count Update Event ---
    totalCountsUpdate: (counts: { history: number; queue: number }) => void;
    todaysCountUpdate: (counts: { todaysCount: number }) => void;
    // --- Spotify Update Events --- 
    updateSpotifySuccess: (payload: { requestId: string }) => void;
    updateSpotifyError: (payload: { requestId: string; message: string }) => void;
    // --- User Specific Events --- 
    myRequestsUpdate?: (requests: SongRequest[]) => void; // Optional for user-specific features
    deleteRequestSuccess?: (payload: { requestId: string }) => void; // Optional confirmation
    deleteRequestError?: (payload: { requestId: string; message: string }) => void; // Optional error feedback

    // === Client -> Server ===
    // --- Admin Actions --- 
    getState: () => void;
    authenticateAdmin: (data: { login: string }) => void;
    updateQueue: (updatedQueue: SongRequest[]) => void;
    updateHistoryOrder: (orderedIds: string[]) => void;
    addSong: (songRequestData: Partial<SongRequest> & { youtubeUrl?: string; message?: string; requester: string; bypassRestrictions?: boolean }) => void;
    removeSong: (songId: string) => void;
    clearQueue: () => void;
    resetSystem?: () => void; // Make optional if not always implemented/used
    setMaxDuration: (minutes: number) => void;
    updateActiveSong: (song: SongRequest | null) => void;
    updateBlacklist: (newBlacklist: BlacklistItem[]) => void; // Assuming full list update based on frontend code
    updateBlockedUsers: (newBlockedUsers: BlockedUser[]) => void; // Assuming full list update based on frontend code
    getAllTimeStats: () => void;
    deleteHistoryItem: (id: string) => void;
    markSongAsFinished: (song: SongRequest) => void; // Frontend seems to send the song object
    returnToQueue: (song: SongRequest) => void; // Frontend seems to send the song object
    skipSong: () => void;
    // --- Admin Spotify Update Action --- 
    adminUpdateSpotifyLink: (payload: { requestId: string; spotifyUrl: string }) => void;
    // --- History Pagination Request ---
    getMoreHistory: (data: { offset: number; limit: number }) => void;
    
    // --- Public/User Actions --- 
    getYouTubeDetails: (youtubeUrl: string, callback: (error: { message: string } | null, details?: YouTubeVideoDetails) => void) => void;
    deleteMyRequest?: (data: { requestId: string; userLogin?: string }) => void; // Make userLogin optional if client might not send it
    getMyRequests?: () => void; // Optional user-specific feature

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
  youtubeUrl?: string | null | undefined
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
  /** Source type of the planned request */
  sourceType: 'youtube' | 'spotify' | 'text'
}

// Interface for Spotify track data (as received from backend or used in frontend)
export interface SpotifyTrackData {
  id: string;
  name: string;
  artists: { id: string; name: string }[]; // Array of artists
  album?: { // Make album optional as it might not always be present/needed
    id?: string; // Make nested properties optional too
    name?: string;
    releaseDate?: string;
    images?: { url: string; height: number; width: number }[];
  };
  durationMs?: number;
  previewUrl?: string | null;
  url?: string; // Explicitly add the url property for Spotify links
  uri?: string; // Spotify URI
  matchScore?: number; // Score from YouTube matching
  // Keep these potentially redundant fields if used elsewhere, but make optional
  albumName?: string; 
  albumImages?: { url: string; height: number; width: number }[];
}

export {} 