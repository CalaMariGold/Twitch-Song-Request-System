"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import SongRequestQueue from "@/components/SongRequestQueue"
import AnimatedBackground from "@/components/AnimatedBackground"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { BarChart2 } from "lucide-react"
import { io, Socket } from "socket.io-client"
import { SongRequest, QueueState } from "@/lib/types"

export default function PublicDashboard() {
  const [queueState, setQueueState] = useState<QueueState>({
    queue: [],
    history: [],
    activeSong: null,
    isLoading: true,
    error: null
  })
  const [socket, setSocket] = useState<Socket | null>(null)
  const [isConnected, setIsConnected] = useState(false) // Optional: For showing connection status

  // Socket Connection & State Fetching
  useEffect(() => {
    const socketInstance = io(process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3002')
    
    socketInstance.on('connect', () => {
      setIsConnected(true)
      console.log('Connected to Socket.IO server (Public Page)')
    })
    
    socketInstance.on('disconnect', () => {
      setIsConnected(false)
      console.log('Disconnected from Socket.IO server (Public Page)')
    })
    
    socketInstance.on('queueUpdate', (queue: SongRequest[]) => {
      setQueueState((prev: QueueState) => ({ ...prev, queue, isLoading: false }))
    })
    
    socketInstance.on('activeSong', (song: SongRequest | null) => {
      setQueueState((prev: QueueState) => ({ ...prev, activeSong: song, isLoading: false }))
    })
    
    socketInstance.on('historyUpdate', (history: SongRequest[]) => {
      setQueueState((prev: QueueState) => ({ ...prev, history, isLoading: false }))
    })
    
    socketInstance.on('songFinished', (finishedSong: SongRequest) => {
      console.log('Song finished and moved to history:', finishedSong.title)
      // The server will also send historyUpdate so we don't need to update history directly here
    })
    
    // Handle initial state - critical for loading history correctly on first connection
    socketInstance.on('initialState', (initialState: any) => {
      console.log('Received initial state on public page:', 
        `Queue: ${initialState.queue?.length || 0} items, ` +
        `History: ${initialState.history?.length || 0} items`
      )
      setQueueState(prev => ({
        ...prev,
        queue: initialState.queue || [],
        history: initialState.history || [],
        activeSong: initialState.activeSong,
        isLoading: false
      }))
    })
    
    // Request initial state
    socketInstance.emit('getState')
    
    setSocket(socketInstance)
    
    return () => {
      socketInstance.disconnect()
    }
  }, [])

  // --- Helper Function ---
  const formatDuration = (totalSeconds: number): string => {
    if (isNaN(totalSeconds) || totalSeconds < 0) {
      return '?:??'; // Return placeholder if duration is invalid
    }
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);
  
    const minutesStr = String(minutes).padStart(2, '0');
    const secondsStr = String(seconds).padStart(2, '0');
  
    if (hours > 0) {
      return `${hours}:${minutesStr}:${secondsStr}`;
    } else {
      return `${minutesStr}:${secondsStr}`;
    }
  };

  // Calculate total queue duration
  const totalQueueSeconds = queueState.queue.reduce((sum: number, song: SongRequest) => {
    // Use song.durationSeconds if available, otherwise default to 0 or a reasonable estimate
    return sum + (song.durationSeconds || 0); 
  }, 0);
  const totalQueueDurationFormatted = formatDuration(totalQueueSeconds);
  // --- End Helper ---

  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex flex-col items-center p-8">
      <AnimatedBackground />
      <div className="w-full max-w-6xl mx-auto relative z-10">
        <div className="flex justify-end mb-4">
          <Link href="/admin">
            <Button variant="outline">Admin Panel</Button>
          </Link>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Main Content: Queue */}
          <div className="md:col-span-2">
            <SongRequestQueue />
          </div>

          {/* Side Panel: Statistics */}
          <div className="md:col-span-1 space-y-6">
            <Card className="bg-gray-800/80 border-gray-700 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <BarChart2 size={18} />
                  Queue Statistics
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {queueState.isLoading ? (
                  <div className="text-center py-4 text-gray-400">Loading stats...</div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-gray-700/70 p-4 rounded-lg text-center">
                      <p className="text-xs text-gray-400">In Queue</p>
                      <p className="text-2xl font-bold text-white">{queueState.queue.length}</p>
                    </div>
                    <div className="bg-gray-700/70 p-4 rounded-lg text-center">
                      <p className="text-xs text-gray-400">Total Duration</p>
                      <p className="text-2xl font-bold text-white">{totalQueueDurationFormatted}</p>
                    </div>
                    <div className="bg-gray-700/70 p-4 rounded-lg text-center">
                      <p className="text-xs text-gray-400">Songs Played</p>
                      <p className="text-2xl font-bold text-white">{queueState.history.length}</p>
                    </div>
                  </div>
                )}
                 {/* Optional: Add connection status indicator here */}
                 {/* <p className={`text-xs text-right ${isConnected ? 'text-green-500' : 'text-red-500'}`}>{isConnected ? 'Connected' : 'Disconnected'}</p> */}
              </CardContent>
            </Card>
            {/* You could add more cards here later, e.g., Active Song */}
          </div>
        </div>
      </div>
    </main>
  )
}

