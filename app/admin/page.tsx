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
  X
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

interface TwitchUser {
  id: string
  login: string
  display_name: string
  profile_image_url: string
  isAdmin: boolean
}

export default function AdminDashboard() {
  // State
  const [videoUrl, setVideoUrl] = useState("")
  const [requesterUsername, setRequesterUsername] = useState("")
  const [user, setUser] = useState<TwitchUser | null>(null)
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
  const { toast } = useToast()

  // Socket Connection and Event Listeners
  useEffect(() => {
    const socketInstance: Socket<SocketEvents> = io(process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3002')
    
    socketInstance.on('connect', () => {
      setIsConnected(true)
      console.log('Admin: Connected to Socket.IO server')
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
    })

    socketInstance.on('queueUpdate', (queue: SongRequest[]) => {
      console.log('Admin: Queue updated', queue)
      setAppState(prev => ({ ...prev, queue }))
    })

    socketInstance.on('activeSong', (song: SongRequest | null) => {
      console.log('Admin: Active song updated', song)
      setAppState(prev => ({ ...prev, activeSong: song }))
    })

    socketInstance.on('historyUpdate', (history: SongRequest[]) => {
      console.log('Admin: History updated', history)
      setAppState(prev => ({ ...prev, history }))
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

    socketInstance.on('connect_error', (err) => {
      console.error('Admin: Socket connection error:', err)
      setAppState(prev => ({ ...prev, error: new Error('Connection failed'), isLoading: false }))
      setIsConnected(false)
    })
    
    setSocket(socketInstance)

    return () => {
      console.log('Admin: Cleaning up socket connection')
      socketInstance.disconnect()
    }
  }, [])

  // Load user from cookie
  useEffect(() => {
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
        setUser(userData)
      } catch (e) {
        console.error('Failed to parse user cookie:', e)
      }
    }
  }, [])

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
    console.log(`Admin: Skipping song ${skippedSong.id}`)
    const nextSong = appState.queue.length > 0 ? appState.queue[0] : null
    socket.emit('updateActiveSong', nextSong) 
    toast({ title: "Song Skipped", description: `Skipped: ${skippedSong.title}` })
    if (nextSong) {
       toast({ title: "New Song Active", description: `Now showing: ${nextSong.title}` })
    } else {
       toast({ title: "Queue Empty", description: "No active song." })
    }
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

  const handleClearQueue = () => {
    if (!socket) return
    console.log("Admin: Clearing queue")
    socket.emit('clearQueue')
    toast({ title: "Queue Cleared" })
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

  const handleMoveUp = (songId: string) => handleMove(songId, 'up')
  const handleMoveDown = (songId: string) => handleMove(songId, 'down')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const finalRequesterUsername = requesterUsername.trim() === "" ? "CalaMariGold" : requesterUsername.trim()

    if (!socket || !videoUrl || !finalRequesterUsername) {
        toast({ title: "Missing Information", description: "Please provide a valid YouTube URL and requester name." });
        return
    }

    const songRequestData = {
        youtubeUrl: videoUrl,
        requester: finalRequesterUsername,
        requestType: requestType,
        donationInfo: requestType === 'donation' ? { amount: 5, currency: 'USD' } : undefined,
        source: 'admin',
        bypassRestrictions: bypassRestrictions
    }

    console.log("Admin: Manually adding song:", songRequestData)
    socket.emit('addSong', songRequestData as Partial<SongRequest> & { youtubeUrl: string; requester: string })

    toast({ title: "Song Submitted", description: `Attempting to add: ${videoUrl}` })
    setVideoUrl("")
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

  // Helper Functions
  const extractYouTubeId = (url: string): string | null => {
    const match = url.match(/(?:youtube\.com\/watch\?v=|youtu.be\/)([\w-]+)/)
    return match ? match[1] : null
  }

  const formatTimestamp = (isoString?: string): string => {
    if (!isoString) return 'N/A'
    try {
      // Use Eastern Time (UTC-4) for timestamp display
      return new Date(isoString).toLocaleString('en-US', {
        timeZone: 'America/New_York',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      })
    } catch (e) {
      return 'Invalid Date'
    }
  }
  
  const formatDuration = (totalSeconds?: number): string => {
    if (totalSeconds === null || totalSeconds === undefined || totalSeconds < 0) {
        return '?:??'
    }
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60

    const paddedSeconds = seconds.toString().padStart(2, '0')

    if (hours > 0) {
        const paddedMinutes = minutes.toString().padStart(2, '0')
        return `${hours}:${paddedMinutes}:${paddedSeconds}`
    } else {
        return `${minutes}:${paddedSeconds}`
    }
  }
  
  const totalQueueSeconds = appState.queue.reduce((sum, song) => {
    return sum + (song.durationSeconds || 0) 
  }, 0)
  const totalQueueDurationFormatted = formatDuration(totalQueueSeconds)

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
      <header className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-white flex items-center">
           <Shield className="mr-3 h-8 w-8 text-purple-400" /> Song Request Admin
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
                    <p className="text-xs leading-none text-gray-400">{user.login}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-gray-700" />
                {user.isAdmin && (
                  <DropdownMenuItem className="cursor-pointer hover:bg-gray-700 focus:bg-gray-700">
                    <Shield className="mr-2 h-4 w-4" />
                    <span>Admin Privileges</span>
                  </DropdownMenuItem>
                )}
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
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Queue & History */}
        <div className="lg:col-span-2 space-y-6">
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
                <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-4 sm:space-y-0 sm:space-x-4">
                  {/* Larger Thumbnail */}
                  <div className="relative w-full sm:w-32 h-24 sm:h-20 rounded-md overflow-hidden flex-shrink-0">
                     <img 
                        src={appState.activeSong.thumbnailUrl || 'https://via.placeholder.com/128x80'} 
                        alt={appState.activeSong.title || 'Video thumbnail'}
                        className="w-full h-full object-cover"
                     />
                  </div>

                  <div className="flex-grow min-w-0">
                    <p className="font-semibold text-white text-lg truncate" title={appState.activeSong.title}>{appState.activeSong.title || 'Unknown Title'}</p>
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
                          <AvatarImage src={appState.activeSong.requesterAvatar} alt={appState.activeSong.requester} />
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
                      <a href={appState.activeSong.youtubeUrl} target="_blank" rel="noopener noreferrer" aria-label="Watch on YouTube" className="ml-2">
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                          <Youtube className="h-5 w-5 text-red-600 hover:text-red-500 transition-colors" />
                        </Button>
                      </a>
                    </div>
                     {/* Song Controls */}
                    <div className="flex justify-end space-x-1">
                        {/* Queue management controls */}
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-1 text-gray-400 hover:text-white" onClick={handleSkipSong}><SkipForward className="h-4 w-4" /></Button>
                        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleMarkAsFinished}>Mark Finished</Button>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-gray-400 italic text-center py-8">No active song.</p>
              )}
          </div>

          {/* Queue and History Tabs */}
          <Tabs defaultValue="queue" className="w-full">
            <TabsList className="grid w-full grid-cols-2 bg-gray-800">
              <TabsTrigger value="queue" className="data-[state=active]:bg-gray-700 data-[state=active]:text-white">
                  <List className="mr-2 h-4 w-4" /> Current Queue ({appState.queue.length}) - {totalQueueDurationFormatted}
              </TabsTrigger>
              <TabsTrigger value="history" className="data-[state=active]:bg-gray-700 data-[state=active]:text-white">
                  <History className="mr-2 h-4 w-4" /> History ({appState.history.length})
              </TabsTrigger>
            </TabsList>
            <TabsContent value="queue">
               <div className="flex justify-between items-center mb-3 px-1">
                  <h3 className="text-lg font-semibold text-white">Queue</h3>
                  <Button variant="destructive" size="sm" onClick={handleClearQueue} disabled={appState.queue.length === 0} className="h-8 text-xs">
                    <Trash2 className="mr-1 h-3 w-3" /> Clear Queue
                  </Button>
                </div>
                <ScrollArea className="h-[150vh] w-full rounded-md border border-gray-700 p-4 bg-gray-800">
                    {appState.isLoading ? (
                       <div className="flex items-center justify-center h-full"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div>
                    ) : appState.queue.length > 0 ? (
                      <ul className="space-y-2">
                        {appState.queue.map((song, index) => (
                           <li key={song.id} className="flex items-center space-x-3 p-3 rounded-md bg-gray-800 hover:bg-gray-700/80 transition mb-2 group">
                             <div className="flex-shrink-0 font-semibold text-gray-400 w-6 text-center">
                               {index + 1}.
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
                            <div className="flex-grow min-w-0">
                               <p className="font-medium text-white truncate" title={song.title}>{song.title || 'Loading title...'}</p>
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
                                <span className="text-xs text-gray-400">
                                  ({formatDuration(song.durationSeconds) || '?:??'})
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
                                    {/* Consistent Badge Styles */}
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
                            <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                               <Button variant="ghost" size="sm" className="h-7 w-7 p-1 text-gray-400 hover:text-white" onClick={() => handleMoveUp(song.id)} disabled={index === 0}>
                                    <ChevronUp className="h-4 w-4" />
                               </Button>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-1 text-gray-400 hover:text-white" onClick={() => handleMoveDown(song.id)} disabled={index === appState.queue.length - 1}>
                                    <ChevronDown className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-1 text-green-400 hover:text-green-300" onClick={() => handlePlaySong(song)}>
                                    <Play className="h-4 w-4" />
                                </Button>
                                <a href={song.youtubeUrl} target="_blank" rel="noopener noreferrer" aria-label="Watch on YouTube">
                                     <Button variant="ghost" size="sm" className="h-7 w-7 p-1 text-red-600 hover:text-red-500">
                                       <Youtube className="h-4 w-4" />
                                     </Button>
                                </a>
                               <Button variant="ghost" size="sm" className="h-7 w-7 p-1 text-red-500 hover:text-red-400" onClick={() => handleRemoveSong(song.id)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-gray-400 italic text-center py-10">The queue is empty.</p>
                    )}
                </ScrollArea>
            </TabsContent>
            <TabsContent value="history">
               <div className="flex justify-between items-center mb-3 px-1">
                  <h3 className="text-lg font-semibold text-white">Played History (Recent)</h3>
                  <Button variant="destructive" size="sm" onClick={() => {
                    if (!socket) return;
                    if (confirm('Are you sure you want to clear all history? This cannot be undone.')) {
                      socket.emit('clearHistory');
                      toast({ title: "History Cleared", description: "All history records have been deleted." });
                    }
                  }} disabled={appState.history.length === 0} className="h-8 text-xs">
                    <Trash2 className="mr-1 h-3 w-3" /> Clear History
                  </Button>
               </div>
               <ScrollArea className="h-[150vh] w-full rounded-md border border-gray-700 p-4 bg-gray-800">
                    {appState.isLoading ? (
                       <div className="flex items-center justify-center h-full"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div>
                    ) : appState.history.length > 0 ? (
                      <ul className="space-y-2">
                        {appState.history.map((song) => (
                           <li key={song.id} className="flex items-center space-x-3 p-3 rounded-md bg-gray-800 hover:bg-gray-700/80 transition mb-2 group">
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
                            <div className="flex-grow min-w-0">
                               <p className="font-medium text-white truncate" title={song.title}>{song.title || 'Unknown Title'}</p>
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
                                  <span className="text-xs text-gray-400">
                                    ({formatDuration(song.durationSeconds) || '?:??'})
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
                                   {/* Consistent Badge Styles */}
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
                            <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <a href={song.youtubeUrl} target="_blank" rel="noopener noreferrer" aria-label="Watch on YouTube">
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-1 text-red-600 hover:text-red-500">
                                  <Youtube className="h-4 w-4" />
                                </Button>
                              </a>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-7 w-7 p-1 text-green-500 hover:text-green-400"
                                onClick={() => handleReturnToQueue(song)}
                                title="Return to top of queue"
                              >
                                <SkipForward className="h-4 w-4 rotate-180" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-7 w-7 p-1 text-red-500 hover:text-red-400"
                                onClick={() => {
                                  if (!socket) return;
                                  socket.emit('deleteHistoryItem', song.id);
                                  toast({ 
                                    title: "History Item Deleted", 
                                    description: `Removed "${song.title}" from history.` 
                                  });
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-gray-400 italic text-center py-10">No song history available.</p>
                    )}
                  </ScrollArea>
            </TabsContent>
          </Tabs>
        </div>

        {/* Right Column: Controls & Settings */}
        <div className="lg:col-span-1 space-y-6">
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
                  placeholder="YouTube Video URL"
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
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

          {/* All-Time Stats Card */}
          <Card className="bg-gray-800 border-gray-700">
              <CardHeader>
                  <CardTitle className="text-white flex items-center"><BarChart2 className="mr-2 h-5 w-5" /> All-Time Statistics</CardTitle>
                  <CardDescription>Overall system usage stats.</CardDescription>
              </CardHeader>
              <CardContent>
                  {isLoadingStats ? (
                      <div className="flex items-center justify-center h-32">
                          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                          <span className="ml-2 text-gray-400">Loading stats...</span>
                      </div>
                  ) : allTimeStats ? (
                       // Adjusted TabsList style
                      <Tabs defaultValue="requesters" className="w-full">
                          <TabsList className="grid w-full grid-cols-3 bg-gray-700 mb-4 h-9">
                              {/* Adjusted TabsTrigger active style */}
                              <TabsTrigger value="requesters" className="text-xs data-[state=active]:bg-gray-600 data-[state=active]:text-white">Requesters</TabsTrigger>
                              <TabsTrigger value="songs" className="text-xs data-[state=active]:bg-gray-600 data-[state=active]:text-white">Songs</TabsTrigger>
                              <TabsTrigger value="artists" className="text-xs data-[state=active]:bg-gray-600 data-[state=active]:text-white">Artists</TabsTrigger>
                          </TabsList>
                           {/* Applied consistent ScrollArea style */}
                          <TabsContent value="requesters">
                              <ScrollArea className="h-[200px] pr-2 rounded-md border border-gray-700 p-3 bg-gray-700/50">
                                <ol className="list-decimal list-inside space-y-1 text-sm">
                                    {allTimeStats.topRequesters.length > 0 ? allTimeStats.topRequesters.map((r, i) => (
                                        <li key={i} className="text-gray-300">
                                            <span className="font-medium text-white">{r.requester}</span> ({r.request_count})
                                        </li>
                                    )) : <p className="text-gray-400 italic text-center py-2">No requester data yet.</p>}
                                </ol>
                              </ScrollArea>
                          </TabsContent>
                          <TabsContent value="songs">
                               <ScrollArea className="h-[200px] pr-2 rounded-md border border-gray-700 p-3 bg-gray-700/50">
                                <ol className="list-decimal list-inside space-y-1 text-sm">
                                    {allTimeStats.topSongs.length > 0 ? allTimeStats.topSongs.map((s, i) => (
                                        <li key={i} className="text-gray-300 truncate" title={`${s.title || '?'} - ${s.artist || '?'}`}>
                                            <span className="font-medium text-white">{s.title || 'Unknown Title'}</span> by <span className="italic">{s.artist || 'Unknown Artist'}</span> ({s.play_count})
                                        </li>
                                     )) : <p className="text-gray-400 italic text-center py-2">No song data yet.</p>}
                                </ol>
                               </ScrollArea>
                          </TabsContent>
                          <TabsContent value="artists">
                                <ScrollArea className="h-[200px] pr-2 rounded-md border border-gray-700 p-3 bg-gray-700/50">
                                <ol className="list-decimal list-inside space-y-1 text-sm">
                                     {allTimeStats.topArtists.length > 0 ? allTimeStats.topArtists.map((a, i) => (
                                        <li key={i} className="text-gray-300">
                                            <span className="font-medium text-white">{a.artist || 'Unknown Artist'}</span> ({a.play_count})
                                        </li>
                                     )) : <p className="text-gray-400 italic text-center py-2">No artist data yet.</p>}
                                </ol>
                                </ScrollArea>
                          </TabsContent>
                      </Tabs>
                  ) : (
                      <p className="text-gray-400 italic text-center py-10">Could not load statistics.</p>
                  )}
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

           {/* Settings Card - ADD BASIC STRUCTURE */}
           <Card className="bg-gray-800 border-gray-700">
            <CardHeader>
                <CardTitle className="text-white flex items-center"><SettingsIcon className="mr-2 h-5 w-5" /> System Settings</CardTitle>
                <CardDescription>Configure song request parameters.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
               {/* Example Setting: Max Duration */}
               <div className="flex items-center justify-between">
                 <Label htmlFor="maxDuration" className="text-sm font-medium">Max Song Duration (minutes)</Label>
                 <Input 
                   id="maxDuration" 
                   type="number" 
                   min="1" 
                   step="1"
                   value={appState.settings.maxDuration || 10} 
                   onChange={(e) => {
                       const newDuration = parseInt(e.target.value);
                       if (socket && !isNaN(newDuration) && newDuration > 0) {
                           console.log("Admin: Updating max duration to", newDuration);
                           // Assuming 'setMaxDuration' event expects minutes
                           socket.emit('setMaxDuration', newDuration); 
                           // Optimistically update UI - server should send settingsUpdate
                           setAppState(prev => ({...prev, settings: {...prev.settings, maxDuration: newDuration}}));
                           toast({ title: "Settings Updated", description: `Max duration set to ${newDuration} minutes.` });
                       }
                   }}
                   className="w-20 bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:border-purple-500 focus:ring-purple-500" 
                 />
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

