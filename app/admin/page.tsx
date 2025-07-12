"use client"

import { useState, useEffect, useCallback } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/use-toast"
import { Toaster } from "@/components/ui/toaster"
import { ConnectionStatus } from "@/components/ConnectionStatus"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Tabs, 
  TabsContent, 
  TabsList, 
  TabsTrigger
} from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { 
  LogOut, 
  Shield, 
  Music, 
  Play, 
  Pause, 
  SkipForward, 
  Trash2, 
  Clock, 
  Settings as SettingsIcon,
  Users, 
  List, 
  History,
  UserX,
  Ban,
  Star,
  AlertTriangle,
  Link as LinkIcon,
  BarChart2,
  Youtube,
  ChevronUp,
  ChevronDown,
  Loader2,
  X,
  GripVertical,
  Edit
} from "lucide-react"
import { 
  SongRequest, 
  AppState, 
  Settings, 
  BlacklistItem, 
  BlockedUser, 
  AllTimeStats, 
  SocketEvents
} from "@/lib/types" 
import { io, Socket } from "socket.io-client"
import Link from 'next/link'
import { StatisticsCard } from "@/components/StatisticsCard"
import { formatTimestamp, formatDuration, extractYouTubeId, SpotifyIcon, calculateTotalQueueDuration } from "@/lib/utils"
import { DragDropContext, Draggable, Droppable, DropResult } from '@hello-pangea/dnd'

interface TwitchUserDisplay {
  login: string
  display_name: string
  profile_image_url: string
  isAdmin: boolean
}

export default function AdminDashboard() {
  // State
  const [songUrl, setSongUrl] = useState("")
  const [requesterUsername, setRequesterUsername] = useState("")
  const [user, setUser] = useState<TwitchUserDisplay | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [appState, setAppState] = useState<AppState>({
    queue: [],
    history: [],
    activeSong: null,
    settings: { maxDuration: 10 },
    blacklist: [],
    blockedUsers: [],
    isLoading: true,
    error: null
  })
  const [socket, setSocket] = useState<Socket<SocketEvents> | null>(null)
  const [allTimeStats, setAllTimeStats] = useState<AllTimeStats | null>(null)
  const [isLoadingStats, setIsLoadingStats] = useState(true)
  const [newBlockUsername, setNewBlockUsername] = useState("")
  const [newBlacklistTerm, setNewBlacklistTerm] = useState("")
  const [newBlacklistType, setNewBlacklistType] = useState<BlacklistItem['type']>('keyword')
  const [requestType, setRequestType] = useState<'channelPoint' | 'donation'>('channelPoint')
  const [bypassRestrictions, setBypassRestrictions] = useState(false)
  const [isSpotifyLinkDialogOpen, setIsSpotifyLinkDialogOpen] = useState(false)
  const [editingRequestId, setEditingRequestId] = useState<string | null>(null)
  const [currentSpotifyLink, setCurrentSpotifyLink] = useState<string>("")
  const [spotifyLinkInput, setSpotifyLinkInput] = useState<string>("")
  const [currentYouTubeLink, setCurrentYouTubeLink] = useState<string>("")
  const [youTubeLinkInput, setYouTubeLinkInput] = useState<string>("")
  const [historyPage, setHistoryPage] = useState(1)
  const [isLoadingMoreHistory, setIsLoadingMoreHistory] = useState(false)
  const [hasMoreHistory, setHasMoreHistory] = useState(true)
  const [totalHistoryCount, setTotalHistoryCount] = useState(0)
  const [totalQueueCount, setTotalQueueCount] = useState(0)
  const [songsPlayedToday, setSongsPlayedToday] = useState(0)
  const [historyList, setHistoryList] = useState<SongRequest[]>([])
  const [isTimestampDialogOpen, setIsTimestampDialogOpen] = useState(false)
  const [editingTimestampId, setEditingTimestampId] = useState<string | null>(null)
  const [timestampInputValue, setTimestampInputValue] = useState<string>("")
  const { toast } = useToast()
  // Add state for admin history search
  const [adminHistorySearch, setAdminHistorySearch] = useState("");
  const [adminSearchResults, setAdminSearchResults] = useState<SongRequest[]>([]);
  const [isAdminSearching, setIsAdminSearching] = useState(false);
  const [adminSearchTotal, setAdminSearchTotal] = useState(0);
  const [adminSearchPage, setAdminSearchPage] = useState(1);
  const [isLoadingAdminSearch, setIsLoadingAdminSearch] = useState(false);
  const ADMIN_SEARCH_PAGE_SIZE = 20;
  // Add state for Clear Queue confirmation dialog
  const [isClearQueueDialogOpen, setIsClearQueueDialogOpen] = useState(false);
  // State for requester name replacement
  const [oldRequesterName, setOldRequesterName] = useState("");
  const [newRequesterName, setNewRequesterName] = useState("");
  const [isReplacingRequester, setIsReplacingRequester] = useState(false);
  // State for confirmation dialog and preview
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewEntries, setPreviewEntries] = useState<{ id: string; title: string; artist: string; completedAt: string }[]>([]);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Define closeSpotifyLinkDialog early so it can be used in useEffect
  const closeSpotifyLinkDialog = useCallback(() => {
    setIsSpotifyLinkDialogOpen(false);
    setEditingRequestId(null);
    setCurrentSpotifyLink("");
    setSpotifyLinkInput("");
    setCurrentYouTubeLink("");
    setYouTubeLinkInput("");
  }, []); // This callback has no external dependencies

  // Socket Connection and Event Listeners
  useEffect(() => {
    const socketHost = process.env.NEXT_PUBLIC_SOCKET_URL || '';
    let connectionAttempts = 0;
    
    const socketInstance: Socket<SocketEvents> = io(socketHost, {
      transports: ['polling', 'websocket'],
      path: '/socket.io/',
      timeout: 20000,
      forceNew: true,
      autoConnect: true,
      upgrade: true,
      reconnectionAttempts: 5
    });
    
    socketInstance.on('connect', () => {
      setIsConnected(true)
      console.log('Admin: Connected to Socket.IO server')

      // --- Authenticate admin socket connection --- 
      const cookies = document.cookie.split(';').reduce((acc, cookie) => {
        const [key, value] = cookie.trim().split('=');
        if (key) acc[key] = value;
        return acc;
      }, {} as Record<string, string>);
      
      // Try to get login from display cookie first (for better UX)
      const userDisplayJson = cookies['twitch_user_display'];
      let loginName = '';
      
      if (userDisplayJson) {
        try {
          const displayData = JSON.parse(decodeURIComponent(userDisplayJson));
          if (displayData && displayData.login) {
            loginName = displayData.login;
          }
        } catch (e) {
          console.error('Admin: Failed to parse user display cookie:', e);
        }
      }
      
      // For authentication, we need to check the auth cookie (sent by the client but can't be read by JS)
      // This is a security measure - we try to authenticate with the login name
      // The server will verify this against the ADMIN_USERNAMES environment variable
      if (loginName) {
        console.log(`Admin: Authenticating socket connection for user ${loginName}`);
        socketInstance.emit('authenticateAdmin', { login: loginName });
      } else {
        // Fallback to legacy cookie for backward compatibility
        const legacyUserJson = cookies['twitch_user'];
        if (legacyUserJson) {
          try {
            const userData = JSON.parse(decodeURIComponent(legacyUserJson));
            if (userData && userData.login) {
              console.log(`Admin: Authenticating socket connection with legacy cookie for user ${userData.login}`);
              socketInstance.emit('authenticateAdmin', { login: userData.login });
            }
          } catch (e) {
            console.error('Admin: Failed to parse legacy user cookie:', e);
          }
        } else {
          console.warn('Admin: No auth cookies found for socket authentication.');
        }
      }
      // --- END ---

      socketInstance.emit('getState')
      socketInstance.emit('getAllTimeStats')
      setIsLoadingStats(true)
    })
    
    socketInstance.on('disconnect', () => {
      setIsConnected(false)
      setAppState(prev => ({ ...prev, error: new Error('Disconnected') }))
      console.log('Admin: Disconnected from Socket.IO server')
    })

    socketInstance.on('initialState', (initialServerState: AppState) => {
      console.log('Admin: Received initial state:', initialServerState)
      setAppState(prev => ({
        ...prev,
        ...initialServerState,
        isLoading: false,
        error: null
      }))
      // --- Initialize local history state --- 
      setHistoryList(initialServerState.history || []);
      // --- END --- 
    })

    socketInstance.on('queueUpdate', (queue: SongRequest[]) => {
      console.log('Admin: Queue updated', queue)
      setAppState(prev => ({ ...prev, queue }))
    })

    socketInstance.on('activeSong', (song: SongRequest | null) => {
      console.log('Admin: Active song updated', song)
      setAppState(prev => ({ ...prev, activeSong: song }))
    })

    socketInstance.on('historyUpdate', (updatedRecentHistory: SongRequest[]) => {
      console.log('Admin: Received historyUpdate with', updatedRecentHistory.length, 'items');
      // Don't just replace historyList. Merge the update.
      setHistoryList(prevList => {
        // Create a Set of IDs from the incoming recent history for efficient lookup
        const recentHistoryIds = new Set(updatedRecentHistory.map(song => song.id));
        
        // Filter the *current* list, keeping only items NOT present in the incoming recent list
        const olderHistoryItems = prevList.filter(song => !recentHistoryIds.has(song.id));
        
        // Combine the new recent history with the filtered older items
        const mergedList = [...updatedRecentHistory, ...olderHistoryItems];
        
        // Optional but safe: Sort the merged list by displayOrder again 
        // (Theoretically, prepend should be okay, but this guarantees)
        // mergedList.sort((a, b) => (b.displayOrder ?? 0) - (a.displayOrder ?? 0));
        
        console.log(`Admin: Merged historyList. Old length: ${prevList.length}, New length: ${mergedList.length}`);
        return mergedList;
      });
      // Also update the main appState.history, which might be used elsewhere (e.g., stats)
      // If appState.history is *only* ever meant to hold the recent items, keep this line.
      // If it should mirror the full list, update it like historyList.
      setAppState(prev => ({ ...prev, history: updatedRecentHistory })); 
    })
    
    socketInstance.on('songFinished', (finishedSong: SongRequest) => {
      console.log('Admin: Song finished', finishedSong)
      // The server will also send historyUpdate so we don't need to update history directly here
      toast({ 
        title: "Song Completed", 
        description: `"${finishedSong.title}" has been logged to history.`,
        duration: 3000
      })
    })
    
    socketInstance.on('settingsUpdate', (settings: Settings) => {
      console.log('Admin: Settings updated', settings)
      setAppState(prev => ({ ...prev, settings }))
    })

    socketInstance.on('blacklistUpdate', (blacklist: BlacklistItem[]) => {
      console.log('Admin: Blacklist updated', blacklist)
      setAppState(prev => ({ ...prev, blacklist }))
    })

    socketInstance.on('blockedUsersUpdate', (blockedUsers: BlockedUser[]) => {
      console.log('Admin: Blocked users updated', blockedUsers)
      setAppState(prev => ({ ...prev, blockedUsers }))
    })
    
    socketInstance.on('allTimeStatsUpdate', (stats: AllTimeStats) => {
        console.log('Admin: Received all-time stats', stats)
        setAllTimeStats(stats)
        setIsLoadingStats(false)
    })

    socketInstance.on('allTimeStatsError', (error: { message: string }) => {
        console.error('Admin: Failed to load all-time stats:', error.message)
        setIsLoadingStats(false)
        toast({ 
          title: "Stats Error", 
          description: "Could not load all-time statistics." 
        })
    })

    socketInstance.on('connect_error', (error) => {
      console.error('Admin: Socket connection error:', error)
      connectionAttempts++;
      
      // If first attempt fails, try with websocket only
      if (connectionAttempts === 1) {
        console.log('Admin: First connection attempt failed, trying with websocket only...')
        socketInstance.io.opts.transports = ['websocket']
      }
    })
    
    // --- Listen for auth confirmation/failure (Optional) ---
    socketInstance.on('adminAuthenticated', () => {
        console.log('[Auth] Socket connection successfully authenticated by server.');
        toast({ title: "Admin Session Active", description: "Backend connection secured.", duration: 2000 });
    });
    /* // Optional: Handle auth failure explicitly if needed
    socketInstance.on('adminAuthFailed', () => {
        console.error('[Auth] Server rejected socket authentication.');
        toast({ title: "Admin Auth Failed", description: "Backend rejected connection auth. Admin actions may fail.", variant: "destructive" });
        // Potentially disconnect or disable admin controls here
    });
    */
    // --- END ---

    // Listen for Spotify update results
    // Define listener handlers within useEffect
    const handleSpotifySuccess = ({ requestId }: { requestId: string }) => {
      console.log(`Admin: Successfully updated Spotify link for ${requestId}`);
      toast({
        title: "Spotify Link Updated",
        description: `Successfully updated Spotify link for request ${requestId.substring(0, 8)}...`,
      });
      // Close dialog if it was open for this request
      // Use editingRequestId from state directly here
      // Note: This check might be slightly delayed if state update isn't immediate
      // A better approach might be to pass editingRequestId to the handler if possible,
      // but this check inside works for most cases.
      closeSpotifyLinkDialog(); // Call the memoized close function
    };

    const handleSpotifyError = ({ requestId, message }: { requestId: string; message: string }) => {
      console.error(`Admin: Error updating Spotify link for ${requestId}: ${message}`);
      toast({
        title: "Spotify Update Error",
        description: message || "An unknown error occurred.",
      });
      // Optionally close dialog on error too
      // closeSpotifyLinkDialog();
    };

    const handleRemoveSpotifySuccess = ({ requestId, source }: { requestId: string; source: string }) => {
      console.log(`Admin: Successfully removed Spotify data for ${requestId} from ${source}`);
      toast({
        title: "Spotify Data Removed",
        description: `Successfully removed Spotify data from ${source}.`,
      });
    };

    const handleRemoveSpotifyError = ({ requestId, message }: { requestId: string; message: string }) => {
      console.error(`Admin: Error removing Spotify data for ${requestId}: ${message}`);
      toast({
        title: "Remove Spotify Error",
        description: message || "An unknown error occurred.",
      });
    };

    const handleYouTubeSuccess = ({ requestId }: { requestId: string }) => {
      console.log(`Admin: Successfully updated YouTube URL for ${requestId}`);
      toast({
        title: "YouTube URL Updated",
        description: `Successfully updated YouTube URL for request ${requestId.substring(0, 8)}...`,
      });
      closeSpotifyLinkDialog(); // Close the dialog since it's shared
    };

    const handleYouTubeError = ({ requestId, message }: { requestId: string; message: string }) => {
      console.error(`Admin: Error updating YouTube URL for ${requestId}: ${message}`);
      toast({
        title: "YouTube Update Error",
        description: message || "An unknown error occurred.",
      });
    };

    socketInstance.on('updateSpotifySuccess', handleSpotifySuccess);
    socketInstance.on('updateSpotifyError', handleSpotifyError);
    socketInstance.on('updateYouTubeSuccess', handleYouTubeSuccess);
    socketInstance.on('updateYouTubeError', handleYouTubeError);
    socketInstance.on('removeSpotifySuccess', handleRemoveSpotifySuccess);
    socketInstance.on('removeSpotifyError', handleRemoveSpotifyError);

    // Add listener for moreHistoryData event
    socketInstance.on('moreHistoryData', (historyChunk: SongRequest[]) => {
      console.log('Admin: Received more history data:', historyChunk);
      
      if (historyChunk.length === 0) {
        // No more history to load
        setHasMoreHistory(false);
      } else {
        setHistoryList(prevList => [...prevList, ...historyChunk]);
        
        // Increment the page counter
        setHistoryPage(prevPage => prevPage + 1);
      }
      
      setIsLoadingMoreHistory(false);
    });

    // Listen for total count updates
    socketInstance.on('totalCountsUpdate', (counts: { history: number; queue: number }) => {
      console.log('Admin: Received total counts:', counts);
      setTotalHistoryCount(counts.history);
      setTotalQueueCount(counts.queue);
    });

    // Listen for today's count update
    socketInstance.on('todaysCountUpdate', (data: { count: number }) => {
      console.log('Admin: Received today\'s count:', data);
      setSongsPlayedToday(data.count);
    });

    setSocket(socketInstance)

    return () => {
      console.log('Admin: Cleaning up socket connection')
      socketInstance.off('connect');
      socketInstance.off('disconnect');
      socketInstance.off('initialState');
      socketInstance.off('queueUpdate');
      socketInstance.off('activeSong');
      socketInstance.off('historyUpdate');
      socketInstance.off('songFinished');
      socketInstance.off('settingsUpdate');
      socketInstance.off('blacklistUpdate');
      socketInstance.off('blockedUsersUpdate');
      socketInstance.off('allTimeStatsUpdate');
      socketInstance.off('allTimeStatsError');
      socketInstance.off('connect_error');
      socketInstance.off('adminAuthenticated');
      // Clean up new listeners
      socketInstance.off('updateSpotifySuccess', handleSpotifySuccess);
      socketInstance.off('updateSpotifyError', handleSpotifyError);
      socketInstance.off('updateYouTubeSuccess', handleYouTubeSuccess);
      socketInstance.off('updateYouTubeError', handleYouTubeError);
      socketInstance.off('removeSpotifySuccess', handleRemoveSpotifySuccess);
      socketInstance.off('removeSpotifyError', handleRemoveSpotifyError);
      socketInstance.off('moreHistoryData');
      // Clean up count listeners
      socketInstance.off('totalCountsUpdate');
      socketInstance.off('todaysCountUpdate');
      socketInstance.disconnect()
    }
  }, [toast, closeSpotifyLinkDialog])

  // Load user from cookie
  useEffect(() => {
    const cookies = document.cookie.split(';').reduce((acc, cookie) => {
      const [key, value] = cookie.trim().split('=')
      acc[key] = value
      return acc
    }, {} as Record<string, string>)
    
    const userDisplayJson = cookies['twitch_user_display']
    if (userDisplayJson) {
      try {
        const decoded = decodeURIComponent(userDisplayJson)
        const userData = JSON.parse(decoded)
        setUser(userData) // This now matches the state type
      } catch (e) {
        console.error('Failed to parse user display cookie in admin page:', e)
        setUser(null)
      }
    } else {
      const legacyUserJson = cookies['twitch_user'];
      if (legacyUserJson) {
          try {
            const decoded = decodeURIComponent(legacyUserJson);
            const userData = JSON.parse(decoded);
            // Adapt legacy data to the new state structure
            setUser({ 
                login: userData.login, 
                display_name: userData.display_name, 
                profile_image_url: userData.profile_image_url,
                isAdmin: userData.isAdmin
            }); // This also matches the state type
          } catch (e) {
            console.error('Failed to parse legacy user cookie in admin page:', e);
            setUser(null);
          }
      } else {
        setUser(null)
      }
    }
  }, [])

  // Effect: When adminHistorySearch changes, trigger backend search or reset
  useEffect(() => {
    if (!socket) return;
    if (adminHistorySearch.trim() === "") {
      setIsAdminSearching(false);
      setAdminSearchResults([]);
      setAdminSearchTotal(0);
      setAdminSearchPage(1);
      return;
    }
    setIsAdminSearching(true);
    setIsLoadingAdminSearch(true);
    setAdminSearchPage(1);
    (socket as any).emit('searchHistory', { query: adminHistorySearch, limit: ADMIN_SEARCH_PAGE_SIZE, offset: 0 }, (res: any) => {
      if (res && !res.error) {
        setAdminSearchResults(res.results || []);
        setAdminSearchTotal(res.total || 0);
      } else {
        setAdminSearchResults([]);
        setAdminSearchTotal(0);
      }
      setIsLoadingAdminSearch(false);
    });
  }, [adminHistorySearch, socket]);

  // Function to load more admin search results
  const loadMoreAdminSearchResults = () => {
    if (!socket || isLoadingAdminSearch) return;
    setIsLoadingAdminSearch(true);
    const nextOffset = adminSearchPage * ADMIN_SEARCH_PAGE_SIZE;
    (socket as any).emit('searchHistory', { query: adminHistorySearch, limit: ADMIN_SEARCH_PAGE_SIZE, offset: nextOffset }, (res: any) => {
      if (res && !res.error) {
        setAdminSearchResults(prev => [...prev, ...(res.results || [])]);
        setAdminSearchTotal(res.total || 0);
        setAdminSearchPage(prev => prev + 1);
      }
      setIsLoadingAdminSearch(false);
    });
  };

  // Handlers
  const handlePlaySong = (song: SongRequest) => {
    if (!socket) return
    console.log(`Admin: Setting active song ${song.id}`)
    socket.emit('updateActiveSong', song) 
    toast({ title: "Song Selected", description: `Now active: ${song.title}` })
  }

  const handleSkipSong = () => {
    if (!socket || !appState.activeSong) return
    const skippedSong = appState.activeSong
    console.log(`Admin: Skipping song ${skippedSong.id} - ${skippedSong.title}`)
    socket.emit('skipSong')
    toast({ title: "Song Skipped", description: `Attempting to skip: ${skippedSong.title}` })
  }
  
  const handleMarkAsFinished = () => {
    if (!socket || !appState.activeSong) return
    const finishedSong = appState.activeSong
    console.log(`Admin: Marking song ${finishedSong.id} as finished`)
    socket.emit('markSongAsFinished', finishedSong)
    toast({ title: "Song Completed", description: `"${finishedSong.title}" moved to history.` })
  }

  const handleReturnToQueue = (song: SongRequest) => {
    if (!socket) return
    console.log(`Admin: Returning song ${song.id} to queue`)
    socket.emit('returnToQueue', song)
    toast({ 
      title: "Song Requeued", 
      description: `"${song.title}" has been moved to the top of the queue.` 
    })
  }

  const handleRemoveSong = (id: string) => {
    if (!socket) return
    const songToRemove = appState.queue.find(song => song.id === id)
    console.log(`Admin: Removing song ${id}`)
    socket.emit('removeSong', id)
    if (songToRemove) {
        toast({ title: "Song Removed", description: `Removed: ${songToRemove.title}` })
    }
  }

  const handleRemoveSpotifyData = (requestId: string, source: 'queue' | 'history' | 'activeSong') => {
    if (!socket) {
      console.log('Admin: No socket connection available')
      return
    }
    console.log(`Admin: Removing Spotify data for ${requestId} from ${source}`)
    console.log('Admin: Socket connected:', socket.connected)
    socket.emit('adminRemoveSpotifyData', { requestId, source })
    
    // Add a small loading indicator
    toast({
      title: "Removing Spotify Data...",
      description: `Removing Spotify data from ${source}`,
    })
  }

  const handleClearQueue = () => {
    if (!socket) return
    console.log("Admin: Clearing queue")
    socket.emit('clearQueue')
    toast({ title: "Queue Cleared" })
  }

  const handleResetTodaysCount = () => {
    if (!socket) return
    console.log("Admin: Resetting today's count")
    socket.emit('resetTodaysCount')
    toast({ title: "Today's Count Reset", description: "Songs played today counter has been reset to 0." })
  }

  const handleMove = (songId: string, direction: 'up' | 'down') => {
      if (!socket) return
      const currentIndex = appState.queue.findIndex(song => song.id === songId)
      if (currentIndex === -1) return

      const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1

      if (newIndex < 0 || newIndex >= appState.queue.length) return

      const newQueue = [...appState.queue]
      const [movedSong] = newQueue.splice(currentIndex, 1)
      newQueue.splice(newIndex, 0, movedSong)

      console.log(`Admin: Moving song ${songId} ${direction}`)
      socket.emit('updateQueue', newQueue) 
      toast({ title: `Song Moved ${direction === 'up' ? 'Up' : 'Down'}`, description: `Moved: ${movedSong.title}` })
  }

  const handleDragEnd = (result: DropResult) => {
    const { destination, source } = result;
    
    // If dropped outside the list or no change in position
    if (!destination || destination.index === source.index) {
      return;
    }
    
    // Check if socket exists
    if (!socket) return;
    
    // Create a new copy of the queue
    const newQueue = [...appState.queue];
    
    // Remove the dragged item from its original position
    const [movedSong] = newQueue.splice(source.index, 1);
    
    // Insert the dragged item at the new position
    newQueue.splice(destination.index, 0, movedSong);
    
    // Update the queue through socket.io
    console.log(`Admin: Reordering queue via drag and drop`);
    socket.emit('updateQueue', newQueue);
    toast({ 
      title: "Queue Reordered", 
      description: `Moved: ${movedSong.title}` 
    });
  };

  const handleMoveUp = (songId: string) => handleMove(songId, 'up')
  const handleMoveDown = (songId: string) => handleMove(songId, 'down')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const finalRequesterUsername = requesterUsername.trim() === "" ? "CalaMariGold" : requesterUsername.trim()

    if (!socket || !songUrl || !finalRequesterUsername) {
        toast({ title: "Missing Information", description: "Please provide a valid YouTube or Spotify Track URL and requester name." });
        return
    }

    // Basic client-side check for URL type
    let requestYoutubeUrl: string | undefined = undefined;
    let requestMessage: string | undefined = undefined;
    const trimmedUrl = songUrl.trim();

    if (trimmedUrl.includes("youtube.com/") || trimmedUrl.includes("youtu.be/")) {
        requestYoutubeUrl = trimmedUrl;
        console.log("Admin: Detected YouTube URL");
    } else if (trimmedUrl.includes("open.spotify.com/") && trimmedUrl.includes("track/")) {
        // This will match both standard and international Spotify links
        requestMessage = trimmedUrl; // Send Spotify URL in the message field
        console.log("Admin: Detected Spotify URL");
    } else {
        toast({ title: "Invalid URL", description: "Please enter a valid YouTube or Spotify Track URL." });
        return;
    }

    const songRequestData = {
        youtubeUrl: requestYoutubeUrl, // Now string | undefined
        message: requestMessage,     // Now string | undefined
        requester: finalRequesterUsername,
        requestType: requestType,
        donationInfo: requestType === 'donation' ? { amount: 5, currency: 'USD' } : undefined,
        source: 'admin',
        bypassRestrictions: bypassRestrictions
    }

    console.log("Admin: Manually adding song:", songRequestData)
    // Adjusted type assertion to better match potential backend expectation (optional fields)
    socket.emit('addSong', songRequestData as Partial<SongRequest> & { requester: string; youtubeUrl?: string; message?: string })

    toast({ title: "Song Submitted", description: `Attempting to add: ${trimmedUrl}` })
    setSongUrl("") // Clear the renamed state
    setRequesterUsername("")
  }

  const handleBlockUser = (e: React.FormEvent) => {
    e.preventDefault()
    if (!socket || !newBlockUsername) return

    if (appState.blockedUsers.some(u => u.username.toLowerCase() === newBlockUsername.toLowerCase())) {
        toast({ 
          title: "Already Blocked", 
          description: `${newBlockUsername} is already blocked.` 
        })
        return
    }

    const newUser: Omit<BlockedUser, 'id' | 'addedAt'> = { 
      username: newBlockUsername.trim() 
    }
    
    const updatedBlockedUsers = [...appState.blockedUsers, newUser as BlockedUser]

    console.log("Admin: Blocking user:", newUser.username)
    socket.emit('updateBlockedUsers', updatedBlockedUsers) 

    toast({ title: "User Blocked", description: `Blocked: ${newUser.username}` })
    setNewBlockUsername("")
  }

  const handleUnblockUser = (usernameToUnblock: string) => {
    if (!socket) return

    const updatedBlockedUsers = appState.blockedUsers.filter(
      user => user.username.toLowerCase() !== usernameToUnblock.toLowerCase()
    )

    console.log("Admin: Unblocking user:", usernameToUnblock)
    socket.emit('updateBlockedUsers', updatedBlockedUsers)

    toast({ title: "User Unblocked", description: `Unblocked: ${usernameToUnblock}` })
  }

  const handleAddToBlacklist = (e: React.FormEvent) => {
    e.preventDefault()
    if (!socket || !newBlacklistTerm) return

    if (appState.blacklist.some(item => item.term.toLowerCase() === newBlacklistTerm.toLowerCase() && item.type === newBlacklistType)) {
        toast({ 
          title: "Already Blacklisted", 
          description: `\"${newBlacklistTerm}\" (${newBlacklistType}) is already blacklisted.` 
        })
        return
    }

    const newItem: Omit<BlacklistItem, 'id' | 'addedAt'> = {
        term: newBlacklistTerm.trim(),
        type: newBlacklistType
    }
    
    const updatedBlacklist = [...appState.blacklist, newItem as BlacklistItem]

    console.log("Admin: Adding to blacklist:", newItem)
    socket.emit('updateBlacklist', updatedBlacklist)

    toast({ title: "Added to Blacklist", description: `Added: "${newItem.term}" (${newItem.type})` })
    setNewBlacklistTerm("")
  }

  const handleRemoveFromBlacklist = (termToRemove: string, typeToRemove: BlacklistItem['type']) => {
    if (!socket) return

    const updatedBlacklist = appState.blacklist.filter(
        item => !(item.term.toLowerCase() === termToRemove.toLowerCase() && item.type === typeToRemove)
    )

    console.log("Admin: Removing from blacklist:", termToRemove, typeToRemove)
    socket.emit('updateBlacklist', updatedBlacklist)

    toast({ title: "Removed from Blacklist", description: `Removed: "${termToRemove}" (${typeToRemove})` })
  }

  const handleLogout = () => {
    document.cookie = 'twitch_user=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
    setUser(null)
    window.location.href = '/'
    toast({ title: "Logged Out" })
  }

  const handleRemoveFromHistory = (id: string) => {
    if (!socket) return;
    
    const songToRemove = historyList.find(song => song.id === id); // Find song in the local list

    console.log(`Admin: Requesting removal of history item ${id}`);
    socket.emit('deleteHistoryItem', id);

    // Optimistically remove the item from the local state
    setHistoryList(prevList => prevList.filter(song => song.id !== id));

    // Show toast confirming the action initiated
    toast({ 
        title: "History Item Removed", 
        description: `Removed: ${songToRemove?.title || 'Item'}.`, 
        duration: 2000 
    });
  }

  const handleEditTimestamp = (song: SongRequest) => {
    setEditingTimestampId(song.id)
    // Convert to datetime-local format (YYYY-MM-DDTHH:mm)
    if (song.timestamp) {
      const date = new Date(song.timestamp)
      const localDateTime = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16)
      setTimestampInputValue(localDateTime)
    } else {
      // Default to current time if no timestamp
      const now = new Date()
      const localDateTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16)
      setTimestampInputValue(localDateTime)
    }
    setIsTimestampDialogOpen(true)
  }

  const handleSaveTimestamp = () => {
    if (!socket || !editingTimestampId || !timestampInputValue) {
      return
    }

    // Convert datetime-local back to ISO string
    const isoTimestamp = new Date(timestampInputValue).toISOString()
    
    socket.emit('updateHistoryTimestamp', {
      id: editingTimestampId,
      timestamp: isoTimestamp
    })

    // Close dialog and reset state
    setIsTimestampDialogOpen(false)
    setEditingTimestampId(null)
    setTimestampInputValue("")

    toast({
      title: "Timestamp Updated",
      description: "Song timestamp has been updated successfully.",
    })
  }

  const handleCancelTimestampEdit = () => {
    setIsTimestampDialogOpen(false)
    setEditingTimestampId(null)
    setTimestampInputValue("")
  }

  // Calculate total queue duration
  const { formatted: totalQueueDurationFormatted } = calculateTotalQueueDuration(appState.queue)

  // Spotify Link Dialog Handlers
  const openSpotifyLinkDialog = useCallback((request: SongRequest) => {
    setEditingRequestId(request.id);
    const initialSpotifyLink = request.spotifyData?.url ?? "";
    const initialYouTubeLink = request.youtubeUrl ?? "";
    setCurrentSpotifyLink(initialSpotifyLink);
    setSpotifyLinkInput(initialSpotifyLink);
    setCurrentYouTubeLink(initialYouTubeLink);
    setYouTubeLinkInput(initialYouTubeLink);
    setIsSpotifyLinkDialogOpen(true);
  }, []); // No dependencies needed here

  // handleSpotifyLinkSave uses state (socket, editingRequestId, spotifyLinkInput) and props (toast)
  const handleSpotifyLinkSave = useCallback(() => {
    if (socket && editingRequestId && spotifyLinkInput.trim()) {
      console.log(`Admin: Emitting adminUpdateSpotifyLink for ${editingRequestId} with URL: ${spotifyLinkInput}`);
      const payload: { requestId: string; spotifyUrl: string } = { 
        requestId: editingRequestId, 
        spotifyUrl: spotifyLinkInput.trim() 
      };
      socket.emit('adminUpdateSpotifyLink', payload);
    } else if (!spotifyLinkInput.trim()) {
       toast({
          title: "Input Error",
          description: "Spotify link cannot be empty.",
       });
    }
  // Add necessary dependencies: socket, editingRequestId, spotifyLinkInput, toast
  }, [socket, editingRequestId, spotifyLinkInput, toast]);

  // handleYouTubeLinkSave for updating YouTube URLs
  const handleYouTubeLinkSave = useCallback(() => {
    if (socket && editingRequestId) {
      console.log(`Admin: Emitting adminUpdateYouTubeUrl for ${editingRequestId} with URL: ${youTubeLinkInput}`);
      const payload: { requestId: string; youtubeUrl: string } = { 
        requestId: editingRequestId, 
        youtubeUrl: youTubeLinkInput.trim() 
      };
      socket.emit('adminUpdateYouTubeUrl', payload);
    }
  }, [socket, editingRequestId, youTubeLinkInput]); 

 

  // Add function to load more history
  const loadMoreHistory = useCallback(() => {
    if (!socket || isLoadingMoreHistory || !hasMoreHistory) return;
    
    setIsLoadingMoreHistory(true);
    
    const pageSize = 20;
    const offset = historyPage * pageSize;
    
    console.log(`Admin: Requesting more history (offset: ${offset}, limit: ${pageSize})`);
    socket.emit('getMoreHistory', { offset, limit: pageSize });
  }, [socket, historyPage, isLoadingMoreHistory, hasMoreHistory]);

  // Add this handler inside AdminDashboard
  const handleMakeMarisChoice = (songId: string) => {
    if (!socket) return;
    // Find the song in the queue
    const songIndex = appState.queue.findIndex(song => song.id === songId);
    if (songIndex === -1) return;
    // Create a new song object with the template fields
    const newSong = {
      ...appState.queue[songIndex],
      title: "Mari's Choice",
      artist: "?????",
      youtubeUrl: undefined,
      spotifyData: undefined,
      thumbnailUrl: undefined,
      channelId: undefined,
    };
    // Replace the song in the queue
    const newQueue = [...appState.queue];
    newQueue[songIndex] = newSong;
    socket.emit('updateQueue', newQueue);
    toast({ title: "Converted to Mari's Choice", description: `Song #${songIndex + 1} is now a Mari's Choice template.` });
  };

  // Handler for replacing requester name in history
  const handleReplaceRequesterName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!socket || !oldRequesterName.trim() || !newRequesterName.trim()) {
      toast({ title: "Error", description: "Both old and new names are required." });
      return;
    }
    setIsReplacingRequester(true);
    (socket as any).emit(
      "replaceRequesterNameInHistory",
      { oldName: oldRequesterName.trim(), newName: newRequesterName.trim() },
      (result: { success: boolean; updatedCount?: number; message?: string }) => {
        setIsReplacingRequester(false);
        if (result && result.success) {
          toast({
            title: "Requester Name Updated",
            description: `Replaced ${result.updatedCount} entr${result.updatedCount === 1 ? "y" : "ies"} in history.`,
            duration: 4000,
          });
          setOldRequesterName("");
          setNewRequesterName("");
        } else {
          toast({
            title: "Error",
            description: result?.message || "Failed to update requester name.",
          });
        }
      }
    );
  };

  // Handler for preview and dialog open
  const handlePreviewRequesterName = async (e: React.FormEvent) => {
    e.preventDefault();
    setPreviewError(null);
    setPreviewEntries([]);
    if (!socket || !oldRequesterName.trim() || !newRequesterName.trim()) {
      toast({ title: "Error", description: "Both old and new names are required." });
      return;
    }
    setPreviewLoading(true);
    (socket as any).emit(
      "previewRequesterNameReplacement",
      { oldName: oldRequesterName.trim() },
      (result: { success: boolean; entries?: any[]; message?: string }) => {
        setPreviewLoading(false);
        if (result && result.success) {
          setPreviewEntries(result.entries || []);
          setIsConfirmDialogOpen(true);
        } else {
          setPreviewError(result?.message || "Failed to fetch preview.");
        }
      }
    );
  };

  // Handler for actual replacement (after confirmation)
  const handleConfirmReplaceRequesterName = async () => {
    if (!socket || !oldRequesterName.trim() || !newRequesterName.trim()) {
      toast({ title: "Error", description: "Both old and new names are required." });
      return;
    }
    setIsReplacingRequester(true);
    (socket as any).emit(
      "replaceRequesterNameInHistory",
      { oldName: oldRequesterName.trim(), newName: newRequesterName.trim() },
      (result: { success: boolean; updatedCount?: number; message?: string }) => {
        setIsReplacingRequester(false);
        setIsConfirmDialogOpen(false);
        if (result && result.success) {
          toast({
            title: "Requester Name Updated",
            description: `Replaced ${result.updatedCount} entr${result.updatedCount === 1 ? "y" : "ies"} in history.`,
            duration: 4000,
          });
          setOldRequesterName("");
          setNewRequesterName("");
          setPreviewEntries([]);
        } else {
          toast({
            title: "Error",
            description: result?.message || "Failed to update requester name.",
          });
        }
      }
    );
  };

  // Render Logic
  if (appState.isLoading && !socket) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900 text-white">
        <Loader2 className="w-16 h-16 animate-spin" />
        <span className="ml-4 text-xl">Connecting to Server...</span>
      </div>
    )
  }

  // Main Admin Panel JSX
  return (
    <div className="min-h-screen bg-gray-900 text-white p-6 rounded-lg shadow-xl max-w-7xl mx-auto">
      <Toaster />
      
      {/* Link Edit Dialog */}
      <Dialog open={isSpotifyLinkDialogOpen} onOpenChange={setIsSpotifyLinkDialogOpen}>
        <DialogContent className="sm:max-w-[500px] bg-gray-850 border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle>Edit Song Links</DialogTitle>
            <DialogDescription className="text-gray-400">
              Update the Spotify or YouTube URLs for this request. Spotify URLs will fetch and update the associated data.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="spotify-link" className="text-right">
                Spotify URL
              </Label>
              <Input
                id="spotify-link"
                value={spotifyLinkInput}
                onChange={(e) => setSpotifyLinkInput(e.target.value)}
                className="col-span-3 bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:border-purple-500 focus:ring-purple-500"
                placeholder="https://open.spotify.com/track/..."
              />
            </div>
            {currentSpotifyLink && (
               <p className="text-xs text-muted-foreground col-span-4 px-3">
                 Current Spotify: <a href={currentSpotifyLink} target="_blank" rel="noopener noreferrer" className="underline hover:text-purple-300">{currentSpotifyLink}</a>
               </p>
            )}
            
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="youtube-link" className="text-right">
                YouTube URL
              </Label>
              <Input
                id="youtube-link"
                value={youTubeLinkInput}
                onChange={(e) => setYouTubeLinkInput(e.target.value)}
                className="col-span-3 bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:border-red-500 focus:ring-red-500"
                placeholder="https://www.youtube.com/watch?v=..."
              />
            </div>
            {currentYouTubeLink && (
               <p className="text-xs text-muted-foreground col-span-4 px-3">
                 Current YouTube: <a href={currentYouTubeLink} target="_blank" rel="noopener noreferrer" className="underline hover:text-red-300">{currentYouTubeLink}</a>
               </p>
            )}
          </div>
          <DialogFooter className="bg-gray-850 flex-col sm:flex-row gap-2">
             <Button type="button" variant="outline" onClick={closeSpotifyLinkDialog}>Cancel</Button>
             <Button 
               type="button" 
               onClick={handleYouTubeLinkSave} 
               disabled={!isConnected} 
               className="bg-red-600 hover:bg-red-700"
             >
               Update YouTube URL
             </Button>
             <Button 
               type="button" 
               onClick={handleSpotifyLinkSave} 
               disabled={!isConnected || !spotifyLinkInput.trim()} 
               className="bg-purple-600 hover:bg-purple-700"
             >
               Update Spotify URL
             </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Timestamp Edit Dialog */}
      <Dialog open={isTimestampDialogOpen} onOpenChange={setIsTimestampDialogOpen}>
        <DialogContent className="sm:max-w-[400px] bg-gray-850 border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle>Edit Song Timestamp</DialogTitle>
            <DialogDescription className="text-gray-400">
              Change the completion time of this song. This will affect the ordering in the history.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="timestamp-input" className="text-right">
                Date & Time
              </Label>
              <Input
                id="timestamp-input"
                type="datetime-local"
                value={timestampInputValue}
                onChange={(e) => setTimestampInputValue(e.target.value)}
                className="col-span-3 bg-gray-700 border-gray-600 text-white focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
          </div>
          <DialogFooter className="bg-gray-850">
             <Button type="button" variant="outline" onClick={handleCancelTimestampEdit}>
               Cancel
             </Button>
             <Button 
               type="button" 
               onClick={handleSaveTimestamp} 
               disabled={!isConnected || !timestampInputValue} 
               className="bg-blue-600 hover:bg-blue-700"
             >
               Update Timestamp
             </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <header className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-white flex items-center">
           <Shield className="mr-3 h-8 w-8 text-purple-400" /> Song Request Admin Dashboard
        </h1>
        <div className="flex items-center space-x-4">
          <ConnectionStatus isConnected={isConnected} />
          {user && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-10 w-10 rounded-full">
                  <Avatar>
                    <AvatarImage src={user.profile_image_url} alt={user.display_name} />
                    <AvatarFallback>{user.display_name.substring(0, 2)}</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56 bg-gray-800 border-gray-700 text-white" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">{user.display_name}</p>
                    <p className="text-xs leading-none text-gray-400">@{user.login}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-gray-700" />
                 {/* Removed isAdmin check here - rely on middleware */} 
                 <DropdownMenuItem className="cursor-pointer hover:bg-gray-700 focus:bg-gray-700" onClick={() => window.open('/', '_blank')}>
                   <List className="mr-2 h-4 w-4" />
                   <span>Public Queue</span>
                 </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-gray-700" />
                <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-red-400 hover:bg-red-900/50 focus:bg-red-900/50 focus:text-red-300 hover:text-red-300">
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Log out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </header>

      {appState.error && (
        <div className="bg-red-900 border border-red-700 text-red-100 px-4 py-3 rounded relative mb-6" role="alert">
          <strong className="font-bold">Error: </strong>
          <span className="block sm:inline">{appState.error.message}</span>
        </div>
      )}

      {/* Main Content Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full max-w-full">
        {/* Left Column: Queue & History */}
        <div className="lg:col-span-2 space-y-6 min-w-0 w-full">
          {/* Current Active Song Section */}
          <div className="bg-gray-800 rounded-lg shadow-md p-4">
             <h2 className="text-xl font-semibold mb-3 flex items-center">
                <Music className="mr-2" size={24} /> Current Active Song
             </h2>
              {appState.isLoading ? (
                 <div className="flex items-center justify-center h-24">
                    <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                 </div>
              ) : appState.activeSong ? (
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-4 sm:space-y-0 sm:space-x-4">
                    {/* Larger Thumbnail */}
                    <div className="relative w-full sm:w-32 h-24 sm:h-20 rounded-md overflow-hidden flex-shrink-0">
                       <img 
                          src={appState.activeSong.thumbnailUrl || 'https://via.placeholder.com/128x80'} 
                          alt={appState.activeSong.title || 'Video thumbnail'}
                          className="w-full h-full object-cover"
                       />
                    </div>

                    <div className="flex-1 min-w-0 overflow-hidden">
                      <p className="font-semibold text-white text-lg truncate overflow-hidden whitespace-nowrap" title={appState.activeSong.title}>{appState.activeSong.title || 'Unknown Title'}</p>
                      <p className="text-sm text-gray-400 truncate hover:text-gray-300 transition-colors">
                        {appState.activeSong.channelId ? (
                          <Link href={`https://www.youtube.com/channel/${appState.activeSong.channelId}`} target="_blank" rel="noopener noreferrer" className="underline">
                              {appState.activeSong.artist || 'Unknown Artist'}
                          </Link>
                         ) : (
                           appState.activeSong.artist || 'Unknown Artist'
                         )}
                      </p>
                      <div className="text-xs text-gray-500 flex items-center flex-wrap gap-x-2 gap-y-1 mt-1">
                          Requested by: 
                          <Avatar className="w-4 h-4 rounded-full inline-block">
                            <AvatarImage src={appState.activeSong.requesterAvatar ?? undefined} alt={appState.activeSong.requester} />
                            <AvatarFallback className="text-[8px]">{appState.activeSong.requester.slice(0,1)}</AvatarFallback>
                          </Avatar>
                           <Link href={`https://www.twitch.tv/${appState.activeSong.requesterLogin || appState.activeSong.requester.toLowerCase()}`} target="_blank" rel="noopener noreferrer" className="hover:text-gray-300 underline transition-colors">
                             <span>{appState.activeSong.requester}</span>
                           </Link>
                         {/* Adjusted Badge Styles */}
                         {appState.activeSong.requestType === 'donation' && (
                            <Badge variant="secondary" className="px-1.5 py-0.5 text-xs bg-green-800 text-green-200 border-green-700">
                              Dono
                            </Badge>
                          )}
                          {appState.activeSong.requestType === 'channelPoint' && (
                            <Badge variant="outline" className="px-1.5 py-0.5 text-xs bg-purple-800 text-purple-200 border-purple-700">
                              Points
                            </Badge>
                          )}
                           {appState.activeSong.requestType !== 'donation' && appState.activeSong.requestType !== 'channelPoint' && (
                              <Badge variant="secondary" className="px-1.5 py-0.5 text-xs">
                                  {appState.activeSong.requestType}
                              </Badge>
                           )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end space-y-2 w-full sm:w-auto">
                      <div className="text-sm text-gray-400 flex items-center">
                        <Clock className="inline-block mr-1 -mt-0.5" size={16} />
                        {formatDuration(appState.activeSong.durationSeconds)}
                        <div className="flex ml-2">
                          {appState.activeSong.youtubeUrl && (
                            <a href={appState.activeSong.youtubeUrl} target="_blank" rel="noopener noreferrer" aria-label="Watch on YouTube" className="mr-1">
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                                <Youtube className="h-5 w-5 text-red-600 hover:text-red-500 transition-colors" />
                              </Button>
                            </a>
                          )}
                          {appState.activeSong.spotifyData && appState.activeSong.spotifyData.url && (
                            <a href={appState.activeSong.spotifyData.url} target="_blank" rel="noopener noreferrer" aria-label="Listen on Spotify">
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                                <SpotifyIcon className="h-5 w-5 text-green-500 hover:text-green-400 transition-colors" />
                              </Button>
                            </a>
                          )}
                        </div>
                      </div>
                      {appState.activeSong.timestamp && (
                        <div className="text-xs text-gray-500">
                          Added: {formatTimestamp(appState.activeSong.timestamp)}
                        </div>
                      )}
                       {/* Song Controls */}
                      <div className="flex justify-end space-x-1">
                          {/* Queue management controls */}
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-1 text-gray-400 hover:text-white" onClick={handleSkipSong}><SkipForward className="h-4 w-4" /></Button>
                          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleMarkAsFinished}>Mark Finished</Button>
                      </div>
                    </div>
                  </div>
                  
                  {appState.activeSong.spotifyData && (
                    <div className="mt-2 pt-2 border-t border-gray-700">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 bg-[#1DB954]/10 rounded-md p-3">
                        <div className="flex items-center">
                          <div className="relative mr-2">
                            <SpotifyIcon className="h-6 w-6 text-[#1DB954]" />
                            {/* Small red X to remove Spotify data */}
                            <button
                              onClick={() => {
                                if (appState.activeSong) {
                                  handleRemoveSpotifyData(appState.activeSong.id, 'activeSong');
                                }
                              }}
                              className="absolute -top-1 -right-1 w-4 h-4 bg-red-600 hover:bg-red-700 rounded-full flex items-center justify-center text-white text-xs transition-colors"
                              title="Remove Spotify Data"
                              disabled={!isConnected}
                            >
                              <X size={10} />
                            </button>
                          </div>
                          <div>
                            <div className="text-white font-medium">{appState.activeSong.spotifyData.name}</div>
                            <div className="text-gray-400 text-sm">
                              {appState.activeSong.spotifyData.artists?.map((a: { name: string }) => a.name).join(', ')}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 ml-auto">
                          {appState.activeSong.spotifyData.uri && (
                            <a 
                              href={appState.activeSong.spotifyData.uri} 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              className="bg-[#1DB954] text-black font-medium px-4 py-2 rounded-full hover:bg-[#1DB954]/90 transition-colors flex items-center"
                            >
                              <SpotifyIcon className="h-4 w-4 mr-2" /> Play on Spotify
                            </a>
                          )}
                          {appState.activeSong.spotifyData.url && (
                            <a 
                              href={appState.activeSong.spotifyData.url || `https://open.spotify.com/track/${appState.activeSong.spotifyData.id}`}
                              target="_blank" 
                              rel="noopener noreferrer" 
                              className="bg-gray-700 text-white px-3 py-2 rounded-full hover:bg-gray-600 transition-colors flex items-center text-sm"
                            >
                              <LinkIcon className="h-3 w-3 mr-1" /> Web Player
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-gray-400 italic text-center py-8">No active song.</p>
              )}
          </div>

          {/* Queue and History Tabs */}
          <Tabs defaultValue="queue" className="w-full max-w-full min-w-0">
            <TabsList className="grid w-full grid-cols-2 bg-gray-800">
              <TabsTrigger value="queue" className="data-[state=active]:bg-gray-700 data-[state=active]:text-white">
                  <List className="mr-2 h-4 w-4" /> Current Queue ({totalQueueCount}) - <Clock className="inline-block mx-1" size={14} /> {totalQueueDurationFormatted}
              </TabsTrigger>
              <TabsTrigger value="history" className="data-[state=active]:bg-gray-700 data-[state=active]:text-white">
                  <History className="mr-2 h-4 w-4" /> History ({totalHistoryCount})
              </TabsTrigger>
            </TabsList>
            <TabsContent value="queue">
               <div className="flex justify-between items-center mb-3 px-1">
                  <h3 className="text-lg font-semibold text-white">Queue</h3>
                  {/* Confirmation Dialog for Clear Queue */}
                  <Dialog open={isClearQueueDialogOpen} onOpenChange={setIsClearQueueDialogOpen}>
                    <DialogTrigger asChild>
                      <Button variant="destructive" size="sm" disabled={appState.queue.length === 0} className="h-8 text-xs"
                        onClick={() => setIsClearQueueDialogOpen(true)}>
                        <Trash2 className="mr-1 h-3 w-3" /> Clear Queue
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Are you sure?</DialogTitle>
                        <DialogDescription>
                          This will remove <b>all songs</b> from the queue. This action cannot be undone.
                        </DialogDescription>
                      </DialogHeader>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setIsClearQueueDialogOpen(false)}>
                          Cancel
                        </Button>
                        <Button variant="destructive" onClick={() => { handleClearQueue(); setIsClearQueueDialogOpen(false); }}>
                          Yes, clear queue
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
                <ScrollArea className="h-[80vh] w-full rounded-md border border-gray-700 p-4 bg-gray-800 overflow-hidden">
                    {appState.isLoading ? (
                       <div className="flex items-center justify-center h-full"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div>
                    ) : appState.queue.length > 0 ? (
                      <DragDropContext onDragEnd={handleDragEnd}>
                        <Droppable droppableId="adminQueue">
                          {(provided) => (
                            <ul 
                              className="space-y-2"
                              {...provided.droppableProps}
                              ref={provided.innerRef}
                            >
                              {appState.queue.map((song, index) => (
                                <Draggable key={song.id} draggableId={song.id} index={index}>
                                  {(provided, snapshot) => (
                                   <li 
                                     ref={provided.innerRef}
                                     {...provided.draggableProps}
                                     className={`flex items-center space-x-3 p-3 rounded-md bg-gray-800 hover:bg-gray-700/80 transition mb-2 group w-full ${snapshot.isDragging ? 'opacity-70 border border-purple-500' : ''}`}
                                   >
                                     <div 
                                       {...provided.dragHandleProps}
                                       className="flex-shrink-0 font-semibold text-gray-400 w-6 text-center flex items-center justify-center cursor-move"
                                     >
                                       <GripVertical size={16} className="text-gray-500" />
                                     </div>
                                     <div className="flex-shrink-0 font-semibold text-gray-400 w-4 text-center">
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
                                         <div className="w-full h-full rounded-md bg-gray-700 flex items-center justify-center">
                                           <Music size={20} className="text-gray-400"/>
                                         </div>
                                       )}
                                     </div>
                                     <div className="flex-1 min-w-0 overflow-hidden">
                                        <p 
                                            className="font-medium text-white truncate max-w-md"
                                            title={song.title}
                                        >
                                            {song.title || 'Loading title...'}
                                        </p>
                                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
                                           {song.channelId ? (
                                             <Link href={`https://www.youtube.com/channel/${song.channelId}`} target="_blank" rel="noopener noreferrer" className="hover:text-purple-300 transition-colors group/artist">
                                               <Badge variant="outline" className="text-xs font-normal cursor-pointer group-hover/artist:border-purple-400 group-hover/artist:text-purple-300 transition-colors">
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
                                           {formatDuration(song.durationSeconds) || '?:??'}
                                         </span>
                                         <div className="text-xs text-gray-400 flex items-center gap-1">
                                           by{' '}
                                           <Avatar className="w-3 h-3 rounded-full inline-block">
                                             <AvatarImage src={song.requesterAvatar ?? undefined} alt={song.requester} />
                                             <AvatarFallback className="text-[8px]">{song.requester.slice(0,1)}</AvatarFallback>
                                           </Avatar>
                                           <Link href={`https://www.twitch.tv/${song.requesterLogin || song.requester.toLowerCase()}`} target="_blank" rel="noopener noreferrer" className="hover:text-gray-300 underline transition-colors">
                                             {song.requester}
                                           </Link>
                                         </div>
                                         {/* Request type badges */}
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
                                        {/* START: Added Spotify Details */}
                                        {song.spotifyData && (
                                            <div className="mt-1 text-xs flex items-center text-gray-400 gap-1.5" title={`Spotify: ${song.spotifyData.name} by ${song.spotifyData.artists?.map(a => a.name).join(', ')}`}>
                                                <div className="relative flex-shrink-0">
                                                  <SpotifyIcon className="h-3 w-3 text-green-500" />
                                                  {/* Small red X to remove Spotify data */}
                                                  <button
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      handleRemoveSpotifyData(song.id, 'queue');
                                                    }}
                                                    className="absolute -top-1 -right-1 w-3 h-3 bg-red-600 hover:bg-red-700 rounded-full flex items-center justify-center text-white text-xs transition-colors"
                                                    title="Remove Spotify Data"
                                                    disabled={!isConnected}
                                                  >
                                                    <X size={8} />
                                                  </button>
                                                </div>
                                                <span className="truncate">
                                                    {song.spotifyData.name} - {song.spotifyData.artists?.map((a: { name: string }) => a.name).join(', ')}
                                                </span>
                                                {/* Display URL link if it exists */}
                                                {song.spotifyData.url && (
                                                  <a 
                                                    href={song.spotifyData.url} 
                                                    target="_blank" 
                                                    rel="noopener noreferrer" 
                                                    title="Open on Spotify"
                                                    className="ml-1 text-gray-500 hover:text-green-400 transition-colors"
                                                    onClick={(e) => e.stopPropagation()} // Prevent triggering other actions
                                                  >
                                                    <LinkIcon size={12} />
                                                  </a>
                                                )}
                                            </div>
                                        )}
                                        {/* END: Added Spotify Details */}
                                     </div>
                                     {/* Buttons and Timestamp container */}
                                     <div className="flex-shrink-0 flex flex-col items-end flex-grow-0">
                                        <div className="flex space-x-1 items-center"> {/* Wrap buttons for alignment */}
                                           {/* Edit Spotify Button */}
                                           <Button 
                                             variant="ghost" 
                                             size="sm" 
                                             className="h-8 w-8 p-0 text-gray-400 hover:text-white"
                                             onClick={() => openSpotifyLinkDialog(song)}
                                             title="Edit Spotify Link"
                                             disabled={!isConnected} // Disable if not connected
                                           >
                                             <Edit size={14} />
                                           </Button>
                                           {/* Mari's Choice Button */}
                                           <Button
                                             variant="ghost"
                                             size="sm"
                                             className="h-8 w-8 p-0 text-yellow-400 hover:text-yellow-300"
                                             onClick={() => handleMakeMarisChoice(song.id)}
                                             title="Convert to Mari's Choice template"
                                             disabled={!isConnected}
                                           >
                                             <Star size={16} />
                                           </Button>
                                           {/* Existing Play/Remove buttons */}
                                           <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => handlePlaySong(song)} title="Set Active" disabled={!isConnected}>
                                               <Play className="h-4 w-4 text-green-500 hover:text-green-400" />
                                           </Button>
                                           <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => handleRemoveSong(song.id)} title="Remove from Queue" disabled={!isConnected}>
                                             <Trash2 className="h-4 w-4 text-red-500 hover:text-red-400" />
                                           </Button>
                                           {/* Existing YouTube/Spotify links */}
                                           {song.youtubeUrl && (
                                            <a href={song.youtubeUrl} target="_blank" rel="noopener noreferrer" aria-label="Watch on YouTube">
                                                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                                    <Youtube className="h-4 w-4 text-red-600 hover:text-red-500" />
                                                  </Button>
                                             </a>
                                           )}
                                           {song.spotifyData && song.spotifyData.url && (
                                             <a href={song.spotifyData.url} target="_blank" rel="noopener noreferrer" aria-label="Listen on Spotify">
                                               <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                                 <SpotifyIcon className="h-4 w-4 text-green-500 hover:text-green-400" />
                                               </Button>
                                             </a>
                                           )}
                                         </div>
                                         {song.timestamp && (
                                           <span className="text-xs text-gray-500 mt-1">
                                             Added: {formatTimestamp(song.timestamp)}
                                           </span>
                                         )}
                                     </div>
                                   </li>
                                  )}
                                </Draggable>
                              ))}
                              {provided.placeholder}
                            </ul>
                          )}
                        </Droppable>
                      </DragDropContext>
                    ) : (
                      <p className="text-gray-400 italic text-center py-10">The queue is empty.</p>
                    )}
                </ScrollArea>
            </TabsContent>
            <TabsContent value="history">
              <div className="flex justify-between items-center mb-3 px-1">
                <h3 className="text-lg font-semibold text-white">Played History</h3>
                <Input
                  type="text"
                  placeholder="Search songs, artists, or requesters..."
                  value={adminHistorySearch}
                  onChange={e => setAdminHistorySearch(e.target.value)}
                  className="w-96 bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:border-purple-500 focus:ring-purple-500 ml-4"
                />
              </div>
              <ScrollArea className="h-[80vh] w-full rounded-md border border-gray-700 p-4 bg-gray-800 overflow-hidden">
                {appState.isLoading ? (
                  <div className="flex items-center justify-center h-full"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div>
                ) : (isAdminSearching ? adminSearchResults.length > 0 : historyList.length > 0) ? (
                  <>
                    <ul className="space-y-2 w-full max-w-[790px] overflow-visible">
                      {(isAdminSearching ? adminSearchResults : historyList).map((song, index) => (
                        <li 
                          key={song.id}
                          className="flex items-center space-x-3 p-3 rounded-md bg-gray-800 hover:bg-gray-700/80 transition mb-2 group w-full max-w-full overflow-visible"
                        >
                          {/* Index */}
                          <div className="flex-shrink-0 font-semibold text-gray-400 w-6 text-center">
                            {index + 1}. 
                          </div>
                                    
                                    {/* Existing Thumbnail */}
                                    <div className="relative w-16 h-9 rounded-md overflow-hidden flex-shrink-0 border border-gray-700">
                                      {song.thumbnailUrl ? (
                                        <img 
                                          src={song.thumbnailUrl} 
                                          alt={song.title || 'Video thumbnail'}
                                          className="w-full h-full object-cover"
                                        />
                                      ) : (
                                        <div className="w-full h-full rounded-md bg-gray-700 flex items-center justify-center">
                                          <Music size={20} className="text-gray-400"/>
                                        </div>
                                      )}
                                    </div>
                                    
                                    {/* Song Info */} 
                                    <div className="flex-1 min-w-0 pr-2 overflow-visible">
                                       <p className="font-medium text-white truncate" title={song.title}>{song.title || 'Unknown Title'}</p>
                                       <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
                                          {/* ... Artist Badge, Duration, Requester Info ... */} 
                                          {song.channelId ? (
                                            <Link href={`https://www.youtube.com/channel/${song.channelId}`} target="_blank" rel="noopener noreferrer" className="hover:text-purple-300 transition-colors group/artist">
                                              <Badge variant="outline" className="text-xs font-normal cursor-pointer group-hover/artist:border-purple-400 group-hover/artist:text-purple-300 transition-colors">
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
                                            {formatDuration(song.durationSeconds) || '?:??'}
                                          </span>
                                          <div className="text-xs text-gray-400 flex items-center gap-1">
                                            by{' '}
                                            <Avatar className="w-3 h-3 rounded-full inline-block">
                                              <AvatarImage src={song.requesterAvatar ?? undefined} alt={song.requester} />
                                              <AvatarFallback className="text-[8px]">{song.requester.slice(0,1)}</AvatarFallback>
                                            </Avatar>
                                            <Link href={`https://www.twitch.tv/${song.requesterLogin || song.requester.toLowerCase()}`} target="_blank" rel="noopener noreferrer" className="hover:text-gray-300 underline transition-colors truncate">
                                              {song.requester}
                                            </Link>
                                          </div>
                                           {/* Request type badges */} 
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
                                        {/* START: Added Spotify Details */} 
                                        {song.spotifyData && (
                                            <div className="mt-1 text-xs flex items-center text-gray-400 gap-1.5" title={`Spotify: ${song.spotifyData.name} by ${song.spotifyData.artists?.map((a: {name: string}) => a.name).join(', ')}`}>
                                                <SpotifyIcon className="h-3 w-3 text-green-500 flex-shrink-0" />
                                                <span className="truncate">
                                                    {song.spotifyData.name} - {song.spotifyData.artists?.map((a: { name: string }) => a.name).join(', ')}
                                                </span>
                                                {/* Display URL link if it exists */} 
                                                {song.spotifyData.url && (
                                                  <a 
                                                    href={song.spotifyData.url} 
                                                    target="_blank" 
                                                    rel="noopener noreferrer" 
                                                    title="Open on Spotify"
                                                    className="ml-1 text-gray-500 hover:text-green-400 transition-colors"
                                                    onClick={(e) => e.stopPropagation()} // Prevent triggering other actions
                                                  >
                                                    <LinkIcon size={12} />
                                                  </a>
                                                )}
                                            </div>
                                        )}
                                        {/* END: Added Spotify Details */} 
                                    </div>
                                    
                                    {/* Actions & Timestamp */} 
                                    <div className="flex-shrink-0 flex flex-col items-end w-[120px] overflow-visible">
                                       <div className="flex space-x-1 mb-1 justify-end">
                                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => handleEditTimestamp(song)} title="Edit Timestamp">
                                            <Edit className="h-4 w-4 text-blue-500 hover:text-blue-400" />
                                          </Button>
                                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => handleReturnToQueue(song)}>
                                            <Play className="h-4 w-4 text-green-500 hover:text-green-400" />
                                          </Button>
                                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => handleRemoveFromHistory(song.id)}>
                                            <Trash2 className="h-4 w-4 text-red-500 hover:text-red-400" />
                                          </Button>
                                          {song.youtubeUrl && (
                                           <a href={song.youtubeUrl} target="_blank" rel="noopener noreferrer" aria-label="Watch on YouTube">
                                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                              <Youtube className="h-4 w-4 text-red-600 hover:text-red-500" />
                                            </Button>
                                           </a>
                                          )}
                                          {song.spotifyData && song.spotifyData.url && (
                                            <a href={song.spotifyData.url} target="_blank" rel="noopener noreferrer" aria-label="Listen on Spotify">
                                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                                <SpotifyIcon className="h-4 w-4 text-green-500 hover:text-green-400" />
                                              </Button>
                                            </a>
                                          )}
                                        </div>
                                        {song.timestamp && (
                                          <div className="text-xs text-gray-500 text-right leading-tight w-full">
                                            <div className="truncate">Completed:</div>
                                            <div className="font-mono text-[10px] truncate" title={formatTimestamp(song.timestamp)}>{formatTimestamp(song.timestamp)}</div>
                                          </div>
                                        )}
                                    </div>
                                  </li>
                                ))}
                    </ul>
                    {/* Load More for search or normal history */}
                    {isAdminSearching ? (
                      adminSearchResults.length < adminSearchTotal && (
                        <div className="mt-6 flex justify-center">
                          <Button
                            variant="outline"
                            className="bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600 hover:border-gray-500"
                            onClick={loadMoreAdminSearchResults}
                            disabled={isLoadingAdminSearch}
                          >
                            {isLoadingAdminSearch ? (
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
                      hasMoreHistory && historyList.length > 0 && (
                        <div className="mt-6 flex justify-center">
                          <Button
                            variant="outline"
                            className="bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600 hover:border-gray-500"
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
                    {isAdminSearching && adminSearchResults.length >= adminSearchTotal && adminSearchResults.length > 0 && (
                      <div className="mt-4 text-center text-gray-500 text-sm">
                        End of search results
                      </div>
                    )}
                    {/* End of history message for normal history */}
                    {!isAdminSearching && !hasMoreHistory && historyList.length > 0 && (
                      <div className="mt-4 text-center text-gray-500 text-sm">
                        End of history reached
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-gray-400 italic text-center py-10">No song history available.</p>
                )}
              </ScrollArea>
            </TabsContent>
          </Tabs>

          {/* All-Time Stats Card - Moved under the queue/history tabs */}
          <StatisticsCard 
            isLoading={isLoadingStats}
            stats={allTimeStats}
            includeRequesters={true}
            title="All-Time Statistics"
            description="Overall system usage stats."
            className="mt-6"
          />
        </div>

        {/* Right Column: Controls & Settings */}
        <div className="lg:col-span-1 space-y-6 min-w-0 w-full">
          {/* Manual Add Card */}
          <Card className="bg-gray-800 border-gray-700">
            <CardHeader>
              <CardTitle className="text-white">Add Song Manually</CardTitle>
               <CardDescription>Add a song directly to the queue.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                  type="text"
                  placeholder="YouTube or Spotify Track URL"
                  value={songUrl}
                  onChange={(e) => setSongUrl(e.target.value)}
                   // Consistent input style
                  className="bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:border-purple-500 focus:ring-purple-500"
                  required
                />
                 <Input
                  type="text"
                  placeholder="Requester Username [default: CalaMariGold]"
                  value={requesterUsername}
                  onChange={(e) => setRequesterUsername(e.target.value)}
                   // Consistent input style
                  className="bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:border-purple-500 focus:ring-purple-500"
                 />
                {/* Consistent Select style */}
                <Select onValueChange={(value: 'channelPoint' | 'donation') => setRequestType(value)} defaultValue={requestType}>
                    <SelectTrigger className="w-full bg-gray-700 border-gray-600 text-white focus:border-purple-500 focus:ring-purple-500">
                        <SelectValue placeholder="Select request type" />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-800 border-gray-700 text-white">
                        <SelectItem value="channelPoint" className="focus:bg-gray-700">Channel Point</SelectItem>
                        <SelectItem value="donation" className="focus:bg-gray-700">Donation (Priority)</SelectItem>
                    </SelectContent>
                </Select>
                
                <div className="flex items-center space-x-2">
                  <Switch
                    id="bypass-restrictions"
                    checked={bypassRestrictions}
                    onCheckedChange={setBypassRestrictions}
                  />
                  <Label htmlFor="bypass-restrictions" className="text-sm cursor-pointer">
                    Bypass restrictions (blocked users, blacklist, duration limits, etc)
                  </Label>
                </div>
                 {/* Consistent Button style */}
                <Button type="submit" className="w-full bg-purple-600 hover:bg-purple-700 text-white">Add Song</Button>
              </form>
            </CardContent>
          </Card>

          {/* Blocked Users Card */}
          <Card className="bg-gray-800 border-gray-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center"><UserX className="mr-2 h-5 w-5" /> Blocked Users ({appState.blockedUsers.length})</CardTitle>
               <CardDescription>Users who cannot request songs.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleBlockUser} className="flex space-x-2 mb-4">
                <Input
                  type="text"
                  placeholder="Enter Twitch Username"
                  value={newBlockUsername}
                  onChange={(e) => setNewBlockUsername(e.target.value)}
                   // Consistent input style
                  className="bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:border-purple-500 focus:ring-purple-500"
                />
                 {/* Consistent Button style */}
                <Button type="submit" variant="destructive" className="bg-red-700 hover:bg-red-800">Block</Button>
              </form>
               {/* Applied consistent ScrollArea style */}
              <ScrollArea className="h-[150px] pr-4 rounded-md border border-gray-700 p-3 bg-gray-700/50">
                {appState.blockedUsers.length > 0 ? (
                  <ul className="space-y-2">
                    {appState.blockedUsers.map((user) => (
                       // Consistent list item style
                      <li key={user.id || user.username} className="flex justify-between items-center text-sm bg-gray-800/60 p-2 rounded">
                        <span className="text-white truncate">{user.username}</span>
                        <div className="flex items-center flex-shrink-0 ml-2">
                            <span className="text-xs text-gray-400 mr-1 hidden sm:inline">({formatTimestamp(user.addedAt)})</span>
                             {/* Consistent Button style */}
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-1 text-gray-400 hover:text-red-400" onClick={() => handleUnblockUser(user.username)}>
                              <X className="h-4 w-4" />
                            </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-gray-400 italic text-center py-4">No users are currently blocked.</p>
                )}
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Replace Requester Name in History Card */}
          <Card className="bg-gray-800 border-gray-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center"><Users className="mr-2 h-5 w-5" /> Replace Requester Name in History</CardTitle>
              <CardDescription>Change all history entries from one requester name to another.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handlePreviewRequesterName} className="space-y-3">
                <Input
                  type="text"
                  placeholder="Old Requester Name (case-insensitive)"
                  value={oldRequesterName}
                  onChange={e => setOldRequesterName(e.target.value)}
                  className="bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:border-purple-500 focus:ring-purple-500"
                  required
                />
                <Input
                  type="text"
                  placeholder="New Requester Name"
                  value={newRequesterName}
                  onChange={e => setNewRequesterName(e.target.value)}
                  className="bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:border-purple-500 focus:ring-purple-500"
                  required
                />
                <Button
                  type="submit"
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                  disabled={previewLoading || isReplacingRequester}
                >
                  {previewLoading ? <Loader2 className="inline-block mr-2 h-4 w-4 animate-spin" /> : null}
                  Preview & Replace Name
                </Button>
                {previewError && <div className="text-red-400 text-sm mt-2">{previewError}</div>}
              </form>
            </CardContent>
          </Card>

          {/* Confirmation Dialog for Replace Requester Name */}
          <Dialog open={isConfirmDialogOpen} onOpenChange={setIsConfirmDialogOpen}>
            <DialogContent className="sm:max-w-[600px] bg-gray-850 border-gray-700 text-white">
              <DialogHeader>
                <DialogTitle>Confirm Replace Requester Name</DialogTitle>
                <DialogDescription className="text-gray-400">
                  {previewEntries.length === 0 ? (
                    <>No history entries found for <b>{oldRequesterName}</b>.</>
                  ) : (
                    <>
                      This will change the requester name for <b>{previewEntries.length}</b> entr{previewEntries.length === 1 ? "y" : "ies"} from <b>{oldRequesterName}</b> to <b>{newRequesterName}</b>.<br />
                      <span className="text-xs text-gray-500">Below is a list of affected songs (title / artist):</span>
                    </>
                  )}
                </DialogDescription>
              </DialogHeader>
              <div className="max-h-64 overflow-y-auto my-2">
                {previewEntries.length > 0 && (
                  <ul className="space-y-1 text-sm">
                    {previewEntries.map(entry => (
                      <li key={entry.id} className="flex justify-between border-b border-gray-700 py-1">
                        <span className="truncate max-w-[60%]">{entry.title}</span>
                        <span className="truncate text-gray-400 max-w-[35%]">{entry.artist}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <DialogFooter className="bg-gray-850 flex-col sm:flex-row gap-2">
                <Button type="button" variant="outline" onClick={() => setIsConfirmDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                  disabled={isReplacingRequester || previewEntries.length === 0}
                  onClick={handleConfirmReplaceRequesterName}
                >
                  {isReplacingRequester ? <Loader2 className="inline-block mr-2 h-4 w-4 animate-spin" /> : null}
                  Confirm Replace
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Blacklist Card */}
          <Card className="bg-gray-800 border-gray-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center"><Ban className="mr-2 h-5 w-5" /> Blacklist ({appState.blacklist.length})</CardTitle>
               <CardDescription>Prevent specific songs, artists, or keywords.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAddToBlacklist} className="space-y-3 mb-4">
                 <div className="flex space-x-2">
                     <Input
                      type="text"
                      placeholder="Enter term (song, artist, keyword)"
                      value={newBlacklistTerm}
                      onChange={(e) => setNewBlacklistTerm(e.target.value)}
                       // Consistent input style
                      className="bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:border-purple-500 focus:ring-purple-500 flex-grow"
                      required
                    />
                     {/* Consistent Select style */}
                     <Select onValueChange={(value: BlacklistItem['type']) => setNewBlacklistType(value)} defaultValue={newBlacklistType}>
                        <SelectTrigger className="w-[120px] bg-gray-700 border-gray-600 text-white focus:border-purple-500 focus:ring-purple-500">
                            <SelectValue placeholder="Type" />
                        </SelectTrigger>
                        <SelectContent className="bg-gray-800 border-gray-700 text-white">
                            <SelectItem value="keyword" className="focus:bg-gray-700">Keyword</SelectItem>
                            <SelectItem value="song" className="focus:bg-gray-700">Song Title</SelectItem>
                            <SelectItem value="artist" className="focus:bg-gray-700">Artist</SelectItem>
                        </SelectContent>
                    </Select>
                 </div>
                 {/* Consistent Button style */}
                <Button type="submit" variant="destructive" className="w-full bg-red-700 hover:bg-red-800">Add to Blacklist</Button>
              </form>
               {/* Applied consistent ScrollArea style */}
              <ScrollArea className="h-[150px] pr-4 rounded-md border border-gray-700 p-3 bg-gray-700/50">
                {appState.blacklist.length > 0 ? (
                  <ul className="space-y-2">
                    {appState.blacklist.map((item) => (
                       // Consistent list item style
                      <li key={item.id || `${item.term}-${item.type}`} className="flex justify-between items-center text-sm bg-gray-800/60 p-2 rounded">
                        <div className="min-w-0 mr-2">
                            <span className="text-white truncate block">{item.term}</span>
                            <Badge variant="secondary" className="text-xs mt-0.5">{item.type}</Badge>
                        </div>
                        <div className="flex items-center flex-shrink-0 ml-auto">
                           <span className="text-xs text-gray-400 mr-1 hidden sm:inline">({formatTimestamp(item.addedAt)})</span>
                            {/* Consistent Button style */}
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-1 text-gray-400 hover:text-red-400" onClick={() => handleRemoveFromBlacklist(item.term, item.type)}>
                              <X className="h-4 w-4" />
                            </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-gray-400 italic text-center py-4">The blacklist is empty.</p>
                )}
              </ScrollArea>
            </CardContent>
          </Card>

           {/* Settings Card */}
           <Card className="bg-gray-800 border-gray-700">
            <CardHeader>
                <CardTitle className="text-white flex items-center"><SettingsIcon className="mr-2 h-5 w-5" /> System Settings</CardTitle>
                <CardDescription>Configure song request parameters.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
               {/* Songs Played Today Counter */}
               <div className="flex items-center justify-between">
                 <Label className="text-sm font-medium">Songs Played Today</Label>
                 <div className="flex items-center space-x-2">
                   <span className="text-white font-bold">{songsPlayedToday}</span>
                   <Button 
                     variant="outline" 
                     size="sm" 
                     onClick={handleResetTodaysCount}
                     className="h-8 text-xs bg-gray-700 border-gray-600 text-white hover:bg-gray-600 hover:border-gray-500"
                   >
                     Reset to 0
                   </Button>
                 </div>
               </div>

               {/* Add more settings controls here as needed */}
                <p className="text-xs text-gray-400 text-center pt-2">More settings coming soon...</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

