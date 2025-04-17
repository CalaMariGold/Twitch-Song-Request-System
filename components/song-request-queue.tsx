"use client"

import { useState, useEffect, useCallback } from "react"
import { io, Socket } from "socket.io-client"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Input } from "@/components/ui/input"
import { Search, Music, Clock, History, Loader2, Youtube } from "lucide-react"
import { Button } from "@/components/ui/button"
import { motion, AnimatePresence } from "framer-motion"
import { ErrorBoundary } from "@/components/error-boundary"
import { SongRequest, QueueState } from "@/lib/types"
import { constants, socketEvents } from "@/lib/config"
import { Header } from "./header"

/**
 * Main queue component that displays current queue, history, and now playing
 */
export default function SongRequestQueue() {
  const [state, setState] = useState<QueueState>({
    queue: [],
    history: [],
    nowPlaying: null,
    isLoading: true,
    error: null
  })
  const [searchTerm, setSearchTerm] = useState("")
  const [socket, setSocket] = useState<Socket | null>(null)
  const [isConnected, setIsConnected] = useState(false)

  // Socket connection management
  useEffect(() => {
    const newSocket = io('http://localhost:3002', {
      transports: ['websocket'],
      reconnectionAttempts: constants.SOCKET_RECONNECT_ATTEMPTS,
      reconnectionDelay: constants.SOCKET_RECONNECT_DELAY
    })

    newSocket.on(socketEvents.CONNECT, () => {
      console.log('Connected to WebSocket server')
      setIsConnected(true)
    })

    newSocket.on(socketEvents.DISCONNECT, (reason) => {
      console.log('Disconnected from WebSocket server:', reason)
      setIsConnected(false)
      setState(prev => ({ ...prev, error: new Error('Connection lost') }))
    })

    newSocket.on(socketEvents.ERROR, (error) => {
      console.error('Socket error:', error)
      setState(prev => ({ ...prev, error: new Error('Connection error') }))
    })

    // Handle initial state from server
    newSocket.on('initialState', (serverState: QueueState) => {
      console.log('Received initial state:', serverState)
      setState(prev => ({
        ...prev,
        queue: serverState.queue || [],
        history: serverState.history || [],
        nowPlaying: serverState.nowPlaying,
        isLoading: false
      }))
    })

    // Event handlers for queue updates
    newSocket.on(socketEvents.NEW_SONG_REQUEST, (song: SongRequest) => {
      console.log('Received new song request:', song)
      setState(prev => ({
        ...prev,
        queue: [...prev.queue, song].slice(0, constants.MAX_QUEUE_SIZE)
      }))
    })

    newSocket.on(socketEvents.QUEUE_UPDATE, (updatedQueue: SongRequest[]) => {
      console.log('Queue updated:', updatedQueue)
      setState(prev => ({ ...prev, queue: updatedQueue }))
    })

    // *** Add History Update Listener ***
    newSocket.on('historyUpdate', (updatedHistory: SongRequest[]) => {
      console.log('History updated:', updatedHistory); // Add log for debugging
      setState(prev => ({ ...prev, history: updatedHistory }));
    })
    // ********************************

    newSocket.on(socketEvents.NOW_PLAYING, (song: SongRequest | null) => {
      console.log('Now playing updated:', song)
      setState(prev => ({
        ...prev,
        nowPlaying: song,
      }))
    })

    setSocket(newSocket)

    return () => {
      console.log('Cleaning up socket connection')
      newSocket.disconnect()
    }
  }, [])

  // Filter handlers
  const filteredQueue = useCallback(() => 
    state.queue.filter(song => 
      song.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      song.artist?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      song.requester.toLowerCase().includes(searchTerm.toLowerCase())
    ),
    [state.queue, searchTerm]
  )

  const filteredHistory = useCallback(() => 
    state.history.filter(song => 
      song.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      song.artist?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      song.requester.toLowerCase().includes(searchTerm.toLowerCase())
    ),
    [state.history, searchTerm]
  )

  return (
    <ErrorBoundary>
      <div className="w-full max-w-4xl mx-auto p-6 bg-gray-900 text-white rounded-lg shadow-xl">
        <Header isConnected={isConnected} />
        <NowPlaying song={state.nowPlaying} isLoading={state.isLoading} />

        <div className="mb-4 relative">
          <Input
            type="text"
            placeholder="Search songs, artists, or requesters..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 bg-gray-800 border-gray-700 text-white"
          />
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
        </div>

        <Tabs defaultValue="queue" className="w-full">
          <TabsList className="grid w-full grid-cols-2 bg-gray-800">
            <TabsTrigger value="queue" className="data-[state=active]:bg-gray-700">
              <Music className="mr-2" size={18} />
              Current Queue ({state.queue.length})
            </TabsTrigger>
            <TabsTrigger value="history" className="data-[state=active]:bg-gray-700">
              <History className="mr-2" size={18} />
              History ({state.history.length})
            </TabsTrigger>
          </TabsList>
          <TabsContent value="queue">
            <ScrollArea className="h-[400px] w-full rounded-md border border-gray-700 p-4 bg-gray-800">
              {state.isLoading ? (
                <LoadingState />
              ) : (
                <SongList songs={filteredQueue()} />
              )}
            </ScrollArea>
          </TabsContent>
          <TabsContent value="history">
            <ScrollArea className="h-[400px] w-full rounded-md border border-gray-700 p-4 bg-gray-800">
              {state.isLoading ? (
                <LoadingState />
              ) : (
                <SongList songs={filteredHistory()} />
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </div>
    </ErrorBoundary>
  )
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
    </div>
  )
}

function NowPlaying({ song, isLoading }: { song: SongRequest | null, isLoading: boolean }) {
  return (
    <div className="mb-6 p-4 bg-gray-800 rounded-lg shadow-md">
      <h2 className="text-xl font-semibold mb-2 flex items-center">
        <Music className="mr-2" size={24} />
        Now Playing
      </h2>
      {isLoading ? (
        <LoadingState />
      ) : song ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex items-center justify-between w-full"
        >
          <div className="flex items-center space-x-4">
            <Avatar className="w-24 h-16 rounded-md">
              <AvatarImage src={song.thumbnailUrl} alt={`${song.title} thumbnail`} className="object-cover" />
              <AvatarFallback className="rounded-md">?</AvatarFallback>
            </Avatar>
            <div>
              <h3 className="text-lg font-medium">{song.title}</h3>
              <p className="text-gray-400">{song.artist}</p>
              <p className="text-sm text-gray-500 flex items-center mt-1">
                Requested by:
                <Avatar className="w-4 h-4 rounded-full ml-1.5 mr-1 inline-block">
                  <AvatarImage src={song.requesterAvatar} alt={song.requester} />
                  <AvatarFallback className="text-xs">{song.requester.slice(0, 1)}</AvatarFallback>
                </Avatar>
                {song.requester}
              </p>
            </div>
          </div>

          {/* YouTube Link Button */}
          <a href={song.youtubeUrl} target="_blank" rel="noopener noreferrer" aria-label="Watch on YouTube">
            <Button variant="ghost" className="p-2">
              <Youtube className="h-8 w-8 text-red-600" />
            </Button>
          </a>
        </motion.div>
      ) : (
        <p className="text-gray-400">No song is currently playing</p>
      )}
    </div>
  )
}

function SongList({ songs }: { songs: SongRequest[] }) {
  return (
    <AnimatePresence>
      {songs.map((song, index) => (
        <motion.div
          key={song.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.3, delay: index * 0.1 }}
        >
          <div className="flex items-center justify-between space-x-4 p-3 rounded-lg hover:bg-gray-700 transition-colors mb-2">
            <div className="flex items-center space-x-4 flex-grow min-w-0">
              {song.thumbnailUrl && (
                <Avatar className="w-16 h-9 rounded-sm flex-shrink-0">
                  <AvatarImage src={song.thumbnailUrl} alt={`${song.title} thumbnail`} className="object-cover" />
                  <AvatarFallback className="rounded-sm">?</AvatarFallback>
                </Avatar>
              )}
              <div className="flex-grow min-w-0">
                <h3 className="font-semibold truncate">{song.title}</h3>
                <p className="text-sm text-gray-400 truncate">{song.artist}</p>
              </div>
            </div>
            <div className="flex items-center space-x-3 flex-shrink-0">
              <div className="text-sm text-gray-400 flex items-center">
                <Clock className="mr-1" size={14} />
                {song.duration}
              </div>
              <div className="text-sm text-gray-400 hidden sm:flex items-center">
                <Avatar className="w-4 h-4 rounded-full mr-1.5">
                  <AvatarImage src={song.requesterAvatar} alt={song.requester} />
                  <AvatarFallback className="text-xs">{song.requester.slice(0,1)}</AvatarFallback>
                </Avatar>
                {song.requester}
              </div>
              <a href={song.youtubeUrl} target="_blank" rel="noopener noreferrer" aria-label="Watch on YouTube">
                <Button variant="ghost" className="p-1">
                  <Youtube className="h-5 w-5 text-red-600" />
                </Button>
              </a>
            </div>
          </div>
        </motion.div>
      ))}
    </AnimatePresence>
  )
} 