"use client"

import { useState, useEffect, useCallback } from "react"
import { io, Socket } from "socket.io-client"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Input } from "@/components/ui/input"
import { Search, Music, Clock, History, Loader2, Youtube, User, ListPlus, Trash2, GripVertical, Save, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { motion, AnimatePresence } from "framer-motion"
import { ErrorBoundary } from "@/components/ErrorBoundary"
import { SongRequest, AppState, PlannedRequest } from "@/lib/types"
import { constants, socketEvents } from "@/lib/config"
import { Header } from "@/components/Header"
import { Badge } from "@/components/ui/badge"
import Link from 'next/link'
import { 
  formatTimestamp, 
  formatDuration, 
  SpotifyIcon, 
  calculateTotalQueueDuration,
  getRequestPlan,
  saveRequestPlan,
  addToRequestPlan,
  removeFromRequestPlan
} from "@/lib/utils"
import { getTwitchAuthUrl } from "@/lib/auth"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { DragDropContext, Draggable, Droppable, DropResult } from '@hello-pangea/dnd'

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
  const [currentUser, setCurrentUser] = useState<{id?: string, login?: string} | null>(null)
  const [requestPlan, setRequestPlan] = useState<PlannedRequest[]>([])
  const [youtubeUrl, setYoutubeUrl] = useState("")
  const [isAddingToRequestPlan, setIsAddingToRequestPlan] = useState(false)
  const [addUrlError, setAddUrlError] = useState<string | null>(null)
  const [isYoutubeDialogOpen, setIsYoutubeDialogOpen] = useState(false)

  // Calculate total queue duration
  const { formatted: totalQueueDurationFormatted } = calculateTotalQueueDuration(state.queue)

  // Function to handle song drag-and-drop in request plan
  const onDragEnd = (result: DropResult) => {
    if (!result.destination || !currentUser?.id) return;
    
    const items = Array.from(requestPlan);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    
    setRequestPlan(items);
    saveRequestPlan(currentUser.id, items);
  };

  // Function to manually add a YouTube URL to request plan
  const handleAddToRequestPlan = async () => {
    if (!youtubeUrl || !currentUser?.id || !socket) {
      setAddUrlError("Please enter a valid YouTube URL");
      return;
    }
    
    setAddUrlError(null);
    setIsAddingToRequestPlan(true);
    
    // Emit to server to get YouTube details
    socket.emit('getYouTubeDetails', youtubeUrl, (error: any, details: any) => {
      setIsAddingToRequestPlan(false);
      
      if (error) {
        console.error('Error fetching video details:', error);
        setAddUrlError(error.error || "Failed to load video details. Please check the URL.");
        return;
      }
      
      const newSong: Partial<PlannedRequest> & { youtubeUrl: string } = {
        youtubeUrl,
        title: details.title,
        artist: details.channelTitle,
        channelId: details.channelId,
        duration: details.duration,
        durationSeconds: details.durationSeconds,
        thumbnailUrl: details.thumbnailUrl
      };
      
      const updatedPlan = addToRequestPlan(currentUser.id!, newSong);
      setRequestPlan(updatedPlan);
      setYoutubeUrl('');
      setIsYoutubeDialogOpen(false); // Close dialog on success
    });
  };
  
  // Function to handle removing a song from the request plan
  const handleRemoveFromRequestPlan = (songId: string) => {
    if (!currentUser?.id) return;
    
    const updatedPlan = removeFromRequestPlan(currentUser.id, songId);
    setRequestPlan(updatedPlan);
  };

  // Function to render the Request Plan tab content
  function RequestPlanTab({ 
    currentUser, 
    requestPlan,
    searchTerm,
    isLoading,
    onDragEnd,
    onRemove,
    socket
  }: { 
    currentUser: { id?: string, login?: string } | null,
    requestPlan: PlannedRequest[],
    searchTerm: string,
    isLoading: boolean,
    onDragEnd: (result: DropResult) => void,
    onRemove: (songId: string) => void,
    socket: Socket | null
  }) {
    // Filter the request plan based on search term
    const filteredPlan = requestPlan.filter(song => 
      song.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      song.artist?.toLowerCase().includes(searchTerm.toLowerCase())
    );
    
    // Handle requesting a song from the plan
    const handleRequestSong = (song: PlannedRequest) => {
      if (!socket) return;
      
      socket.emit('addSong', {
        youtubeUrl: song.youtubeUrl,
        requester: currentUser?.login || 'Unknown User',
        requestType: 'channelPoint' // Assuming channel points for manual requests
      }, (error: any) => {
        if (error) {
          console.error('Error requesting song:', error);
          return;
        }
        
        // Remove from plan after successful request
        onRemove(song.id);
      });
    };
      
    if (isLoading) {
      return <LoadingState />
    }
    
    if (!currentUser) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-3">
          <ListPlus size={24} className="text-gray-400" />
          <p className="text-gray-400">Please login with Twitch to use your Request Plan</p>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => window.location.href = getTwitchAuthUrl()}
            className="flex items-center gap-2 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border-purple-500/20"
          >
            Login with Twitch
          </Button>
        </div>
      )
    }
    
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-4">
          <Dialog open={isYoutubeDialogOpen} onOpenChange={setIsYoutubeDialogOpen}>
            <DialogTrigger asChild>
              <Button 
                variant="outline" 
                className="flex gap-2 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border-purple-500/20"
                onClick={() => {
                  setAddUrlError(null);
                  setYoutubeUrl('');
                }}
              >
                <Plus size={16} />
                Add to Plan
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md bg-gray-800 border-gray-700 text-white" onPointerDownOutside={(e) => e.preventDefault()}>
              <DialogHeader>
                <DialogTitle>Add to Request Plan</DialogTitle>
                <DialogDescription className="text-gray-400">
                  Paste a YouTube URL to add it to your request plan.
                </DialogDescription>
              </DialogHeader>
              <div className="flex items-center space-x-2">
                <div className="grid flex-1 gap-2">
                  <div className="flex">
                    <Input
                      className="bg-gray-700 border-gray-600 text-white flex-1 rounded-r-none"
                      placeholder="YouTube URL (e.g. https://www.youtube.com/watch?v=...)"
                      value={youtubeUrl}
                      onChange={(e) => setYoutubeUrl(e.target.value)}
                      onPaste={(e) => {
                        // Prevent default action and handle paste manually
                        e.preventDefault();
                        const pastedText = e.clipboardData.getData('text');
                        setYoutubeUrl(pastedText);
                      }}
                      onKeyDown={(e) => {
                        // Handle keyboard shortcuts
                        if (e.key === 'Enter') {
                          handleAddToRequestPlan();
                        }
                        // Handle Ctrl+V or Command+V
                        if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
                          // The onPaste handler will take care of this
                          // This is just to prevent the dialog from closing
                          e.stopPropagation();
                        }
                      }}
                    />
                  </div>
                  {addUrlError && (
                    <div className="text-red-400 text-sm mt-1">
                      {addUrlError}
                    </div>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="submit"
                  className="bg-purple-600 hover:bg-purple-700"
                  onClick={handleAddToRequestPlan}
                  disabled={isAddingToRequestPlan || !youtubeUrl}
                >
                  {isAddingToRequestPlan ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                  {isAddingToRequestPlan ? "Adding..." : "Add to Plan"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          
          <p className="text-sm text-gray-400 flex-1">
            {filteredPlan.length === 0 
              ? "Add songs to your plan for easy requesting later."
              : `${filteredPlan.length} song${filteredPlan.length !== 1 ? 's' : ''} in your plan.`}
          </p>
        </div>
        
        {filteredPlan.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[300px] border border-dashed border-gray-700 rounded-md">
            <ListPlus size={24} className="text-gray-400 mb-2" />
            <p className="text-gray-400">Your request plan is empty</p>
            <p className="text-gray-500 text-sm mt-1">Add songs to request them later</p>
          </div>
        ) : (
          <DragDropContext onDragEnd={onDragEnd}>
            <Droppable droppableId="requestPlan">
              {(provided: any) => (
                <div
                  {...provided.droppableProps}
                  ref={provided.innerRef}
                  className="space-y-2"
                >
                  {filteredPlan.map((song, index) => (
                    <Draggable key={song.id} draggableId={song.id} index={index}>
                      {(provided: any) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          className="flex items-center space-x-3 p-3 rounded-md bg-gray-800 hover:bg-gray-700 transition mb-2 border border-gray-700"
                        >
                          <div
                            {...provided.dragHandleProps}
                            className="flex-shrink-0 cursor-move text-gray-500 hover:text-gray-300"
                          >
                            <GripVertical size={20} />
                          </div>
                          
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
                              {song.duration && (
                                <span className="text-xs text-gray-400 flex items-center">
                                  <Clock className="inline-block mr-1" size={12} />
                                  {song.duration}
                                </span>
                              )}
                            </div>
                          </div>
                          
                          <div className="flex flex-col items-end space-y-1 flex-shrink-0">            
                            <div className="flex space-x-1">
                              {/* Youtube button */}
                              <a href={song.youtubeUrl} target="_blank" rel="noopener noreferrer" aria-label="Watch on YouTube">
                                <Button variant="ghost" className="p-1">
                                  <Youtube className="h-5 w-5 text-red-600" />
                                </Button>
                              </a>
                              
                              {/* Spotify Link Button - Only show if Spotify data exists */}
                              {song.spotify && (
                                <a href={song.spotify.uri} target="_blank" rel="noopener noreferrer" aria-label="Listen on Spotify">
                                  <Button variant="ghost" className="p-1">
                                    <SpotifyIcon className="h-5 w-5 text-green-500" />
                                  </Button>
                                </a>
                              )}
                              
                              {/* Remove button */}
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="p-1 text-red-500 hover:text-red-400 hover:bg-red-900/20"
                                onClick={() => onRemove(song.id)}
                                title="Remove from plan"
                              >
                                <Trash2 size={18} />
                              </Button>
                            </div>
                            
                            {/* Timestamp below buttons */}
                            <span className="text-xs text-gray-500 whitespace-nowrap">
                              Added: {formatTimestamp(song.addedAt)}
                            </span>
                          </div>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        )}
      </div>
    )
  }

  // Function to render My Requests tab content
  function MyRequestsTab({ 
    currentUser, 
    state, 
    searchTerm,
    isLoading 
  }: { 
    currentUser: { id?: string, login?: string } | null,
    state: AppState,
    searchTerm: string,
    isLoading: boolean
  }) {
    // Filter for user's queue songs
    const myQueueSongs = currentUser?.login
      ? state.queue.filter((song: SongRequest) => 
          (song.requesterLogin?.toLowerCase() === currentUser.login?.toLowerCase()) ||
          (song.requester.toLowerCase() === currentUser.login?.toLowerCase())
        ).filter(song => 
          song.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          song.artist?.toLowerCase().includes(searchTerm.toLowerCase())
        )
      : []
      
    // Filter for user's history songs
    const myHistorySongs = currentUser?.login
      ? state.history.filter((song: SongRequest) => 
          (song.requesterLogin?.toLowerCase() === currentUser.login?.toLowerCase()) ||
          (song.requester.toLowerCase() === currentUser.login?.toLowerCase())
        ).filter(song => 
          song.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          song.artist?.toLowerCase().includes(searchTerm.toLowerCase())
        )
      : []
    
    const hasNoRequests = myQueueSongs.length === 0 && myHistorySongs.length === 0
      
    if (isLoading) {
      return <LoadingState />
    }
    
    if (!currentUser) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-3">
          <User size={24} className="text-gray-400" />
          <p className="text-gray-400">Please login with Twitch to see your requests</p>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => window.location.href = getTwitchAuthUrl()}
            className="flex items-center gap-2 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border-purple-500/20"
          >
            Login with Twitch
          </Button>
        </div>
      )
    }
    
    if (hasNoRequests) {
      return (
        <div className="flex flex-col items-center justify-center h-full">
          <User size={24} className="text-gray-400 mb-2" />
          <p className="text-gray-400">You haven't made any song requests yet</p>
        </div>
      )
    }
    
    return (
      <div className="space-y-4">
        {myQueueSongs.length > 0 && (
          <div>
            <div className="bg-purple-900/30 rounded-md px-3 py-2 mb-2 flex items-center">
              <Music className="mr-2 text-purple-400" size={16} />
              <h3 className="text-sm font-medium text-purple-300">In Queue ({myQueueSongs.length})</h3>
            </div>
            <SongList songs={myQueueSongs} />
          </div>
        )}
        
        {myQueueSongs.length > 0 && myHistorySongs.length > 0 && (
          <div className="border-t border-gray-700 my-4"></div>
        )}
        
        {myHistorySongs.length > 0 && (
          <div>
            <div className="bg-gray-700/40 rounded-md px-3 py-2 mb-2 flex items-center">
              <History className="mr-2 text-gray-400" size={16} />
              <h3 className="text-sm font-medium text-gray-300">Previously Requested By Me ({myHistorySongs.length})</h3>
            </div>
            <SongList songs={myHistorySongs} />
          </div>
        )}
      </div>
    )
  }

  // Read current user data from cookie
  useEffect(() => {
    const readUserFromCookie = () => {
      const cookies = document.cookie.split(';').reduce((acc, cookie) => {
        const [key, value] = cookie.trim().split('=')
        acc[key] = value
        return acc
      }, {} as Record<string, string>)
      
      const userJson = cookies['twitch_user']
      if (userJson) {
        try {
          const decoded = decodeURIComponent(userJson)
          const userData = JSON.parse(decoded)
          setCurrentUser(userData)
          
          // Load request plan if user is logged in
          if (userData.id) {
            const loadedPlan = getRequestPlan(userData.id);
            setRequestPlan(loadedPlan);
          }
        } catch (e) {
          console.error('Failed to parse user cookie:', e)
        }
      }
    }

    readUserFromCookie()
    
    // Setup listener for auth success to refresh user data
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'auth_success') {
        readUserFromCookie()
      }
    }
    
    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [])

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
  
  // My Requests filter
  const myRequests = useCallback(() => {
    if (!currentUser?.login) return 0
    
    // Count queue and history requests for the current user
    const queueCount = state.queue.filter((song: SongRequest) => 
      (song.requesterLogin?.toLowerCase() === currentUser.login?.toLowerCase()) ||
      (song.requester.toLowerCase() === currentUser.login?.toLowerCase())
    ).length
    
    const historyCount = state.history.filter((song: SongRequest) => 
      (song.requesterLogin?.toLowerCase() === currentUser.login?.toLowerCase()) ||
      (song.requester.toLowerCase() === currentUser.login?.toLowerCase())
    ).length
    
    return queueCount + historyCount
  }, [state.queue, state.history, currentUser])

  // Count of user's requests
  const myRequestsCount = currentUser?.login 
    ? myRequests()
    : 0

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
          <TabsList className="grid w-full grid-cols-4 bg-gray-800">
            <TabsTrigger value="queue" className="data-[state=active]:bg-gray-700">
              <Music className="mr-2" size={18} />
              Queue ({state.queue.length})
            </TabsTrigger>
            <TabsTrigger value="history" className="data-[state=active]:bg-gray-700">
              <History className="mr-2" size={18} />
              History ({state.history.length})
            </TabsTrigger>
            <TabsTrigger value="myrequests" className="data-[state=active]:bg-gray-700" disabled={!currentUser}>
              <User className="mr-2" size={18} />
              My Requests {currentUser ? `(${myRequestsCount})` : ''}
            </TabsTrigger>
            <TabsTrigger value="requestplan" className="data-[state=active]:bg-gray-700" disabled={!currentUser}>
              <ListPlus className="mr-2" size={18} />
              Request Plan {currentUser ? `(${requestPlan.length})` : ''}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="queue">
            <ScrollArea className="h-[400px] w-full rounded-md border border-gray-700 p-4 bg-gray-800">
              {state.isLoading ? (
                <LoadingState />
              ) : (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm text-gray-400">
                      <Clock className="inline-block mr-1 mb-0.5" size={14} /> Total: {totalQueueDurationFormatted}
                    </div>
                  </div>
                  <SongList songs={filteredQueue()} />
                </div>
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
          <TabsContent value="myrequests">
            <ScrollArea className="h-[400px] w-full rounded-md border border-gray-700 p-4 bg-gray-800">
              {state.isLoading ? (
                <LoadingState />
              ) : !currentUser ? (
                <div className="flex flex-col items-center justify-center h-full gap-3">
                  <User size={24} className="text-gray-400" />
                  <p className="text-gray-400">Please login with Twitch to see your requests</p>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => window.location.href = getTwitchAuthUrl()}
                    className="flex items-center gap-2 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border-purple-500/20"
                  >
                    Login with Twitch
                  </Button>
                </div>
              ) : <MyRequestsTab 
                currentUser={currentUser} 
                state={state} 
                searchTerm={searchTerm}
                isLoading={state.isLoading}
              />}
            </ScrollArea>
          </TabsContent>
          <TabsContent value="requestplan">
            <ScrollArea className="h-[400px] w-full rounded-md border border-gray-700 p-4 bg-gray-800">
              <RequestPlanTab 
                currentUser={currentUser}
                requestPlan={requestPlan}
                searchTerm={searchTerm}
                isLoading={state.isLoading}
                onDragEnd={onDragEnd}
                onRemove={handleRemoveFromRequestPlan}
                socket={socket}
              />
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
              <div className="flex items-center space-x-2">
                {song.channelId ? (
                  <Link href={`https://www.youtube.com/channel/${song.channelId}`} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-gray-300 underline transition-colors">
                    {song.artist || 'Unknown Artist'}
                  </Link>
                ) : (
                  <p className="text-gray-400">{song.artist || 'Unknown Artist'}</p>
                )}
                {/* Active Song Duration */}
                <span className="text-sm text-gray-400 flex items-center">
                  <Clock className="inline-block mr-1 -mt-0.5" size={14} />
                  {song.duration || '?:??'}
                </span>
              </div>
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

          <div className="flex space-x-1">
            {/* YouTube Link Button */}
            <a href={song.youtubeUrl} target="_blank" rel="noopener noreferrer" aria-label="Watch on YouTube">
              <Button variant="ghost" className="p-2">
                <Youtube className="h-12 w-12 text-red-600" />
              </Button>
            </a>
            
            {/* Spotify Link Button - Only show if Spotify data exists */}
            {song.spotify && (
              <a href={song.spotify.uri} target="_blank" rel="noopener noreferrer" aria-label="Listen on Spotify">
                <Button variant="ghost" className="p-2">
                  <SpotifyIcon className="h-10 w-10 text-green-500" />
                </Button>
              </a>
            )}
          </div>
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
                <span className="text-xs text-gray-400 flex items-center">
                  <Clock className="inline-block mr-1" size={12} />
                  {song.duration || '?:??'}
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
                  
                  {/* Moved request type badges right after username */}
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
            <div className="flex flex-col items-end space-y-1 flex-shrink-0">
              <div className="flex space-x-1">
                {/* YouTube Link Button */}
                <a href={song.youtubeUrl} target="_blank" rel="noopener noreferrer" aria-label="Watch on YouTube">
                  <Button variant="ghost" className="p-1">
                    <Youtube className="h-5 w-5 text-red-600" />
                  </Button>
                </a>
                
                {/* Spotify Link Button - Only show if Spotify data exists */}
                {song.spotify && (
                  <a href={song.spotify.uri} target="_blank" rel="noopener noreferrer" aria-label="Listen on Spotify">
                    <Button variant="ghost" className="p-1">
                      <SpotifyIcon className="h-5 w-5 text-green-500" />
                    </Button>
                  </a>
                )}
              </div>
              
              {/* Current Queue item timestamp display - moved to underneath the buttons */}
              {song.source !== 'database_history' && (
                <span className="text-xs text-gray-500 whitespace-nowrap">
                  Added: {formatTimestamp(song.timestamp)}
                </span>
              )}
              
              {/* History item timestamp display - stays underneath the buttons */}
              {song.source === 'database_history' && (
                <span className="text-xs text-gray-500 whitespace-nowrap">
                  Completed: {formatTimestamp(song.timestamp)}
                </span>
              )}
            </div>
          </div>
        </motion.div>
      ))}
    </AnimatePresence>
  )
} 