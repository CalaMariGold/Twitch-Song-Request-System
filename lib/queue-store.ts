import { SongRequest } from './types'

// In-memory store
class QueueStore {
  private static instance: QueueStore
  private queue: SongRequest[] = []
  private history: SongRequest[] = []
  private nowPlaying: SongRequest | null = null

  private constructor() {}

  static getInstance(): QueueStore {
    if (!QueueStore.instance) {
      QueueStore.instance = new QueueStore()
    }
    return QueueStore.instance
  }

  // Queue operations
  getState() {
    return {
      queue: this.queue,
      history: this.history,
      nowPlaying: this.nowPlaying
    }
  }

  addToQueue(song: SongRequest) {
    this.queue.push(song)
  }

  removeFromQueue(songId: string) {
    this.queue = this.queue.filter(song => song.id !== songId)
  }

  setNowPlaying(song: SongRequest | null) {
    if (this.nowPlaying) {
      this.history.unshift(this.nowPlaying)
    }
    this.nowPlaying = song
  }

  clearQueue() {
    this.queue = []
  }

  clearHistory() {
    this.history = []
  }
}

export const queueStore = QueueStore.getInstance() 