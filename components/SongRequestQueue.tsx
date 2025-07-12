"use client"

import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { io, Socket } from "socket.io-client"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Input } from "@/components/ui/input"
import { Search, Music, Clock, History, Loader2, Youtube, User, ListPlus, Trash2, GripVertical, Save, Plus, Link as LinkIcon, Edit } from "lucide-react"
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
  SpotifyIcon, 
  calculateTotalQueueDuration,
  getRequestPlan,
  saveRequestPlan,
  addToRequestPlan,
  removeFromRequestPlan,
  formatDurationFromSeconds
} from "@/lib/utils"
import { getTwitchAuthUrl } from "@/lib/auth"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { DragDropContext, Draggable, Droppable, DropResult } from '@hello-pangea/dnd'
import Image from 'next/image'
import { cn } from "@/lib/utils"

/*
 * Main queue component that displays current queue, history, and active song
 */

// Type for user data from the display cookie
interface TwitchUserDisplay {
  login: string
  display_name: string
  profile_image_url: string
}

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
  const [currentUser, setCurrentUser] = useState<TwitchUserDisplay | null>(null)
  const currentUserRef = useRef(currentUser);
  const [requestPlan, setRequestPlan] = useState<PlannedRequest[]>([])
  const [isYoutubeDialogOpen, setIsYoutubeDialogOpen] = useState(false)
  const [historyPage, setHistoryPage] = useState(1)
  const [isLoadingMoreHistory, setIsLoadingMoreHistory] = useState(false)
  const [hasMoreHistory, setHasMoreHistory] = useState(true)
  const [totalHistoryCount, setTotalHistoryCount] = useState(0)
  const [totalQueueCount, setTotalQueueCount] = useState(0)
  const [isEditSongLinksDialogOpen, setIsEditSongLinksDialogOpen] = useState(false)
  const [editingSongId, setEditingSongId] = useState<string | null>(null)
  const [currentSpotifyUrl, setCurrentSpotifyUrl] = useState('')
  const [currentYouTubeUrl, setCurrentYouTubeUrl] = useState('')
  const [editSpotifyError, setEditSpotifyError] = useState<string | null>(null)
  const [editSpotifySuccess, setEditSpotifySuccess] = useState(false)
  const [editYouTubeError, setEditYouTubeError] = useState<string | null>(null)
  const [editYouTubeSuccess, setEditYouTubeSuccess] = useState(false)
  const [activeTab, setActiveTab] = useState("queue");
  const [myRequestsHistory, setMyRequestsHistory] = useState<SongRequest[]>([]);
  const [myRequestsTotal, setMyRequestsTotal] = useState(0);
  const [myRequestsOffset, setMyRequestsOffset] = useState(0);
  const [isLoadingMyRequests, setIsLoadingMyRequests] = useState(false);
  const [hasMoreMyRequests, setHasMoreMyRequests] = useState(true);

  // Add state for search results and search mode
  const [searchResults, setSearchResults] = useState<SongRequest[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchTotal, setSearchTotal] = useState(0);
  const [searchPage, setSearchPage] = useState(1);
  const [isLoadingSearch, setIsLoadingSearch] = useState(false);
  const SEARCH_PAGE_SIZE = 20;

  // Calculate total queue duration
  const { formatted: totalQueueDurationFormatted } = calculateTotalQueueDuration(state.queue)

  // Function to handle song drag-and-drop in request plan
  const onDragEnd = (result: DropResult) => {
    if (!result.destination || !currentUser?.login) return;
    
    const items = Array.from(requestPlan);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    
    setRequestPlan(items);
    saveRequestPlan(currentUser.login, items);
  };
  
  // Function to handle removing a song from the request plan
  const handleRemoveFromRequestPlan = (songId: string) => {
    if (!currentUser?.login) return;
    
    const updatedPlan = removeFromRequestPlan(currentUser.login, songId);
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
    currentUser: TwitchUserDisplay | null,
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
      if (!socket || !currentUser?.login) return;
      
      socket.emit('addSong', {
        youtubeUrl: song.youtubeUrl,
        requester: currentUser.login,
        requestType: 'channelPoint' // Assuming channel points for manual requests
      } as Partial<SongRequest> & { requester: string; youtubeUrl?: string; message?: string }, (error: any) => {
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
          <ListPlus size={24} className="text-brand-purple-light/70" />
          <p className="text-brand-purple-light/70">Please login with Twitch to use your Request Plan</p>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => window.location.href = getTwitchAuthUrl()}
            className="flex items-center gap-2 bg-brand-purple-neon/10 hover:bg-brand-purple-neon/20 text-brand-purple-light border-brand-purple-neon/40 hover:shadow-glow-purple-sm transition-shadow"
          >
            Login with Twitch
          </Button>
        </div>
      )
    }
    
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-4">
          <AddToPlanDialog 
            isOpen={isYoutubeDialogOpen}
            onOpenChange={setIsYoutubeDialogOpen}
            currentUser={currentUser}
            socket={socket}
            onAddToRequestPlan={(newSong) => {
              if (currentUser?.login) {
                const updatedPlan = addToRequestPlan(currentUser.login, newSong);
                setRequestPlan(updatedPlan);
              }
            }}
          />
          
          <p className="text-sm text-brand-purple-light/80 flex-1">
            {filteredPlan.length === 0 
              ? "Add songs to your plan for easy requesting later."
              : `${filteredPlan.length} song${filteredPlan.length !== 1 ? 's' : ''} in your plan.`}
          </p>
        </div>
        
        {filteredPlan.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[300px] border border-dashed border-brand-purple-dark rounded-md">
            <ListPlus size={24} className="text-brand-purple-light/70 mb-2" />
            <p className="text-brand-purple-light/70">Your request plan is empty</p>
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
                        <motion.div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          className={cn(
                            "flex flex-wrap sm:flex-nowrap items-center sm:space-x-3 p-3 rounded-md bg-brand-purple-dark/30 hover:bg-brand-purple-dark/50 transition-colors duration-200 mb-2 border border-brand-purple-neon/10 hover:border-brand-purple-neon/30",
                          )}
                        >
                          <div className="flex items-center space-x-3 flex-shrink-0">
                            <div
                              {...provided.dragHandleProps}
                              className="flex-shrink-0 cursor-move text-brand-purple-light/50 hover:text-brand-purple-light/80 transition-colors"
                            >
                              <GripVertical size={20} />
                            </div>
                            
                            <div className="flex-shrink-0 font-semibold text-brand-purple-light/60 w-6 text-center">
                              {index + 1}
                            </div>
                            
                            <div className="relative w-16 h-9 rounded-md overflow-hidden flex-shrink-0 border border-brand-purple-neon/10">
                              {song.thumbnailUrl ? (
                                <img 
                                  src={song.thumbnailUrl} 
                                  alt={song.title || 'Video thumbnail'}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <Avatar className="w-full h-full rounded-md bg-brand-purple-dark/50">
                                  <AvatarFallback className="rounded-md bg-transparent flex items-center justify-center">
                                    <Music size={24} className="text-brand-purple-light/70"/>
                                  </AvatarFallback>
                                </Avatar>
                              )}
                            </div>
                          </div>
                          
                          <div className="flex-grow min-w-0 w-full sm:w-auto order-first sm:order-none mb-2 sm:mb-0">
                            <p className="font-medium text-white truncate flex items-center gap-1">
                              {song.title || song.youtubeUrl}
                            </p>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
                              {song.channelId ? (
                                <Link href={`https://www.youtube.com/channel/${song.channelId}`} target="_blank" rel="noopener noreferrer" className="hover:text-brand-pink-light transition-colors group">
                                  <Badge variant="outline" className="text-xs font-normal cursor-pointer border-brand-purple-neon/20 text-brand-purple-light/80 group-hover:border-brand-pink-neon/40 group-hover:text-brand-pink-light transition-colors">
                                    {song.artist || 'Unknown Artist'}
                                  </Badge>
                                </Link>
                              ) : (
                                <Badge variant="outline" className="text-xs font-normal border-brand-purple-neon/20 text-brand-purple-light/80">
                                  {song.artist || 'Unknown Artist'}
                                </Badge>
                              )}
                              {song.durationSeconds !== undefined && (
                                <span className="text-xs text-brand-purple-light/70 flex items-center">
                                  <Clock className="inline-block mr-1" size={12} />
                                  {formatDurationFromSeconds(song.durationSeconds ?? 0)}
                                </span>
                              )}
                            </div>
                          </div>
                          
                          <div className="flex flex-col items-start sm:items-end space-y-1 flex-shrink-0 w-full sm:w-auto">
                            <div className="flex space-x-1 items-center">
                              {/* Youtube button - Only show if youtubeUrl exists */}
                              {song.youtubeUrl && (
                                <a href={song.youtubeUrl} target="_blank" rel="noopener noreferrer" aria-label="Watch on YouTube">
                                  <Button variant="ghost" className="p-1 text-red-500 hover:text-red-400">
                                    <Youtube className="h-5 w-5" />
                                  </Button>
                                </a>
                              )}
                              
                              {/* Spotify Link Button - Only show if Spotify data exists */}
                              {song.spotifyData && song.spotifyData.url && (
                                <a href={String(song.spotifyData.url)} target="_blank" rel="noopener noreferrer" aria-label="Listen on Spotify">
                                  <Button variant="ghost" className="p-1 text-green-500 hover:text-green-400">
                                    <SpotifyIcon className="h-5 w-5" />
                                  </Button>
                                </a>
                              )}
                              
                              {/* Remove button */}
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="p-1 text-brand-pink-neon/70 hover:text-brand-pink-neon hover:bg-brand-pink-neon/10 rounded-full transition-all"
                                onClick={() => onRemove(song.id)}
                                title="Remove from plan"
                              >
                                <Trash2 size={18} />
                              </Button>
                            </div>
                            
                            {/* Timestamp below buttons */}
                            <span className="text-xs text-brand-purple-light/50 whitespace-nowrap">
                              Added: {formatTimestamp(song.addedAt)}
                            </span>
                          </div>
                        </motion.div>
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

  // Component to render the "My Requests" tab
  function MyRequestsTab({ 
    currentUser, 
    state, 
    searchTerm,
    isLoading,
    socket,
    myRequestsHistory,
    myRequestsTotal,
    hasMoreMyRequests,
    isLoadingMyRequests,
    loadMoreMyRequests,
    setEditingSongId,
    setCurrentSpotifyUrl,
    setCurrentYouTubeUrl,
    setIsEditSongLinksDialogOpen,
    setEditSpotifyError,
    setEditSpotifySuccess,
    setEditYouTubeError,
    setEditYouTubeSuccess
  }: { 
    currentUser: TwitchUserDisplay | null,
    state: AppState,
    searchTerm: string,
    isLoading: boolean,
    socket: Socket | null,
    myRequestsHistory: SongRequest[],
    myRequestsTotal: number,
    hasMoreMyRequests: boolean,
    isLoadingMyRequests: boolean,
    loadMoreMyRequests: () => void,
    setEditingSongId: React.Dispatch<React.SetStateAction<string | null>>,
    setCurrentSpotifyUrl: React.Dispatch<React.SetStateAction<string>>,
    setCurrentYouTubeUrl: React.Dispatch<React.SetStateAction<string>>,
    setIsEditSongLinksDialogOpen: React.Dispatch<React.SetStateAction<boolean>>,
    setEditSpotifyError: React.Dispatch<React.SetStateAction<string | null>>,
    setEditSpotifySuccess: React.Dispatch<React.SetStateAction<boolean>>,
    setEditYouTubeError: React.Dispatch<React.SetStateAction<string | null>>,
    setEditYouTubeSuccess: React.Dispatch<React.SetStateAction<boolean>>
  }) {
    const lowerCaseLogin = currentUser?.login?.toLowerCase();
    
    // Filter queue and history based on login name and search term
    const myQueueSongs = state.queue.filter(song => 
        (song.requesterLogin?.toLowerCase() === lowerCaseLogin || song.requester.toLowerCase() === lowerCaseLogin) &&
        (song.title?.toLowerCase().includes(searchTerm.toLowerCase()) || song.artist?.toLowerCase().includes(searchTerm.toLowerCase()))
    );
    const myFilteredHistorySongs = myRequestsHistory.filter(song => 
        (song.title?.toLowerCase().includes(searchTerm.toLowerCase()) || song.artist?.toLowerCase().includes(searchTerm.toLowerCase()))
    );
    
    const hasNoRequests = myQueueSongs.length === 0 && myFilteredHistorySongs.length === 0 && !isLoadingMyRequests;
      
    if (isLoading || (isLoadingMyRequests && myRequestsHistory.length === 0)) {
      return <LoadingState />
    }
    
    if (!currentUser) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-3">
          <User size={24} className="text-brand-purple-light/70" />
          <p className="text-brand-purple-light/70">Please login with Twitch to see your requests</p>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => window.location.href = getTwitchAuthUrl()}
            className="flex items-center gap-2 bg-brand-purple-neon/10 hover:bg-brand-purple-neon/20 text-brand-purple-light border-brand-purple-neon/40 hover:shadow-glow-purple-sm transition-shadow"
          >
            Login with Twitch
          </Button>
        </div>
      )
    }
    
    if (hasNoRequests) {
      return (
        <div className="flex flex-col items-center justify-center h-full">
          <User size={24} className="text-brand-purple-light/70 mb-2" />
          <p className="text-brand-purple-light/70">You haven't made any song requests yet</p>
        </div>
      )
    }
    
    return (
      <div className="space-y-4">
        {myQueueSongs.length > 0 && (
          <div className="mt-6">
            <div className="flex items-center gap-2 mb-2">
              <Music size={16} className="text-brand-purple-light" />
              <h3 className="text-sm font-medium text-brand-purple-light">In Queue ({myQueueSongs.length})</h3>
            </div>
            <SongList 
              songs={myQueueSongs} 
              isHistory={false} 
              currentUser={currentUser} 
              socket={socket} 
              setEditingSongId={setEditingSongId}
              setCurrentSpotifyUrl={setCurrentSpotifyUrl}
              setCurrentYouTubeUrl={setCurrentYouTubeUrl}
              setIsEditSongLinksDialogOpen={setIsEditSongLinksDialogOpen}
              setEditSpotifyError={setEditSpotifyError}
              setEditSpotifySuccess={setEditSpotifySuccess}
              setEditYouTubeError={setEditYouTubeError}
              setEditYouTubeSuccess={setEditYouTubeSuccess}
            />
          </div>
        )}
        
        {myQueueSongs.length > 0 && myFilteredHistorySongs.length > 0 && (
          <div className="border-t border-brand-purple-dark my-4"></div>
        )}
        
        {myFilteredHistorySongs.length > 0 && (
          <div className="mt-6 pt-6 border-t border-brand-purple-dark/30">
            <div className="flex items-center gap-2 mb-2">
              <History size={16} className="text-brand-purple-light/80" />
              <h3 className="text-sm font-medium text-brand-purple-light/80">Previously Requested ({myRequestsTotal})</h3>
            </div>
            <SongList 
              songs={myFilteredHistorySongs} 
              isHistory={true} 
              currentUser={currentUser} 
              socket={socket}
            />
          </div>
        )}

        {hasMoreMyRequests && (
          <div className="mt-6 flex justify-center">
            <Button
              variant="outline"
              className="bg-brand-purple-dark/50 border-brand-purple-neon/20 text-brand-purple-light hover:bg-brand-purple-dark/70 hover:border-brand-purple-neon/40 hover:text-white transition-all"
              onClick={loadMoreMyRequests}
              disabled={isLoadingMyRequests}
            >
              {isLoadingMyRequests ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading...
                </>
              ) : (
                <>Load More History</>
              )}
            </Button>
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
      
      const userDisplayJson = cookies['twitch_user_display']
      if (userDisplayJson) {
        try {
          const decoded = decodeURIComponent(userDisplayJson)
          // Use a functional update to compare with the previous state
          setCurrentUser(prevUser => {
            if (JSON.stringify(prevUser) !== decoded) {
              const newUser = JSON.parse(decoded);
              // Also update request plan if the user has changed
              if (newUser.login) {
                const loadedPlan = getRequestPlan(newUser.login);
                setRequestPlan(loadedPlan);
              }
              return newUser;
            }
            return prevUser;
          });
        } catch (e) {
          console.error('Failed to parse user display cookie:', e)
          setCurrentUser(null);
          setRequestPlan([]);
        }
      } else {
        if (currentUser !== null) {
          setCurrentUser(null);
          setRequestPlan([]);
        }
      }
    }

    readUserFromCookie()
    
    // Setup listener for auth success/logout to refresh user data
    const handleStorageChange = (e: StorageEvent) => {
      // Listen for custom events or changes that indicate login/logout
      if (e.key === 'logout' || e.key === 'login') { 
        readUserFromCookie()
      } else if (e.key === 'twitch_user_display') { // Also listen for direct cookie changes
        readUserFromCookie();
      }
    }
    
    window.addEventListener('storage', handleStorageChange)
    // Additionally, listen for cookie changes if storage events aren't reliable across tabs/windows
    const intervalId = setInterval(readUserFromCookie, 5000); // Check cookie every 5 seconds

    return () => {
       window.removeEventListener('storage', handleStorageChange);
       clearInterval(intervalId); // Clear interval on cleanup
    }
  }, [])

  // Socket connection management
  useEffect(() => {
    // Use an absolute path for the socket connection
    // When NEXT_PUBLIC_SOCKET_URL is empty, it will use the current domain
    const socketHost = process.env.NEXT_PUBLIC_SOCKET_URL || '';
    console.log(`Attempting to connect WebSocket to: ${socketHost || 'current domain'}`);

    // Track connection attempts
    let connectionAttempts = 0;
    const maxAttempts = 5;

    const newSocket = io(socketHost, {
      transports: ['polling', 'websocket'], // Try polling first, then upgrade to websocket
      reconnectionAttempts: constants.SOCKET_RECONNECT_ATTEMPTS,
      reconnectionDelay: constants.SOCKET_RECONNECT_DELAY,
      path: '/socket.io/',
      timeout: 20000, // Increase timeout
      forceNew: true,
      autoConnect: true,
      upgrade: true
    })

    newSocket.on('connect', () => {
      console.log('Connected to WebSocket server')
      setIsConnected(true)
      connectionAttempts = 0; // Reset counter on successful connection
      // Request initial state only after connection is established
      newSocket.emit('getState');
    })

    newSocket.on('connect_error', (error: Error) => {
      console.error('Socket connection error:', error)
      connectionAttempts++;
      console.log(`Connection attempt ${connectionAttempts}/${maxAttempts}`);
      
      if (connectionAttempts === 1) {
        console.log('First connection attempt failed, trying with different transport settings...');
        // If on first attempt, try reconnecting with just websocket
        newSocket.io.opts.transports = ['websocket'];
      }
      
      if (connectionAttempts >= maxAttempts) {
        console.error('Max connection attempts reached. Showing dummy data.');
        // Set some dummy data to show the UI in a reasonable state
        setState((prev: AppState) => ({
          ...prev,
          queue: [],
          history: [],
          activeSong: null,
          isLoading: false,
          error: new Error(`Failed to connect to the server after ${maxAttempts} attempts.`)
        }));
      }
    })

    // Handle initial state from server
    newSocket.on('initialState', (serverState: Partial<AppState>) => {
      console.log('Received initial state:', serverState);
      setState((prev: AppState) => ({
        ...prev,
        queue: serverState.queue || [],
        history: serverState.history || [],
        activeSong: serverState.activeSong || null,
        settings: serverState.settings || {},
        blacklist: serverState.blacklist || [],
        blockedUsers: serverState.blockedUsers || [],
        isLoading: false,
        error: null // Clear error on successful state received
      }))
    })

    // Event handlers for queue updates
    newSocket.on(socketEvents.NEW_SONG_REQUEST, (song: SongRequest) => {
      console.log('Received new song request:', song)
      setState((prev: AppState) => ({
        ...prev,
        queue: [...prev.queue, song]
      }))
    })

    newSocket.on(socketEvents.QUEUE_UPDATE, (updatedQueue: SongRequest[]) => {
      console.log('Queue updated:', updatedQueue)
      setState((prev: AppState) => ({ ...prev, queue: updatedQueue }))
    })

    newSocket.on('historyUpdate', (updatedHistory: SongRequest[]) => {
      console.log('History updated:', updatedHistory)
      setState((prev: AppState) => ({ ...prev, history: updatedHistory }));
    })
    
    newSocket.on('songFinished', (finishedSong: SongRequest) => {
      console.log('Song finished event received:', finishedSong); 
      // State update relies on 'historyUpdate' and 'activeSong' events from server
      // Check if the finished song belongs to the current user
      if (currentUserRef.current && finishedSong.requesterLogin?.toLowerCase() === currentUserRef.current.login.toLowerCase()) {
        console.log('A song by the current user was finished. Refetching my requests.');
        // Refetch the first page of the user's history to update the list and total count
        newSocket.emit('getUserHistory', {
          userLogin: currentUserRef.current.login,
          limit: constants.HISTORY_PAGE_SIZE,
          offset: 0
        });
      }
    })

    newSocket.on(socketEvents.ACTIVE_SONG, (song: SongRequest | null) => {
      console.log('Active song updated:', song)
      setState((prev: AppState) => ({
        ...prev,
        activeSong: song,
      }))
    })

    // Add a listener for moreHistoryData events
    newSocket.on('moreHistoryData', (historyChunk: SongRequest[]) => {
      console.log('Received more history data:', historyChunk);
      
      if (historyChunk.length === 0) {
        // No more history to load
        setHasMoreHistory(false);
      } else {
        setState((prev: AppState) => ({
          ...prev,
          // Append new history items to the existing ones instead of replacing
          history: [...prev.history, ...historyChunk],
          // Update queue count just in case it changed
          queue: prev.queue // Keep queue as is, count comes from totalCountsUpdate
        }));
        // Increment the page counter
        setHistoryPage(prevPage => prevPage + 1);
      }
      
      setIsLoadingMoreHistory(false);
    });

    // Listen for total count updates
    newSocket.on('totalCountsUpdate', (counts: { history: number; queue: number }) => {
      console.log('Received total counts:', counts);
      setTotalHistoryCount(counts.history);
      setTotalQueueCount(counts.queue);
      // Update queue state length for UI consistency if needed, though queue itself is handled by queueUpdate
      // setState(prev => ({...prev, queue: prev.queue.slice(0, counts.queue) })); // Example, might not be needed
    });

    newSocket.on('userHistoryData', ({ history: newHistory, total, offset }) => {
      if (offset === 0) {
          setMyRequestsHistory(newHistory);
      } else {
          setMyRequestsHistory(prev => [...prev, ...newHistory]);
      }
      setMyRequestsTotal(total);
      const newOffset = offset + newHistory.length;
      setMyRequestsOffset(newOffset);
      setHasMoreMyRequests(newOffset < total);
      setIsLoadingMyRequests(false);
    });

    // --- Listen for history order change signal --- 
    newSocket.on('historyOrderChanged', () => {
      console.log('History order changed signal received. Refetching state.');
      // Refetch the initial state to get the latest ordered history
      newSocket.emit('getState'); 
      // Reset pagination for history if needed
      // setHistoryPage(1); 
      // setHasMoreHistory(true);
    });
    // --- END --- 

    setSocket(newSocket)


    return () => {
      console.log('Disconnecting socket...');
      // --- Clean up history order listener --- 
      newSocket.off('historyOrderChanged');
      // --- END --- 
      newSocket.disconnect()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Empty dependency array ensures this runs only once on mount

  useEffect(() => {
    if (socket && currentUser?.login) {
      // Fetch initial total count for the "My Requests" tab
      socket.emit('getUserHistory', { 
        userLogin: currentUser.login, 
        limit: 0, 
        offset: 0 
      });
    }
  }, [socket, currentUser]);

  useEffect(() => {
    if (activeTab === 'my-requests' && currentUser?.login && myRequestsHistory.length === 0 && socket) {
        setIsLoadingMyRequests(true);
        socket.emit('getUserHistory', { 
            userLogin: currentUser.login, 
            limit: constants.HISTORY_PAGE_SIZE,
            offset: 0 
        });
    }
  }, [activeTab, currentUser, socket, myRequestsHistory.length]);

  // Effect: When searchTerm changes, trigger backend search or reset
  useEffect(() => {
    if (!socket) return;
    if (searchTerm.trim() === "") {
      setIsSearching(false);
      setSearchResults([]);
      setSearchTotal(0);
      setSearchPage(1);
      return;
    }
    setIsSearching(true);
    setIsLoadingSearch(true);
    setSearchPage(1);
    socket.emit('searchHistory', { query: searchTerm, limit: SEARCH_PAGE_SIZE, offset: 0 }, (res: any) => {
      if (res && !res.error) {
        setSearchResults(res.results || []);
        setSearchTotal(res.total || 0);
      } else {
        setSearchResults([]);
        setSearchTotal(0);
      }
      setIsLoadingSearch(false);
    });
  }, [searchTerm, socket]);

  // Function to load more search results
  const loadMoreSearchResults = () => {
    if (!socket || isLoadingSearch) return;
    setIsLoadingSearch(true);
    const nextOffset = searchPage * SEARCH_PAGE_SIZE;
    socket.emit('searchHistory', { query: searchTerm, limit: SEARCH_PAGE_SIZE, offset: nextOffset }, (res: any) => {
      if (res && !res.error) {
        setSearchResults(prev => [...prev, ...(res.results || [])]);
        setSearchTotal(res.total || 0);
        setSearchPage(prev => prev + 1);
      }
      setIsLoadingSearch(false);
    });
  };

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
  
  // Count of user's requests in the queue
  const myQueueSongsCount = useMemo(() => {
    if (!currentUser?.login) return 0;
    const lowerCaseLogin = currentUser.login.toLowerCase();
    return state.queue.filter(song => 
      (song.requesterLogin?.toLowerCase() === lowerCaseLogin || song.requester.toLowerCase() === lowerCaseLogin)
    ).length;
  }, [state.queue, currentUser]);

  // Total count for "My Requests" tab = songs in queue + total from history
  const myRequestsCount = myQueueSongsCount + myRequestsTotal;

  // Function to load more history data
  const loadMoreHistory = useCallback(() => {
    if (!socket || isLoadingMoreHistory || !hasMoreHistory) return;
    
    setIsLoadingMoreHistory(true);
    
    const pageSize = 20;
    const offset = historyPage * pageSize;
    
    console.log(`Requesting more history (offset: ${offset}, limit: ${pageSize})`);
    socket.emit('getMoreHistory', { offset, limit: pageSize });
  }, [socket, historyPage, isLoadingMoreHistory, hasMoreHistory]);

  // Add socket listeners for the edit Spotify response 
  useEffect(() => {
    if (!socket) return;

    // Socket event listeners for editing Spotify link
    socket.on(socketEvents.EDIT_SPOTIFY_SUCCESS, (data) => {
      const { requestId, message } = data;
      if (requestId === editingSongId) {
        setEditSpotifySuccess(true);
        setEditSpotifyError(null);
        // Auto-close after success
        setTimeout(() => {
          setIsEditSongLinksDialogOpen(false);
          setEditSpotifySuccess(false); 
          setEditingSongId(null);
          setCurrentSpotifyUrl('');
          setCurrentYouTubeUrl('');
        }, 1500);
      }
    });

    socket.on(socketEvents.EDIT_SPOTIFY_ERROR, (data) => {
      const { requestId, message } = data;
      if (requestId === editingSongId) {
        setEditSpotifyError(message || 'Error updating Spotify link');
        setEditSpotifySuccess(false);
      }
    });

    socket.on(socketEvents.EDIT_YOUTUBE_SUCCESS, (data) => {
      const { requestId, message } = data;
      if (requestId === editingSongId) {
        setEditYouTubeSuccess(true);
        setEditYouTubeError(null);
        // Auto-close after success
        setTimeout(() => {
          setIsEditSongLinksDialogOpen(false);
          setEditYouTubeSuccess(false); 
          setEditingSongId(null);
          setCurrentSpotifyUrl('');
          setCurrentYouTubeUrl('');
        }, 1500);
      }
    });

    socket.on(socketEvents.EDIT_YOUTUBE_ERROR, (data) => {
      const { requestId, message } = data;
      if (requestId === editingSongId) {
        setEditYouTubeError(message || 'Error updating YouTube link');
        setEditYouTubeSuccess(false);
      }
    });

    return () => {
      socket.off(socketEvents.EDIT_SPOTIFY_SUCCESS);
      socket.off(socketEvents.EDIT_SPOTIFY_ERROR);
      socket.off(socketEvents.EDIT_YOUTUBE_SUCCESS);
      socket.off(socketEvents.EDIT_YOUTUBE_ERROR);
    };
  }, [socket, editingSongId]);

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  return (
    <ErrorBoundary>
      <div className="w-full max-w-4xl mx-auto p-6 bg-brand-purple-deep/70 text-white rounded-lg shadow-xl border border-brand-purple-neon/20 backdrop-blur-md shadow-glow-purple">
        <Header isConnected={isConnected} />
        <ActiveSong song={state.activeSong} isLoading={state.isLoading} />

        <div className="mb-4 relative">
          <Input
            type="text"
            placeholder="Search songs, artists, or requesters..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 bg-brand-purple-dark/50 border-brand-purple-neon/30 text-white focus:ring-brand-pink-neon focus:border-brand-pink-neon placeholder:text-brand-purple-light/50"
          />
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-brand-purple-light/60" size={20} />
        </div>

        <Tabs defaultValue="queue" className="w-full" onValueChange={setActiveTab}>
          {/* Tabs Style */}
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 bg-brand-purple-dark/50 border border-brand-purple-neon/10 p-1 h-auto rounded-lg">
            <TabsTrigger value="queue" className="data-[state=active]:bg-brand-purple-dark data-[state=active]:text-brand-pink-light data-[state=active]:shadow-md data-[state=active]:shadow-brand-black/30 text-brand-purple-light/80 hover:bg-brand-purple-dark/70 hover:text-white transition-all rounded-md data-[state=active]:border data-[state=active]:border-brand-pink-neon/50 data-[state=active]:text-glow-pink relative group text-xs sm:text-sm">
              {/* Add shiny icon to active state */}
              <div className="absolute -top-1 -right-1 w-3 h-3 opacity-0 group-data-[state=active]:opacity-100 transition-opacity duration-300">
                <Image src="/shiny.png" alt="" fill sizes="12px" className="object-contain"/>
              </div>
              <Music className="mr-1 sm:mr-1.5" size={16} />
              {/* Use totalQueueCount for display */}
              <span className="truncate">Queue ({totalQueueCount})</span>
            </TabsTrigger>
            <TabsTrigger value="history" className="data-[state=active]:bg-brand-purple-dark data-[state=active]:text-brand-pink-light data-[state=active]:shadow-md data-[state=active]:shadow-brand-black/30 text-brand-purple-light/80 hover:bg-brand-purple-dark/70 hover:text-white transition-all rounded-md data-[state=active]:border data-[state=active]:border-brand-pink-neon/50 data-[state=active]:text-glow-pink relative group text-xs sm:text-sm">
              {/* Add shiny icon to active state */}
              <div className="absolute -top-1 -right-1 w-3 h-3 opacity-0 group-data-[state=active]:opacity-100 transition-opacity duration-300">
                <Image src="/shiny.png" alt="" fill sizes="12px" className="object-contain"/>
              </div>
              <History className="mr-1 sm:mr-1.5" size={16} />
              {/* Use totalHistoryCount for display */}
              <span className="truncate">History ({totalHistoryCount})</span>
            </TabsTrigger>
            <TabsTrigger value="my-requests" className="data-[state=active]:bg-brand-purple-dark data-[state=active]:text-brand-pink-light data-[state=active]:shadow-md data-[state=active]:shadow-brand-black/30 text-brand-purple-light/80 hover:bg-brand-purple-dark/70 hover:text-white transition-all rounded-md data-[state=active]:border data-[state=active]:border-brand-pink-neon/50 data-[state=active]:text-glow-pink disabled:opacity-50 disabled:pointer-events-none relative group text-xs sm:text-sm" disabled={!currentUser}>
              {/* Add shiny icon to active state */}
              <div className="absolute -top-1 -right-1 w-3 h-3 opacity-0 group-data-[state=active]:opacity-100 transition-opacity duration-300">
                <Image src="/shiny.png" alt="" fill sizes="12px" className="object-contain"/>
              </div>
              <User className="mr-1 sm:mr-1.5" size={16} />
              <span className="truncate">My Requests {currentUser ? `(${myRequestsCount})` : ''}</span>
            </TabsTrigger>
            <TabsTrigger value="request-plan" className="data-[state=active]:bg-brand-purple-dark data-[state=active]:text-brand-pink-light data-[state=active]:shadow-md data-[state=active]:shadow-brand-black/30 text-brand-purple-light/80 hover:bg-brand-purple-dark/70 hover:text-white transition-all rounded-md data-[state=active]:border data-[state=active]:border-brand-pink-neon/50 data-[state=active]:text-glow-pink disabled:opacity-50 disabled:pointer-events-none relative group text-xs sm:text-sm" disabled={!currentUser}>
              {/* Add shiny icon to active state */}
              <div className="absolute -top-1 -right-1 w-3 h-3 opacity-0 group-data-[state=active]:opacity-100 transition-opacity duration-300">
                <Image src="/shiny.png" alt="" fill sizes="12px" className="object-contain"/>
              </div>
              <ListPlus className="mr-1 sm:mr-1.5" size={16} />
              <span className="truncate">Request Plan {currentUser ? `(${requestPlan.length})` : ''}</span>
            </TabsTrigger>
          </TabsList>
          <TabsContent value="queue" className="mt-4">
            <ErrorBoundary>
              <SongList 
                songs={filteredQueue()} 
                isHistory={false} 
                currentUser={currentUser}
                socket={socket}
                setEditingSongId={setEditingSongId}
                setCurrentSpotifyUrl={setCurrentSpotifyUrl}
                setCurrentYouTubeUrl={setCurrentYouTubeUrl}
                setIsEditSongLinksDialogOpen={setIsEditSongLinksDialogOpen}
                setEditSpotifyError={setEditSpotifyError}
                setEditSpotifySuccess={setEditSpotifySuccess}
                setEditYouTubeError={setEditYouTubeError}
                setEditYouTubeSuccess={setEditYouTubeSuccess}
              />
            </ErrorBoundary>
          </TabsContent>
          <TabsContent value="history" className="mt-4">
            <ErrorBoundary>
              {/* Show loading animation when searching */}
              {isSearching && isLoadingSearch && (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="w-8 h-8 animate-spin text-brand-pink-neon" />
                  <span className="ml-3 text-brand-purple-light/80 text-base">Searching...</span>
                </div>
              )}
              {/* Show 'No songs found' message if search is done and no results */}
              {isSearching && !isLoadingSearch && searchResults.length === 0 && (
                <div className="flex flex-col items-center justify-center h-32">
                  <Search size={32} className="text-brand-purple-light/70 mb-2" />
                  <p className="text-brand-purple-light/70 text-base">No songs found</p>
                  <p className="text-brand-purple-light/40 text-sm mt-1">Try a different search term.</p>
                </div>
              )}
              {/* Only show SongList if not loading and there are results, or if not searching */}
              {(!isSearching || (!isLoadingSearch && searchResults.length > 0)) && (
                <SongList 
                  songs={isSearching ? searchResults : filteredHistory()} 
                  isHistory={true} 
                  currentUser={currentUser}
                  socket={socket}
                />
              )}
              {/* Load More for search or normal history */}
              {isSearching ? (
                searchResults.length < searchTotal && (
                  <div className="mt-6 flex justify-center">
                    <Button
                      variant="outline"
                      className="bg-brand-purple-dark/50 border-brand-purple-neon/20 text-brand-purple-light hover:bg-brand-purple-dark/70 hover:border-brand-purple-neon/40 hover:text-white transition-all"
                      onClick={loadMoreSearchResults}
                      disabled={isLoadingSearch}
                    >
                      {isLoadingSearch ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Loading...
                        </>
                      ) : (
                        <>Load More Results</>
                      )}
                    </Button>
                  </div>
                )
              ) : (
                hasMoreHistory && state.history.length > 0 && (
                  <div className="mt-6 flex justify-center">
                    <Button
                      variant="outline"
                      className="bg-brand-purple-dark/50 border-brand-purple-neon/20 text-brand-purple-light hover:bg-brand-purple-dark/70 hover:border-brand-purple-neon/40 hover:text-white transition-all"
                      onClick={loadMoreHistory}
                      disabled={isLoadingMoreHistory}
                    >
                      {isLoadingMoreHistory ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Loading...
                        </>
                      ) : (
                        <>Load More History</>
                      )}
                    </Button>
                  </div>
                )
              )}
              {/* End of history message for search */}
              {isSearching && searchResults.length >= searchTotal && searchResults.length > 0 && (
                <div className="mt-4 text-center text-brand-purple-light/60 text-sm">
                  End of search results
                </div>
              )}
              {/* End of history message for normal history */}
              {!isSearching && !hasMoreHistory && state.history.length > 0 && (
                <div className="mt-4 text-center text-brand-purple-light/60 text-sm">
                  End of history reached
                </div>
              )}
            </ErrorBoundary>
          </TabsContent>
          <TabsContent value="my-requests" className="mt-4">
            <ErrorBoundary>
              <MyRequestsTab 
                currentUser={currentUser} 
                state={state} 
                searchTerm={searchTerm} 
                isLoading={state.isLoading} 
                socket={socket}
                myRequestsHistory={myRequestsHistory}
                myRequestsTotal={myRequestsTotal}
                hasMoreMyRequests={hasMoreMyRequests}
                isLoadingMyRequests={isLoadingMyRequests}
                loadMoreMyRequests={() => {
                  if (!socket || !currentUser?.login || isLoadingMyRequests) return;
                  setIsLoadingMyRequests(true);
                  socket.emit('getUserHistory', {
                    userLogin: currentUser.login,
                    limit: constants.HISTORY_PAGE_SIZE,
                    offset: myRequestsOffset
                  });
                }}
                setEditingSongId={setEditingSongId}
                setCurrentSpotifyUrl={setCurrentSpotifyUrl}
                setCurrentYouTubeUrl={setCurrentYouTubeUrl}
                setIsEditSongLinksDialogOpen={setIsEditSongLinksDialogOpen}
                setEditSpotifyError={setEditSpotifyError}
                setEditSpotifySuccess={setEditSpotifySuccess}
                setEditYouTubeError={setEditYouTubeError}
                setEditYouTubeSuccess={setEditYouTubeSuccess}
              />
            </ErrorBoundary>
          </TabsContent>
          <TabsContent value="request-plan" className="mt-4">
            <ErrorBoundary>
              <RequestPlanTab 
                currentUser={currentUser}
                requestPlan={requestPlan}
                searchTerm={searchTerm}
                isLoading={state.isLoading}
                onDragEnd={onDragEnd}
                onRemove={handleRemoveFromRequestPlan}
                socket={socket}
              />
            </ErrorBoundary>
          </TabsContent>
        </Tabs>

        {/* Add the EditSongLinksDialog */}
        <EditSongLinksDialog
          isOpen={isEditSongLinksDialogOpen}
          onOpenChange={setIsEditSongLinksDialogOpen}
          currentUser={currentUser}
          socket={socket}
          songId={editingSongId}
          initialSpotifyUrl={currentSpotifyUrl}
          initialYouTubeUrl={currentYouTubeUrl}
          spotifySuccess={editSpotifySuccess}
          spotifyError={editSpotifyError}
          youtubeSuccess={editYouTubeSuccess}
          youtubeError={editYouTubeError}
          onReset={() => {
            setEditSpotifyError(null);
            setEditSpotifySuccess(false);
            setEditYouTubeError(null);
            setEditYouTubeSuccess(false);
          }}
        />
      </div>
    </ErrorBoundary>
  )
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="w-8 h-8 animate-spin text-brand-pink-neon" />
    </div>
  )
}

function ActiveSong({ song, isLoading }: { song: SongRequest | null, isLoading: boolean }) {
  return (
    <div className="mb-6 p-4 bg-gradient-to-r from-brand-purple-dark/80 to-brand-purple-deep/80 rounded-lg shadow-md border border-brand-pink-neon/30 shadow-glow-pink-sm relative overflow-hidden">
      <motion.div 
        className="absolute -top-2 -right-2 w-12 h-12 opacity-50 pointer-events-none" 
        animate={{ 
          y: [0, -4, 0, 4, 0], 
          rotate: [0, 5, -5, 5, 0],
        }}
        transition={{ 
          duration: 4, 
          repeat: Infinity, 
          ease: "easeInOut" 
        }}
      >
        <Image 
          src="/shiny.png" 
          alt="" 
          fill
          sizes="48px"
          className="object-contain drop-shadow-lg"
        />
      </motion.div>
      
      <h2 className="text-xl font-semibold mb-3 flex items-center text-brand-pink-light text-glow-pink">
        <Music className="mr-2" size={24} />
        Current Active Song
      </h2>
      {isLoading ? (
        <LoadingState />
      ) : song ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex items-center justify-between w-full"
        >
          <div className="flex items-center space-x-4">
            <Avatar className="w-24 h-16 rounded-md border border-brand-pink-neon/20">
              <AvatarImage src={song.thumbnailUrl ?? undefined} alt={`${song.title} thumbnail`} className="object-cover" />
              <AvatarFallback className="rounded-md bg-brand-purple-dark/50"><Music size={32} className="text-brand-pink-light/70" /></AvatarFallback>
            </Avatar>
            <div className="flex flex-col justify-center">
              <h3 className="text-lg font-medium text-white leading-tight">{song.title}</h3>
              <div className="flex items-center space-x-2 mt-1">
                {song.youtubeUrl && song.channelId ? (
                  <Link href={`https://www.youtube.com/channel/${song.channelId}`} target="_blank" rel="noopener noreferrer" className="text-brand-purple-light hover:text-brand-pink-light hover:underline transition-colors text-sm">
                    {song.artist || 'Unknown Artist'}
                  </Link>
                ) : (
                  <p className="text-brand-purple-light text-sm">{song.artist || 'Unknown Artist'}</p>
                )}
                <span className="text-sm text-brand-purple-light/80 flex items-center">
                  <Clock className="inline-block mr-1 -mt-0.5" size={14} />
                  {formatDurationFromSeconds(song.durationSeconds ?? 0)}
                </span>
              </div>
              <div className="text-sm text-brand-purple-light/70 flex items-center flex-wrap gap-x-2 gap-y-1 mt-1.5">
                Requested by:
                <Avatar className="w-4 h-4 rounded-full inline-block border border-brand-purple-light/30">
                  <AvatarImage src={song.requesterAvatar ?? undefined} alt={song.requester} />
                  <AvatarFallback className="text-xs bg-brand-purple-dark">{song.requester.slice(0, 1)}</AvatarFallback>
                </Avatar>
                <Link href={`https://www.twitch.tv/${song.requesterLogin || song.requester.toLowerCase()}`} target="_blank" rel="noopener noreferrer" className="hover:text-brand-pink-light hover:underline transition-colors min-w-0 truncate">
                  <span>{song.requester}</span>
                </Link>
                {song.requestType === 'donation' && (
                  <Badge variant="secondary" className="px-1.5 py-0.5 text-xs bg-brand-purple-neon/80 text-brand-black font-semibold border-brand-purple-neon shadow-sm">
                    Dono
                  </Badge>
                )}
                {song.requestType === 'channelPoint' && (
                  <Badge variant="outline" className="px-1.5 py-0.5 text-xs bg-brand-pink-neon/80 text-brand-black font-semibold border-brand-pink-neon shadow-sm">
                    Points
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <div className="flex space-x-1">
            {song.youtubeUrl && (
              <a href={song.youtubeUrl} target="_blank" rel="noopener noreferrer" aria-label="Watch on YouTube">
                <Button variant="ghost" className="p-2 text-red-500 hover:text-red-400">
                  <Youtube className="h-6 w-6" />
                </Button>
              </a>
            )}
            
            {song.spotifyData && song.spotifyData.url && (
              <a href={String(song.spotifyData.url)} target="_blank" rel="noopener noreferrer" aria-label="Listen on Spotify">
                <Button variant="ghost" className="p-2 text-green-500 hover:text-green-400">
                  <SpotifyIcon className="h-5 w-5" />
                </Button>
              </a>
            )}
          </div>
        </motion.div>
      ) : (
        <p className="text-brand-purple-light/70 italic">No active song playing.</p>
      )}
    </div>
  )
}

function SongList({ 
  songs, 
  isHistory, 
  currentUser, 
  socket,
  setEditingSongId,
  setCurrentSpotifyUrl,
  setCurrentYouTubeUrl,
  setIsEditSongLinksDialogOpen,
  setEditSpotifyError,
  setEditSpotifySuccess,
  setEditYouTubeError,
  setEditYouTubeSuccess
}: { 
  songs: SongRequest[], 
  isHistory: boolean, 
  currentUser: { id?: string, login?: string } | null, 
  socket: Socket | null,
  setEditingSongId?: React.Dispatch<React.SetStateAction<string | null>>,
  setCurrentSpotifyUrl?: React.Dispatch<React.SetStateAction<string>>,
  setCurrentYouTubeUrl?: React.Dispatch<React.SetStateAction<string>>,
  setIsEditSongLinksDialogOpen?: React.Dispatch<React.SetStateAction<boolean>>,
  setEditSpotifyError?: React.Dispatch<React.SetStateAction<string | null>>,
  setEditSpotifySuccess?: React.Dispatch<React.SetStateAction<boolean>>,
  setEditYouTubeError?: React.Dispatch<React.SetStateAction<string | null>>,
  setEditYouTubeSuccess?: React.Dispatch<React.SetStateAction<boolean>>
}) {
  // Use the songs as provided without any additional sorting
  
  if (songs.length === 0) {
    // Message is handled in the parent TabsContent now
    return null;
  }

  const userLogin = currentUser?.login?.toLowerCase();

  return (
    <AnimatePresence>
      {songs.map((song, index) => {
        const isOwnRequest = !!userLogin && 
                             (song.requesterLogin?.toLowerCase() === userLogin || 
                              song.requester?.toLowerCase() === userLogin);
                             
        return (
          <motion.div
            key={song.id}
            layout // Animate layout changes (reordering)
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3, delay: index * 0.05 }} // Faster stagger
            className={cn(
              "mb-2 rounded-md", // Keep margin/rounding on outer div
              // Removed shadow from here
            )}
          >
            <div 
              className={cn(
                // Use flex-wrap to allow right content to drop below on mobile
                "flex flex-wrap sm:flex-nowrap items-center sm:space-x-3 p-3 rounded-md bg-brand-purple-dark/30 hover:bg-brand-purple-dark/50 transition-colors duration-200 border border-brand-purple-neon/10 hover:border-brand-purple-neon/30", 
                isOwnRequest && "shadow-glow-pink-sm"
              )}
            >
              {/* Left section (Index + Thumbnail) */}
              <div className="flex items-center space-x-3 flex-shrink-0">
                <div className={cn(`flex-shrink-0 font-semibold w-6 text-center`, isHistory ? 'text-brand-purple-light/50' : 'text-brand-purple-light/70')}
                >
                  {index + 1}
                </div>
                <div className="relative w-16 h-9 rounded-md overflow-hidden flex-shrink-0 border border-brand-purple-neon/10">
                  {song.thumbnailUrl ? (
                    <img 
                      src={song.thumbnailUrl}
                      alt={song.title || 'Song thumbnail'}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Avatar className="w-full h-full rounded-md bg-brand-purple-dark/50">
                      <AvatarFallback className="rounded-md bg-transparent flex items-center justify-center">
                        <Music size={24} className={`text-brand-purple-light/${isHistory ? '50' : '70'}`}/>
                      </AvatarFallback>
                    </Avatar>
                  )}
                </div>
              </div>

              {/* Middle section (Title, Artist, Duration, Requester) */}
              {/* On mobile (when wrapped), add some margin bottom */}
              <div className="flex-grow min-w-0 w-full sm:w-auto order-first sm:order-none mb-2 sm:mb-0">
                <p className={`font-medium truncate flex items-center gap-1 ${isHistory ? 'text-gray-400' : 'text-white'}`}>
                  {song.title || (song.youtubeUrl ? 'Untitled YouTube Video' : 'Untitled Song')}
                </p>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
                  {song.youtubeUrl && song.channelId ? (
                    <Link href={`https://www.youtube.com/channel/${song.channelId}`} target="_blank" rel="noopener noreferrer" className={`hover:text-brand-pink-light transition-colors group ${isHistory ? 'text-brand-purple-light/60' : 'text-brand-purple-light/80'}`}>
                      <Badge variant="outline" className={`text-xs font-normal cursor-pointer border-brand-purple-neon/20 group-hover:border-brand-pink-neon/40 group-hover:text-brand-pink-light transition-colors ${isHistory ? 'text-brand-purple-light/60' : 'text-brand-purple-light/80'}`}>
                        {song.artist || 'Unknown Artist'}
                      </Badge>
                    </Link>
                  ) : (
                    <Badge variant="outline" className={`text-xs font-normal border-brand-purple-neon/20 ${isHistory ? 'text-brand-purple-light/60' : 'text-brand-purple-light/80'}`}>
                      {song.artist || 'Unknown Artist'}
                    </Badge>
                  )}
                  <span className={cn(`text-xs flex items-center whitespace-nowrap`, isHistory ? 'text-brand-purple-light/50' : 'text-brand-purple-light/70')}
                  >
                    <Clock className="inline-block mr-1" size={12} />
                    {formatDurationFromSeconds(song.durationSeconds ?? 0)}
                  </span>
                  <div className={cn(`text-xs flex items-center gap-1 flex-wrap`, isHistory ? 'text-brand-purple-light/50' : 'text-brand-purple-light/70')}
                  >
                    <span className="whitespace-nowrap">by:</span>
                    <Avatar className="w-3 h-3 rounded-full inline-block border border-brand-purple-light/20">
                      <AvatarImage src={song.requesterAvatar ?? undefined} alt={song.requester} />
                      <AvatarFallback className="text-[8px] bg-brand-purple-dark">{song.requester.slice(0,1)}</AvatarFallback>
                    </Avatar>
                    <Link href={`https://www.twitch.tv/${song.requesterLogin || song.requester.toLowerCase()}`} target="_blank" rel="noopener noreferrer" className="hover:text-brand-pink-light hover:underline transition-colors min-w-0 truncate">
                      {song.requester}
                    </Link>
                    
                    {song.requestType === 'donation' && (
                       <Badge variant="secondary" className="px-1.5 py-0.5 text-xs bg-brand-purple-neon/80 text-brand-black font-semibold border-brand-purple-neon shadow-sm">
                        Dono
                      </Badge>
                    )}
                    {song.requestType === 'channelPoint' && (
                      <Badge variant="outline" className="px-1.5 py-0.5 text-xs bg-brand-pink-neon/80 text-brand-black font-semibold border-brand-pink-neon shadow-sm">
                        Points
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              {/* Right section (Buttons + Timestamp) */}
              {/* Takes full width on mobile, auto on sm+, aligns left on mobile, right on sm+ */}
              <div className="flex flex-col space-y-1 w-full sm:w-auto items-start sm:items-end flex-shrink-0">
                <div className="flex space-x-1 items-center">
                  {song.youtubeUrl && (
                    <a href={song.youtubeUrl} target="_blank" rel="noopener noreferrer" aria-label="Watch on YouTube">
                       <Button variant="ghost" className="p-1 text-red-500 hover:text-red-400 hover:bg-red-500/10 rounded-full transition-all">
                         <Youtube className="h-5 w-5" />
                      </Button>
                    </a>
                  )}
                  
                  {song.spotifyData && song.spotifyData.url && (
                    <a href={String(song.spotifyData.url)} target="_blank" rel="noopener noreferrer" aria-label="Listen on Spotify">
                      <Button variant="ghost" className="p-1 text-green-500 hover:text-green-400 hover:bg-green-500/10 rounded-full transition-all">
                         <SpotifyIcon className="h-5 w-5" />
                      </Button>
                    </a>
                  )}

                  {/* Edit Song Links button */}
                  {!isHistory && isOwnRequest && socket && 
                   setEditingSongId && setCurrentSpotifyUrl && setCurrentYouTubeUrl && setIsEditSongLinksDialogOpen && 
                   setEditSpotifyError && setEditSpotifySuccess && setEditYouTubeError && setEditYouTubeSuccess && (
                     <Button
                        variant="ghost"
                        size="icon"
                        className="text-brand-purple-light/60 hover:text-green-500 hover:bg-green-500/10 rounded-full transition-all"
                        onClick={() => {
                          if (socket && currentUser?.login) {
                            // Open the edit dialog and set the current song ID and URLs
                            setEditingSongId(song.id);
                            setCurrentSpotifyUrl(song.spotifyData?.url || '');
                            setCurrentYouTubeUrl(song.youtubeUrl || '');
                            setIsEditSongLinksDialogOpen(true);
                            setEditSpotifyError(null);
                            setEditSpotifySuccess(false);
                            setEditYouTubeError(null);
                            setEditYouTubeSuccess(false);
                          }
                        }}
                        title="Edit song links"
                      >
                        <Edit size={18} />
                   </Button>
                  )}

                  {/* Delete button (existing) */}
                  {!isHistory && isOwnRequest && socket && (
                   <Button
                      variant="ghost"
                      size="icon"
                      className="text-brand-purple-light/60 hover:text-red-500 hover:bg-red-500/10 rounded-full transition-all"
                      onClick={() => {
                        const currentLogin = currentUser?.login; // Assign after null check
                        if (socket && currentLogin) {
                          socket.emit(socketEvents.DELETE_MY_REQUEST, { 
                            requestId: song.id,
                            userLogin: currentLogin
                          });
                        }
                      }}
                      title="Delete my request"
                    >
                      <Trash2 size={18} />
                   </Button>
                  )}
                </div>
                
                <span className="text-xs text-brand-purple-light/50 whitespace-nowrap">
                   {isHistory ? 'Completed:' : 'Added:'} {formatTimestamp(song.timestamp)}
                </span>
              </div>
            </div>
          </motion.div>
        )
      })}
    </AnimatePresence>
  )
}

function AddToPlanDialog({ 
  isOpen, 
  onOpenChange, 
  currentUser, 
  socket, 
  onAddToRequestPlan 
}: { 
  isOpen: boolean; 
  onOpenChange: (open: boolean) => void; 
  currentUser: { id?: string, login?: string } | null;
  socket: Socket | null;
  onAddToRequestPlan: (song: Partial<PlannedRequest>) => void;
}) {
  // Use local state for the input
  const [inputValue, setInputValue] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset form when dialog opens
  useEffect(() => {
    if (isOpen) {
      setInputValue("");
      setError(null);
    }
  }, [isOpen]);

  // Focus the input when dialog opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!inputValue || !currentUser?.login || !socket) {
      setError("Please enter a song URL or search text");
      return;
    }
    
    setError(null);
    setIsAdding(true);
    
    // Emit to server to get song details
    socket.emit('getSongDetailsForPlan', inputValue, (error: any, details: any) => {
      setIsAdding(false);
      
      if (error) {
        console.error('Error fetching song details:', error);
        setError(error.error || "Failed to load song details. Please check your input.");
        return;
      }
      
      const newSong: Partial<PlannedRequest> = {
        youtubeUrl: details.youtubeUrl || null,
        title: details.title,
        artist: details.artist,
        channelId: details.channelId,
        duration: details.duration,
        durationSeconds: details.durationSeconds,
        thumbnailUrl: details.thumbnailUrl,
        spotifyData: details.spotifyData,
        sourceType: details.sourceType
      };
      
      onAddToRequestPlan(newSong);
      onOpenChange(false); // Close dialog on success
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button 
          variant="outline" 
          className="flex gap-2 bg-brand-pink-neon/10 hover:bg-brand-pink-neon/20 text-brand-pink-light border-brand-pink-neon/40 hover:shadow-glow-pink-sm transition-shadow"
        >
          <Plus size={16} />
          Add to Plan
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-brand-black/95 backdrop-blur border-brand-purple-neon/50 text-brand-purple-light">
        <DialogHeader>
          <DialogTitle className="text-brand-purple-light">Add to Request Plan</DialogTitle>
          <DialogDescription className="text-brand-purple-light/70">
            Enter a YouTube URL, Spotify URL, or simply type the artist and song name
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <Input 
            ref={inputRef}
            value={inputValue} 
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="YouTube URL, Spotify URL, or Artist - Song Title" 
            className="bg-brand-black/60 text-white border-brand-purple-neon/30 focus-visible:ring-brand-purple-neon/70 placeholder:text-brand-purple-light/50"
            autoComplete="off"
          />
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <DialogFooter>
            <Button
              type="submit"
              className="bg-brand-pink-neon hover:bg-brand-pink-dark text-brand-black font-semibold hover:shadow-glow-pink transition-all"
              disabled={isAdding || !inputValue}
            >
              {isAdding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              {isAdding ? "Adding..." : "Add to Plan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditSongLinksDialog({ 
  isOpen, 
  onOpenChange, 
  currentUser, 
  socket, 
  songId,
  initialSpotifyUrl,
  initialYouTubeUrl,
  spotifySuccess,
  spotifyError,
  youtubeSuccess,
  youtubeError,
  onReset 
}: { 
  isOpen: boolean; 
  onOpenChange: (open: boolean) => void; 
  currentUser: { id?: string, login?: string } | null;
  socket: Socket | null;
  songId: string | null;
  initialSpotifyUrl: string;
  initialYouTubeUrl: string;
  spotifySuccess: boolean;
  spotifyError: string | null;
  youtubeSuccess: boolean;
  youtubeError: string | null;
  onReset: () => void;
}) {
  // Use local state for the inputs
  const [spotifyInputValue, setSpotifyInputValue] = useState("");
  const [youtubeInputValue, setYoutubeInputValue] = useState("");
  const [isSubmittingSpotify, setIsSubmittingSpotify] = useState(false);
  const [isSubmittingYoutube, setIsSubmittingYoutube] = useState(false);
  const spotifyInputRef = useRef<HTMLInputElement>(null);
  const youtubeInputRef = useRef<HTMLInputElement>(null);

  // Reset form when dialog opens or initial URLs change
  useEffect(() => {
    if (isOpen) {
      setSpotifyInputValue(initialSpotifyUrl);
      setYoutubeInputValue(initialYouTubeUrl);
      setIsSubmittingSpotify(false);
      setIsSubmittingYoutube(false);
      onReset();
    }
  }, [isOpen, initialSpotifyUrl, initialYouTubeUrl, onReset]);

  // Focus the first input when dialog opens
  useEffect(() => {
    if (isOpen && spotifyInputRef.current) {
      setTimeout(() => {
        spotifyInputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  const handleSpotifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!spotifyInputValue || !currentUser?.login || !socket || !songId) {
      return;
    }
    
    setIsSubmittingSpotify(true);
    
    // Emit to server to update the Spotify link
    socket.emit(socketEvents.EDIT_MY_SONG_SPOTIFY, { 
      requestId: songId,
      spotifyUrl: spotifyInputValue,
      userLogin: currentUser.login
    });

    // Reset submitting state immediately after emitting.
    // Feedback (success/error) will come via props from parent.
    setIsSubmittingSpotify(false);
  };

  const handleYouTubeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!currentUser?.login || !socket || !songId) {
      return;
    }
    
    setIsSubmittingYoutube(true);
    
    // Emit to server to update the YouTube URL (allow empty to remove)
    socket.emit(socketEvents.EDIT_MY_SONG_YOUTUBE, { 
      requestId: songId,
      youtubeUrl: youtubeInputValue.trim(),
      userLogin: currentUser.login
    });

    // Reset submitting state immediately after emitting.
    // Feedback (success/error) will come via props from parent.
    setIsSubmittingYoutube(false);
  };

  const isAnySubmitting = isSubmittingSpotify || isSubmittingYoutube;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!isAnySubmitting) { // Only allow closing if not in the middle of submitting
        onOpenChange(open);
      }
    }}>
      <DialogContent className="bg-brand-black/95 backdrop-blur border-brand-purple-neon/50 text-brand-purple-light max-w-md">
        <DialogHeader>
          <DialogTitle className="text-brand-purple-light">Edit Song Links</DialogTitle>
          <DialogDescription className="text-brand-purple-light/70">
            Update the Spotify or YouTube links for your song request.
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex flex-col gap-6">
          {/* Spotify Section */}
          <form onSubmit={handleSpotifySubmit} className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <SpotifyIcon className="h-4 w-4" />
              <Label className="text-sm font-medium">Spotify Link</Label>
            </div>
            <Input 
              ref={spotifyInputRef}
              value={spotifyInputValue} 
              onChange={(e) => setSpotifyInputValue(e.target.value)}
              placeholder="https://open.spotify.com/track/..." 
              className="bg-brand-black/60 text-white border-brand-purple-neon/30 focus-visible:ring-brand-purple-neon/70 placeholder:text-brand-purple-light/50"
              autoComplete="off"
              disabled={isAnySubmitting || spotifySuccess}
            />
            {spotifyError && <p className="text-red-500 text-sm">{spotifyError}</p>}
            {spotifySuccess && <p className="text-green-500 text-sm">Spotify link updated successfully!</p>}
            <Button
              type="submit"
              className="bg-green-600 hover:bg-green-700 text-white font-semibold transition-all"
              disabled={isAnySubmitting || spotifySuccess || !spotifyInputValue || !spotifyInputValue.includes('spotify.com/track/')}
            >
              {isSubmittingSpotify ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <SpotifyIcon className="mr-2 h-4 w-4" />}
              {isSubmittingSpotify ? "Updating..." : spotifySuccess ? "Updated!" : "Update Spotify Link"}
            </Button>
          </form>

          <div className="border-t border-brand-purple-neon/20" />

          {/* YouTube Section */}
          <form onSubmit={handleYouTubeSubmit} className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
              </svg>
              <Label className="text-sm font-medium">YouTube Link</Label>
            </div>
            <Input 
              ref={youtubeInputRef}
              value={youtubeInputValue} 
              onChange={(e) => setYoutubeInputValue(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=... (leave empty to remove)" 
              className="bg-brand-black/60 text-white border-brand-purple-neon/30 focus-visible:ring-brand-purple-neon/70 placeholder:text-brand-purple-light/50"
              autoComplete="off"
              disabled={isAnySubmitting || youtubeSuccess}
            />
            {youtubeError && <p className="text-red-500 text-sm">{youtubeError}</p>}
            {youtubeSuccess && <p className="text-green-500 text-sm">YouTube link updated successfully!</p>}
            <Button
              type="submit"
              className="bg-red-600 hover:bg-red-700 text-white font-semibold transition-all"
              disabled={isAnySubmitting || youtubeSuccess}
            >
                             {isSubmittingYoutube ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>}
              {isSubmittingYoutube ? "Updating..." : youtubeSuccess ? "Updated!" : youtubeInputValue.trim() ? "Update YouTube Link" : "Remove YouTube Link"}
            </Button>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}