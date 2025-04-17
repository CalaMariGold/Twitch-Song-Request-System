import { Server as SocketIOServer } from 'socket.io'

declare global {
    var io: SocketIOServer | undefined
}

/**
 * Represents a song request in the queue
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
  /** ISO timestamp of when the request was made */
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
  source?: 'youtube' | 'spotify'
  /** Channel point redemption details (Indicates a 'channelPoint' type request) */
  channelPointReward?: {
    /** Unique identifier for the reward */
    rewardId: string
    /** Display name of the reward */
    rewardTitle: string
    /** Cost in channel points */
    cost: number
  }
  /** Type of request (determines priority and limits) */
  requestType: 'channelPoint' | 'donation'
  /** Donation details (if requestType is 'donation') */
  donationInfo?: {
    amount: number;
    currency: string;
  }
  /** Current status of the request */
  status?: 'pending' | 'playing' | 'completed' | 'skipped'
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
 * Socket event types
 */
export interface SocketEvents {
  newSongRequest: (request: SongRequest) => void
  queueUpdate: (queue: SongRequest[]) => void
  nowPlaying: (song: SongRequest | null) => void
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
}

/**
 * Queue state management types
 */
export interface QueueState {
  queue: SongRequest[]
  history: SongRequest[]
  nowPlaying: SongRequest | null
  isLoading: boolean
  error: Error | null
}

export interface QueueActions {
  addSong: (song: SongRequest) => void
  removeSong: (id: string) => void
  skipSong: (id: string) => void
  clearQueue: () => void
  // updatePriority: (id: string, priority: SongRequest['priority']) => void // Removed as priority is replaced by requestType
}

/**
 * Error types
 */
export interface AppError extends Error {
  code?: string
  context?: any
}

export {} 