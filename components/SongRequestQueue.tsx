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
import { ErrorBoundary } from "@/components/ErrorBoundary"
import { SongRequest, AppState } from "@/lib/types"
import { constants, socketEvents } from "@/lib/config"
import { Header } from "@/components/Header"
import { Badge } from "@/components/ui/badge"
import Link from 'next/link'

/*
 * Main queue component that displays current queue, history, and active song
 */
export default function SongRequestQueue() {
  const [state, setState] = useState<AppState>({
    queue: [],
    history: [],
    activeSong: null,
    settings: {},
    blacklist: [],
    blockedUsers: [],
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
      setState((prev: AppState) => ({ ...prev, error: new Error('Connection lost') }))
    })

    newSocket.on(socketEvents.ERROR, (error) => {
      console.error('Socket error:', error)
      setState((prev: AppState) => ({ ...prev, error: new Error('Connection error') }))
    })

    // Handle initial state from server
    newSocket.on('initialState', (serverState: AppState) => {
      console.log('Received initial state:', serverState)
      setState((prev: AppState) => ({
        ...prev,
        queue: serverState.queue || [],
        history: serverState.history || [],
        activeSong: serverState.activeSong,
        settings: serverState.settings || {},
        blacklist: serverState.blacklist || [],
        blockedUsers: serverState.blockedUsers || [],
        isLoading: false
      }))
    })

    // Event handlers for queue updates
    newSocket.on(socketEvents.NEW_SONG_REQUEST, (song: SongRequest) => {
      console.log('Received new song request:', song)
      setState((prev: AppState) => ({
        ...prev,
        queue: [...prev.queue, song].slice(0, constants.MAX_QUEUE_SIZE)
      }))
    })

    newSocket.on(socketEvents.QUEUE_UPDATE, (updatedQueue: SongRequest[]) => {
      console.log('Queue updated:', updatedQueue)
      setState((prev: AppState) => ({ ...prev, queue: updatedQueue }))
    })

    // *** Add History Update Listener ***
    newSocket.on('historyUpdate', (updatedHistory: SongRequest[]) => {
      console.log('History updated:', updatedHistory); // Add log for debugging
      setState((prev: AppState) => ({ ...prev, history: updatedHistory }));
    })
    
    // Add listener for song finished event
    newSocket.on('songFinished', (finishedSong: SongRequest) => {
      console.log('Song finished:', finishedSong); 
      // The server will also send historyUpdate so we don't need to update history directly here
    })
    // ********************************

    newSocket.on(socketEvents.ACTIVE_SONG, (song: SongRequest | null) => {
      console.log('Active song updated:', song)
      setState((prev: AppState) => ({
        ...prev,
        activeSong: song,
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
    state.queue.filter((song: SongRequest) => 
      song.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      song.artist?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      song.requester.toLowerCase().includes(searchTerm.toLowerCase())
    ),
    [state.queue, searchTerm]
  )

  const filteredHistory = useCallback(() => 
    state.history.filter((song: SongRequest) => 
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
        <ActiveSong song={state.activeSong} isLoading={state.isLoading} />

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

function ActiveSong({ song, isLoading }: { song: SongRequest | null, isLoading: boolean }) {
  return (
    <div className="mb-6 p-4 bg-gray-800 rounded-lg shadow-md">
      <h2 className="text-xl font-semibold mb-2 flex items-center">
        <Music className="mr-2" size={24} />
        Current Active Song
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
              {song.channelId ? (
                <Link href={`https://www.youtube.com/channel/${song.channelId}`} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-gray-300 underline transition-colors">
                  {song.artist || 'Unknown Artist'}
                </Link>
              ) : (
                <p className="text-gray-400">{song.artist || 'Unknown Artist'}</p>
              )}
              <div className="text-sm text-gray-500 flex items-center flex-wrap gap-x-2 gap-y-1 mt-1">
                Requested by:{' '}
                <Avatar className="w-4 h-4 rounded-full inline-block">
                  <AvatarImage src={song.requesterAvatar} alt={song.requester} />
                  <AvatarFallback className="text-xs">{song.requester.slice(0, 1)}</AvatarFallback>
                </Avatar>
                <Link href={`https://www.twitch.tv/${song.requesterLogin || song.requester.toLowerCase()}`} target="_blank" rel="noopener noreferrer" className="hover:text-gray-300 underline transition-colors">
                  <span>{song.requester}</span>
                </Link>
                {song.requestType === 'donation' && (
                  <Badge variant="secondary" className="px-1.5 py-0.5 text-xs bg-green-800 text-green-200 border-green-700">
                    Dono
                  </Badge>
                )}
                {song.requestType === 'channelPoint' && (
                  <Badge variant="outline" className="px-1.5 py-0.5 text-xs bg-purple-800 text-purple-200 border-purple-700">
                    Points
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* Duration - ADDED */}
          <div className="text-sm text-gray-400">
             <Clock className="inline-block mr-1 -mt-0.5" size={16} />
             {song.duration || '0:00'}
          </div>

          {/* YouTube Link Button */}
          <a href={song.youtubeUrl} target="_blank" rel="noopener noreferrer" aria-label="Watch on YouTube">
            <Button variant="ghost" className="p-2">
              <Youtube className="h-8 w-8 text-red-600" />
            </Button>
          </a>
        </motion.div>
      ) : (
        <p className="text-gray-400">No active song.</p>
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
          {/* Match Admin Page Item Structure */}
          <div className="flex items-center space-x-3 p-3 rounded-md bg-gray-800 hover:bg-gray-700 transition mb-2">
            <div className="flex-shrink-0 font-semibold text-gray-400 w-6 text-center">
              {index + 1}
            </div>
            <div className="relative w-16 h-9 rounded-md overflow-hidden flex-shrink-0">
              {song.thumbnailUrl ? (
                <img 
                  src={song.thumbnailUrl} 
                  alt={song.title || 'Video thumbnail'}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Avatar className="w-full h-full rounded-md bg-gray-700">
                  <AvatarFallback className="rounded-md bg-transparent flex items-center justify-center">
                    <Music size={24} className="text-gray-400"/>
                  </AvatarFallback>
                </Avatar>
              )}
            </div>
            <div className="flex-grow min-w-0">
              <p className="font-medium text-white truncate flex items-center gap-1">
                {song.title || song.youtubeUrl}
              </p>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
                {song.channelId ? (
                  <Link href={`https://www.youtube.com/channel/${song.channelId}`} target="_blank" rel="noopener noreferrer" className="hover:text-purple-300 transition-colors group">
                    <Badge variant="outline" className="text-xs font-normal cursor-pointer group-hover:border-purple-400 group-hover:text-purple-300 transition-colors">
                      {song.artist || 'Unknown Artist'}
                    </Badge>
                  </Link>
                ) : (
                  <Badge variant="outline" className="text-xs font-normal">
                    {song.artist || 'Unknown Artist'}
                  </Badge>
                )}
                <span className="text-xs text-gray-400">
                  {song.duration || '?:'}
                </span>
                <div className="text-xs text-gray-400 flex items-center gap-1">
                  by{' '}
                  <Avatar className="w-3 h-3 rounded-full inline-block">
                    <AvatarImage src={song.requesterAvatar} alt={song.requester} />
                    <AvatarFallback className="text-[8px]">{song.requester.slice(0,1)}</AvatarFallback>
                  </Avatar>
                  <Link href={`https://www.twitch.tv/${song.requesterLogin || song.requester.toLowerCase()}`} target="_blank" rel="noopener noreferrer" className="hover:text-gray-300 underline transition-colors">
                    {song.requester}
                  </Link>
                </div>
                {song.requestType === 'donation' && (
                  <Badge variant="secondary" className="px-1.5 py-0.5 text-xs bg-green-800 text-green-200 border-green-700">
                    Dono
                  </Badge>
                )}
                {song.requestType === 'channelPoint' && (
                  <Badge variant="outline" className="px-1.5 py-0.5 text-xs bg-purple-800 text-purple-200 border-purple-700">
                    Points
                  </Badge>
                )}
              </div>
            </div>
            <div className="flex space-x-1 flex-shrink-0">
              {/* Only keep YouTube link button for public view */}
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