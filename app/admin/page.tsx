"use client"

import { useState, useEffect, useRef } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/use-toast"
import { Toaster } from "@/components/ui/toaster"
import { ConnectionStatus } from "@/components/connection-status"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Slider } from "@/components/ui/slider"
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
  Settings, 
  Users, 
  List, 
  History,
  UserX,
  Star,
  AlertTriangle,
  Link as LinkIcon,
  BarChart2,
  Youtube
} from "lucide-react"
import { SongRequest, QueueState } from "@/lib/types"
import { io, Socket } from "socket.io-client"

interface TwitchUser {
  id: string
  login: string
  display_name: string
  profile_image_url: string
  isAdmin: boolean
}

interface BlockedUser {
  username: string
  blockedAt: string
  reason: string
}

interface BlacklistedContent {
  term: string
  type: 'song' | 'artist' | 'keyword'
  blockedAt: string
  reason: string
}

export default function AdminPage() {
  // State
  const [videoUrl, setVideoUrl] = useState("")
  const [user, setUser] = useState<TwitchUser | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [queueState, setQueueState] = useState<QueueState>({
    queue: [],
    history: [],
    nowPlaying: null,
    isLoading: true,
    error: null
  })
  const [socket, setSocket] = useState<Socket | null>(null)
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([])
  const [blacklist, setBlacklist] = useState<BlacklistedContent[]>([])
  const [newBlockUsername, setNewBlockUsername] = useState("")
  const [blockReason, setBlockReason] = useState("")
  const [newBlockedTerm, setNewBlockedTerm] = useState("")
  const [newBlockedType, setNewBlockedType] = useState<'song' | 'artist' | 'keyword'>('keyword')
  const [blacklistReason, setBlacklistReason] = useState("")
  const [isAutoplay, setIsAutoplay] = useState(true)
  const [maxSongDuration, setMaxSongDuration] = useState(5)
  const [priority, setPriority] = useState<'high' | 'normal' | 'low'>('normal')
  const { toast } = useToast()

  // Socket Connection
  useEffect(() => {
    // Connect to socket
    const socketInstance = io(process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3002')
    
    socketInstance.on('connect', () => {
      setIsConnected(true)
      console.log('Connected to Socket.IO server')
    })
    
    socketInstance.on('disconnect', () => {
      setIsConnected(false)
      console.log('Disconnected from Socket.IO server')
    })
    
    // Listen for queue updates
    socketInstance.on('queueUpdate', (queue: SongRequest[]) => {
      console.log('Queue updated:', queue)
      setQueueState(prev => ({ ...prev, queue, isLoading: false }))
    })
    
    // Listen for now playing updates
    socketInstance.on('nowPlaying', (song: SongRequest | null) => {
      console.log('Now playing updated:', song)
      setQueueState(prev => ({ ...prev, nowPlaying: song, isLoading: false }))
    })
    
    // Listen for history updates
    socketInstance.on('historyUpdate', (history: SongRequest[]) => {
      console.log('History updated:', history)
      setQueueState(prev => ({ ...prev, history, isLoading: false }))
    })
    
    // Request initial state
    socketInstance.emit('getState')
    
    setSocket(socketInstance)
    
    // Cleanup
    return () => {
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

  // Load blocked users from localStorage and sync with server
  useEffect(() => {
    const savedBlockedUsers = localStorage.getItem('blockedUsers')
    if (savedBlockedUsers) {
      try {
        const parsedUsers = JSON.parse(savedBlockedUsers);
        setBlockedUsers(parsedUsers);
        if (socket && socket.connected) {
          socket.emit('updateBlockedUsers', parsedUsers);
        }
      } catch (e) {
        console.error('Failed to parse blocked users:', e)
      }
    }
  }, [socket && socket.connected]);

  // Load blacklist from localStorage and sync with server
  useEffect(() => {
    const savedBlacklist = localStorage.getItem('contentBlacklist')
    if (savedBlacklist) {
      try {
        const parsedBlacklist = JSON.parse(savedBlacklist);
        setBlacklist(parsedBlacklist);
        if (socket && socket.connected) {
          socket.emit('updateBlacklist', parsedBlacklist);
        }
      } catch (e) {
        console.error('Failed to parse blacklist:', e)
      }
    }
  }, [socket && socket.connected]);

  // Queue Management
  const handlePlaySong = (song: SongRequest) => {
    if (!socket) return
    socket.emit('updateNowPlaying', song)
    toast({
      title: "Now Playing",
      description: `${song.title} by ${song.artist}`,
    })
  }

  const handleSkipSong = () => {
    if (!socket || !queueState.queue.length) return
    const nextSong = queueState.queue[0]
    socket.emit('updateNowPlaying', nextSong)
    toast({
      title: "Skipped",
      description: "Current song skipped",
    })
  }

  const handleRemoveSong = (id: string) => {
    if (!socket) return
    socket.emit('removeSong', id)
    toast({
      title: "Removed",
      description: "Song removed from queue",
    })
  }

  const handleClearQueue = () => {
    if (!socket) return
    socket.emit('clearQueue')
    toast({
      title: "Queue Cleared",
      description: "All songs have been removed from the queue",
    })
  }

  const handlePausePlaying = () => {
    if (!socket) return
    // This would require implementation in your player
    socket.emit('pausePlaying')
    toast({
      title: "Paused",
      description: "Playback paused",
    })
  }

  const handleResumePlaying = () => {
    if (!socket) return
    // This would require implementation in your player
    socket.emit('resumePlaying')
    toast({
      title: "Resumed",
      description: "Playback resumed",
    })
  }

  const handleStopPlaying = () => {
    if (!socket) return
    socket.emit('updateNowPlaying', null)
    toast({
      title: "Stopped",
      description: "Playback stopped",
    })
  }

  const handlePrioritize = (id: string) => {
    if (!socket) return
    socket.emit('prioritizeSong', id)
    toast({
      title: "Prioritized",
      description: "Song moved to the top of the queue",
    })
  }

  // Add a new song
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!videoUrl) {
      toast({
        title: "Error",
        description: "Please enter a video URL",
      })
      return
    }

    if (!socket) {
      toast({
        title: "Error",
        description: "Not connected to server",
      })
      return
    }

    // Extract video ID
    const videoId = extractYouTubeId(videoUrl)
    if (!videoId) {
      toast({
        title: "Error",
        description: "Invalid YouTube URL",
      })
      return
    }

    // Create request object
    const requestObj = {
      id: Date.now().toString(),
      youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
      requester: user?.display_name || "Admin",
      requesterAvatar: user?.profile_image_url || "/placeholder.svg?height=32&width=32",
      timestamp: new Date().toISOString(),
      priority: priority,
      source: 'youtube',
      channelPointReward: {
        rewardId: "admin-add",
        rewardTitle: "Admin Added",
        cost: 0
      }
    }

    // Send to server
    socket.emit('addSong', requestObj)
    
    toast({
      title: "Success",
      description: "Video added to queue",
    })
    setVideoUrl("")
  }

  // Block user management
  const handleBlockUser = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newBlockUsername) {
      toast({
        title: "Error",
        description: "Please enter a username",
      })
      return
    }

    const newBlockedUser: BlockedUser = {
      username: newBlockUsername.toLowerCase(),
      blockedAt: new Date().toISOString(),
      reason: blockReason || "Blocked by admin"
    }

    const updatedBlockedUsers = [...blockedUsers, newBlockedUser]
    setBlockedUsers(updatedBlockedUsers)
    localStorage.setItem('blockedUsers', JSON.stringify(updatedBlockedUsers))
    
    // Sync with server
    if (socket) {
      socket.emit('updateBlockedUsers', updatedBlockedUsers);
    }

    toast({
      title: "User Blocked",
      description: `${newBlockUsername} has been blocked from making requests`,
    })

    setNewBlockUsername("")
    setBlockReason("")
  }

  const handleUnblockUser = (username: string) => {
    const updatedBlockedUsers = blockedUsers.filter(user => user.username !== username)
    setBlockedUsers(updatedBlockedUsers)
    localStorage.setItem('blockedUsers', JSON.stringify(updatedBlockedUsers))
    
    // Sync with server
    if (socket) {
      socket.emit('updateBlockedUsers', updatedBlockedUsers);
    }

    toast({
      title: "User Unblocked",
      description: `${username} has been unblocked`,
    })
  }

  // Blacklist management
  const handleAddToBlacklist = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newBlockedTerm) {
      toast({
        title: "Error",
        description: "Please enter a term to blacklist",
      })
      return
    }

    const newBlacklistItem: BlacklistedContent = {
      term: newBlockedTerm.toLowerCase(),
      type: newBlockedType,
      blockedAt: new Date().toISOString(),
      reason: blacklistReason || `Blocked ${newBlockedType}`
    }

    const updatedBlacklist = [...blacklist, newBlacklistItem]
    setBlacklist(updatedBlacklist)
    localStorage.setItem('contentBlacklist', JSON.stringify(updatedBlacklist))
    
    // Sync with server
    if (socket) {
      socket.emit('updateBlacklist', updatedBlacklist);
    }

    toast({
      title: "Content Blacklisted",
      description: `"${newBlockedTerm}" has been added to the blacklist`,
    })

    setNewBlockedTerm("")
    setBlacklistReason("")
  }

  const handleRemoveFromBlacklist = (term: string) => {
    const updatedBlacklist = blacklist.filter(item => item.term !== term)
    setBlacklist(updatedBlacklist)
    localStorage.setItem('contentBlacklist', JSON.stringify(updatedBlacklist))
    
    // Sync with server
    if (socket) {
      socket.emit('updateBlacklist', updatedBlacklist);
    }

    toast({
      title: "Removed from Blacklist",
      description: `"${term}" has been removed from the blacklist`,
    })
  }

  // Settings
  const handleAutoplayChange = (checked: boolean) => {
    setIsAutoplay(checked)
    if (socket) {
      socket.emit('setAutoplay', checked)
    }
  }

  const handleMaxDurationChange = (value: number[]) => {
    setMaxSongDuration(value[0])
    if (socket) {
      socket.emit('setMaxDuration', value[0])
    }
  }

  // Authentication
  const handleLogout = () => {
    document.cookie = 'twitch_token=; Max-Age=0; path=/'
    document.cookie = 'twitch_user=; Max-Age=0; path=/'
    window.location.href = '/'
  }

  // Helper functions
  const extractYouTubeId = (url: string): string | null => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  }

  const formatTimestamp = (isoString: string): string => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return '';
    }
  }

  // Access control
  if (!user?.isAdmin) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 p-8 flex items-center justify-center">
        <div className="text-center text-white">
          <h1 className="text-3xl font-bold mb-4">Access Denied</h1>
          <p>You need admin privileges to access this page.</p>
        </div>
      </div>
    )
  }

  // Add this function before the return statement
  const getTopRequesters = () => {
    const requesters = queueState.queue.reduce((acc: Record<string, number>, song) => {
      const requester = song.requester
      acc[requester] = (acc[requester] || 0) + 1
      return acc
    }, {})
    
    return Object.entries(requesters)
      .map(([requester, count]) => ({ requester, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-white">Admin Panel</h1>
          
          <div className="flex items-center gap-4">
            <ConnectionStatus isConnected={isConnected} />
            {user && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="relative h-10 w-10 rounded-full">
                    <Avatar>
                      <AvatarImage src={user.profile_image_url} alt={user.display_name} />
                      <AvatarFallback>{user.display_name.slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="end">
                  <DropdownMenuLabel>
                    <div className="flex flex-col">
                      <span>{user.display_name}</span>
                      <span className="text-xs text-green-500 flex items-center gap-1">
                        <Shield size={12} />
                        Admin
                      </span>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="cursor-pointer text-red-500" onClick={handleLogout}>
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Log Out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
        
        {/* Main content */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Now Playing */}
          <Card className="md:col-span-3 bg-gray-800 border-gray-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Music size={20} />
                Now Playing
              </CardTitle>
            </CardHeader>
            <CardContent>
              {queueState.nowPlaying ? (
                <div className="flex items-center space-x-4">
                  <div className="relative w-16 h-16 rounded-md overflow-hidden">
                    {queueState.nowPlaying.thumbnailUrl ? (
                      <img 
                        src={queueState.nowPlaying.thumbnailUrl} 
                        alt={queueState.nowPlaying.title || 'Now playing'}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Avatar className="w-16 h-16">
                        <AvatarImage src={queueState.nowPlaying.requesterAvatar} alt={queueState.nowPlaying.requester} />
                        <AvatarFallback>{queueState.nowPlaying.requester.slice(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                    )}
                  </div>
                  <div className="flex-grow">
                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                      {queueState.nowPlaying.title || 'Unknown Title'}
                      {queueState.nowPlaying.source === 'youtube' && (
                        <Youtube size={16} className="text-red-500" />
                      )}
                    </h3>
                    <p className="text-gray-400">{queueState.nowPlaying.artist || 'Unknown Artist'}</p>
                    <div className="flex items-center mt-1">
                      <Badge variant="secondary" className="mr-2">
                        <Clock className="w-3 h-3 mr-1" />
                        {queueState.nowPlaying.duration || '?:??'}
                      </Badge>
                      <span className="text-sm text-gray-400">
                        Requested by: {queueState.nowPlaying.requester}
                      </span>
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    <Button variant="outline" size="sm" onClick={handlePausePlaying}>
                      <Pause size={16} />
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleResumePlaying}>
                      <Play size={16} />
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleSkipSong} 
                            disabled={queueState.queue.length === 0}>
                      <SkipForward size={16} />
                    </Button>
                    <Button variant="destructive" size="sm" onClick={handleStopPlaying}>
                      <Trash2 size={16} />
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-400">
                  No song is currently playing
                </div>
              )}
            </CardContent>
          </Card>

          {/* Main tabs */}
          <div className="md:col-span-2">
            <Tabs defaultValue="queue" className="w-full">
              <TabsList className="grid w-full grid-cols-4 bg-gray-700">
                <TabsTrigger value="queue">
                  <List className="mr-2" size={16} />
                  Queue
                </TabsTrigger>
                <TabsTrigger value="history">
                  <History className="mr-2" size={16} />
                  History
                </TabsTrigger>
                <TabsTrigger value="users">
                  <Users className="mr-2" size={16} />
                  Users
                </TabsTrigger>
                <TabsTrigger value="blacklist">
                  <AlertTriangle className="mr-2" size={16} />
                  Blacklist
                </TabsTrigger>
              </TabsList>

              {/* Queue Tab */}
              <TabsContent value="queue">
                <Card className="bg-gray-800 border-gray-700">
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-center">
                      <CardTitle className="text-white text-lg">
                        Song Queue
                      </CardTitle>
                      {queueState.queue.length > 0 && (
                        <Button variant="destructive" size="sm" onClick={handleClearQueue}>
                          <Trash2 size={16} className="mr-2" />
                          Clear
                        </Button>
                      )}
                    </div>
                    <CardDescription className="text-gray-400">
                      {queueState.queue.length} songs in queue
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {queueState.isLoading ? (
                      <div className="text-center py-8 text-gray-400">
                        Loading queue...
                      </div>
                    ) : queueState.queue.length === 0 ? (
                      <div className="text-center py-8 text-gray-400">
                        Queue is empty
                      </div>
                    ) : (
                      <ScrollArea className="h-[400px]">
                        <div className="space-y-2">
                          {queueState.queue.map((song, index) => (
                            <div key={song.id} 
                              className="flex items-center space-x-3 p-3 rounded-md bg-gray-700 hover:bg-gray-600 transition">
                              <div className="flex-shrink-0 font-semibold text-gray-400">
                                {index + 1}
                              </div>
                              <div className="relative w-10 h-10 rounded-md overflow-hidden flex-shrink-0">
                                {song.thumbnailUrl ? (
                                  <img 
                                    src={song.thumbnailUrl} 
                                    alt={song.title || 'Video thumbnail'}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <Avatar>
                                    <AvatarImage src={song.requesterAvatar} alt={song.requester} />
                                    <AvatarFallback>{song.requester.slice(0, 2).toUpperCase()}</AvatarFallback>
                                  </Avatar>
                                )}
                              </div>
                              <div className="flex-grow min-w-0">
                                <p className="font-medium text-white truncate flex items-center gap-1">
                                  {song.title || song.youtubeUrl}
                                  {song.source === 'youtube' && (
                                    <Youtube size={14} className="text-red-500 flex-shrink-0" />
                                  )}
                                </p>
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
                                  <Badge variant="outline" className="text-xs font-normal">
                                    {song.artist || 'Unknown Artist'}
                                  </Badge>
                                  <span className="text-xs text-gray-400">
                                    {song.duration || '?:??'}
                                  </span>
                                  <span className="text-xs text-gray-400">
                                    by {song.requester}
                                  </span>
                                </div>
                              </div>
                              <div className="flex space-x-1 flex-shrink-0">
                                <Button variant="ghost" size="sm" 
                                  onClick={() => handlePrioritize(song.id)}
                                  title="Prioritize">
                                  <Star size={16} className="text-yellow-400" />
                                </Button>
                                <Button variant="ghost" size="sm" 
                                  onClick={() => handlePlaySong(song)}
                                  title="Play Now">
                                  <Play size={16} className="text-green-400" />
                                </Button>
                                <Button variant="ghost" size="sm" 
                                  onClick={() => {
                                    if (navigator.clipboard) {
                                      navigator.clipboard.writeText(song.youtubeUrl)
                                        .then(() => {
                                          toast({
                                            title: "URL Copied",
                                            description: "YouTube URL copied to clipboard",
                                          });
                                        })
                                        .catch(err => {
                                          console.error('Failed to copy: ', err);
                                          toast({
                                            title: "Error",
                                            description: "Failed to copy URL to clipboard",
                                          });
                                        });
                                    }
                                  }}
                                  title="Copy URL">
                                  <LinkIcon size={16} className="text-blue-400" />
                                </Button>
                                <Button variant="ghost" size="sm" 
                                  onClick={() => handleRemoveSong(song.id)}
                                  title="Remove from Queue">
                                  <Trash2 size={16} className="text-red-400" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* History Tab */}
              <TabsContent value="history">
                <Card className="bg-gray-800 border-gray-700">
                  <CardHeader>
                    <CardTitle className="text-white text-lg">Song History</CardTitle>
                    <CardDescription className="text-gray-400">
                      Recently played songs
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {queueState.history.length === 0 ? (
                      <div className="text-center py-8 text-gray-400">
                        No song history yet
                      </div>
                    ) : (
                      <ScrollArea className="h-[400px]">
                        <div className="space-y-2">
                          {queueState.history.map((song) => (
                            <div key={song.id} 
                              className="flex items-center space-x-3 p-3 rounded-md bg-gray-700">
                              <div className="relative w-10 h-10 rounded-md overflow-hidden flex-shrink-0">
                                {song.thumbnailUrl ? (
                                  <img 
                                    src={song.thumbnailUrl} 
                                    alt={song.title || 'Video thumbnail'}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <Avatar className="flex-shrink-0">
                                    <AvatarImage src={song.requesterAvatar} alt={song.requester} />
                                    <AvatarFallback>{song.requester.slice(0, 2).toUpperCase()}</AvatarFallback>
                                  </Avatar>
                                )}
                              </div>
                              <div className="flex-grow min-w-0">
                                <p className="font-medium text-white truncate flex items-center gap-1">
                                  {song.title || song.youtubeUrl}
                                  {song.source === 'youtube' && (
                                    <Youtube size={14} className="text-red-500 flex-shrink-0" />
                                  )}
                                </p>
                                <div className="flex items-center mt-1">
                                  <Badge variant="outline" className="mr-2 text-xs">
                                    {song.artist || 'Unknown Artist'}
                                  </Badge>
                                  <span className="text-xs text-gray-400">
                                    Requested by {song.requester}
                                  </span>
                                </div>
                              </div>
                              <Button variant="ghost" size="sm" 
                                onClick={() => {
                                  if (!socket) return;
                                  socket.emit('addSong', song);
                                  toast({
                                    title: "Added to Queue",
                                    description: `${song.title || 'Song'} added back to queue`,
                                  });
                                }}
                                title="Add back to queue">
                                <Play size={16} className="text-green-400" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Users Tab */}
              <TabsContent value="users">
                <Card className="bg-gray-800 border-gray-700">
                  <CardHeader>
                    <CardTitle className="text-white text-lg">Blocked Users</CardTitle>
                    <CardDescription className="text-gray-400">
                      Manage users who can't make requests
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleBlockUser} className="mb-6 space-y-4">
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 items-end">
                        <div className="sm:col-span-1">
                          <Label htmlFor="username" className="text-white">Username</Label>
                          <Input 
                            id="username"
                            value={newBlockUsername}
                            onChange={(e) => setNewBlockUsername(e.target.value)}
                            placeholder="Twitch username" 
                            className="bg-gray-700 border-gray-600 text-white"
                          />
                        </div>
                        <div className="sm:col-span-1">
                          <Label htmlFor="reason" className="text-white">Reason (optional)</Label>
                          <Input 
                            id="reason"
                            value={blockReason}
                            onChange={(e) => setBlockReason(e.target.value)}
                            placeholder="Reason for blocking" 
                            className="bg-gray-700 border-gray-600 text-white"
                          />
                        </div>
                        <div className="sm:col-span-1">
                          <Button type="submit" className="w-full">
                            <UserX size={16} className="mr-2" />
                            Block User
                          </Button>
                        </div>
                      </div>
                    </form>

                    {blockedUsers.length === 0 ? (
                      <div className="text-center py-8 text-gray-400">
                        No blocked users
                      </div>
                    ) : (
                      <ScrollArea className="h-[300px]">
                        <div className="space-y-2">
                          {blockedUsers.map((blockedUser) => (
                            <div key={blockedUser.username} 
                              className="flex items-center justify-between p-3 rounded-md bg-gray-700">
                              <div>
                                <div className="font-medium text-white">{blockedUser.username}</div>
                                <div className="text-sm text-gray-400">
                                  {blockedUser.reason}
                                </div>
                                <div className="text-xs text-gray-500">
                                  Blocked on {new Date(blockedUser.blockedAt).toLocaleDateString()}
                                </div>
                              </div>
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={() => handleUnblockUser(blockedUser.username)}
                                className="text-red-400 hover:text-red-300 hover:bg-gray-600">
                                Unblock
                              </Button>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Blacklist Tab */}
              <TabsContent value="blacklist">
                <Card className="bg-gray-800 border-gray-700">
                  <CardHeader>
                    <CardTitle className="text-white text-lg">Content Blacklist</CardTitle>
                    <CardDescription className="text-gray-400">
                      Block specific songs, artists, or keywords
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleAddToBlacklist} className="mb-6 space-y-4">
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4 items-end">
                        <div className="sm:col-span-2">
                          <Label htmlFor="blockedTerm" className="text-white">Term to Block</Label>
                          <Input 
                            id="blockedTerm"
                            value={newBlockedTerm}
                            onChange={(e) => setNewBlockedTerm(e.target.value)}
                            placeholder="Song title, artist, or keyword" 
                            className="bg-gray-700 border-gray-600 text-white"
                          />
                        </div>
                        <div className="sm:col-span-1">
                          <Label htmlFor="blockType" className="text-white">Type</Label>
                          <Select 
                            defaultValue="keyword" 
                            onValueChange={(value) => setNewBlockedType(value as 'song' | 'artist' | 'keyword')}
                          >
                            <SelectTrigger className="bg-gray-700 text-white border-gray-600">
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                            <SelectContent className="bg-gray-700 text-white border-gray-600">
                              <SelectItem value="song">Song</SelectItem>
                              <SelectItem value="artist">Artist</SelectItem>
                              <SelectItem value="keyword">Keyword</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="sm:col-span-1">
                          <Button type="submit" className="w-full">
                            Add to Blacklist
                          </Button>
                        </div>
                      </div>
                      <div>
                        <Label htmlFor="blacklistReason" className="text-white">Reason (optional)</Label>
                        <Input 
                          id="blacklistReason"
                          value={blacklistReason}
                          onChange={(e) => setBlacklistReason(e.target.value)}
                          placeholder="Reason for blocking"
                          className="bg-gray-700 border-gray-600 text-white"
                        />
                      </div>
                    </form>

                    {blacklist.length === 0 ? (
                      <div className="text-center py-8 text-gray-400">
                        No blacklisted content
                      </div>
                    ) : (
                      <ScrollArea className="h-[300px]">
                        <div className="space-y-2">
                          {blacklist.map((item) => (
                            <div key={`${item.type}-${item.term}`} 
                              className="flex items-center justify-between p-3 rounded-md bg-gray-700">
                              <div>
                                <div className="flex items-center gap-2">
                                  <Badge variant={item.type === 'song' ? 'default' : 
                                          item.type === 'artist' ? 'secondary' : 'outline'}>
                                    {item.type}
                                  </Badge>
                                  <span className="font-medium text-white">{item.term}</span>
                                </div>
                                <div className="text-sm text-gray-400 mt-1">
                                  {item.reason}
                                </div>
                                <div className="text-xs text-gray-500">
                                  Blocked on {new Date(item.blockedAt).toLocaleDateString()}
                                </div>
                              </div>
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={() => handleRemoveFromBlacklist(item.term)}
                                className="text-red-400 hover:text-red-300 hover:bg-gray-600">
                                Remove
                              </Button>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>

          {/* Right Column - Controls */}
          <div className="space-y-6">
            {/* Add Song Form */}
            <Card className="bg-gray-800 border-gray-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Music size={18} />
                  Add Song to Queue
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <Label htmlFor="videoUrl" className="text-white">YouTube URL</Label>
                    <Input
                      id="videoUrl"
                      type="text"
                      placeholder="https://www.youtube.com/watch?v=..."
                      value={videoUrl}
                      onChange={(e) => setVideoUrl(e.target.value)}
                      className="bg-gray-700 text-white border-gray-600"
                    />
                  </div>
                  <div>
                    <Label htmlFor="priority" className="text-white">Priority</Label>
                    <Select 
                      defaultValue="normal" 
                      onValueChange={(value) => setPriority(value as 'high' | 'normal' | 'low')}
                    >
                      <SelectTrigger className="bg-gray-700 text-white border-gray-600">
                        <SelectValue placeholder="Select priority" />
                      </SelectTrigger>
                      <SelectContent className="bg-gray-700 text-white border-gray-600">
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="low">Low</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button type="submit" className="w-full">Add to Queue</Button>
                </form>
              </CardContent>
            </Card>

            {/* Statistics */}
            <Card className="bg-gray-800 border-gray-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <BarChart2 size={18} />
                  Queue Statistics
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-700 p-4 rounded-lg text-center">
                    <p className="text-xs text-gray-400">In Queue</p>
                    <p className="text-2xl font-bold text-white">{queueState.queue.length}</p>
                  </div>
                  <div className="bg-gray-700 p-4 rounded-lg text-center">
                    <p className="text-xs text-gray-400">Songs Played</p>
                    <p className="text-2xl font-bold text-white">{queueState.history.length}</p>
                  </div>
                  <div className="bg-gray-700 p-4 rounded-lg text-center">
                    <p className="text-xs text-gray-400">Blocked Users</p>
                    <p className="text-2xl font-bold text-white">{blockedUsers.length}</p>
                  </div>
                  <div className="bg-gray-700 p-4 rounded-lg text-center">
                    <p className="text-xs text-gray-400">Blacklisted Terms</p>
                    <p className="text-2xl font-bold text-white">{blacklist.length}</p>
                  </div>
                </div>

                {queueState.queue.length > 0 && (
                  <div className="mt-4">
                    <h3 className="text-sm font-medium text-white mb-2">Top Requesters</h3>
                    <div className="space-y-2">
                      {getTopRequesters().map((item, index) => (
                        <div key={index} className="flex items-center justify-between bg-gray-700 p-2 rounded-md">
                          <div className="flex items-center gap-2">
                            <span className="text-gray-400">{index + 1}.</span>
                            <span className="text-white">{item.requester}</span>
                          </div>
                          <Badge variant="outline">{item.count} songs</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Settings */}
            <Card className="bg-gray-800 border-gray-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Settings size={18} />
                  Queue Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="autoplay" className="text-white">Autoplay Next Song</Label>
                    <Switch 
                      id="autoplay" 
                      checked={isAutoplay}
                      onCheckedChange={handleAutoplayChange}
                    />
                  </div>
                  <p className="text-xs text-gray-400">
                    Automatically play the next song in queue
                  </p>
                </div>

                <div className="space-y-2">
                  <div>
                    <Label className="text-white">Maximum Song Duration</Label>
                    <div className="flex items-center space-x-2 mt-2">
                      <Slider 
                        defaultValue={[maxSongDuration]} 
                        max={15}
                        min={1}
                        step={1}
                        onValueChange={handleMaxDurationChange}
                      />
                      <span className="w-12 text-right text-white">{maxSongDuration} min</span>
                    </div>
                  </div>
                  <p className="text-xs text-gray-400">
                    Maximum allowed song duration in minutes
                  </p>
                </div>

                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="destructive" className="w-full">
                      <AlertTriangle size={16} className="mr-2" />
                      Reset System
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="bg-gray-800 text-white border-gray-700">
                    <DialogHeader>
                      <DialogTitle>Reset Song Request System?</DialogTitle>
                      <DialogDescription className="text-gray-400">
                        This will clear all songs from the queue, history, and stop the currently playing song.
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => {}}>Cancel</Button>
                      <Button 
                        variant="destructive" 
                        onClick={() => {
                          if (!socket) return;
                          socket.emit('resetSystem');
                          toast({
                            title: "System Reset",
                            description: "Song request system has been reset",
                          });
                        }}
                      >
                        Reset System
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
      <Toaster />
    </div>
  )
}

