"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import SongRequestQueue from "@/components/SongRequestQueue"
import AnimatedBackground from "@/components/AnimatedBackground"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { BarChart2, Clock } from "lucide-react"
import { io, Socket } from "socket.io-client"
import { SongRequest, QueueState, AllTimeStats } from "@/lib/types"
import { StatisticsCard } from "@/components/StatisticsCard"
import { formatDuration, calculateTotalQueueDuration } from "@/lib/utils"

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
  const [allTimeStats, setAllTimeStats] = useState<AllTimeStats | null>(null)
  const [isLoadingStats, setIsLoadingStats] = useState(true)
  

  // Socket Connection & State Fetching
  useEffect(() => {
    const socketInstance = io(process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3002')
    
    socketInstance.on('connect', () => {
      setIsConnected(true)
      console.log('Connected to Socket.IO server (Public Page)')
      socketInstance.emit('getAllTimeStats')
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
    
    // Handle statistics updates
    socketInstance.on('allTimeStatsUpdate', (stats: AllTimeStats) => {
      console.log('Public: Received all-time stats')
      setAllTimeStats(stats)
      setIsLoadingStats(false)
    })

    socketInstance.on('allTimeStatsError', (error: { message: string }) => {
      console.error('Public: Failed to load all-time stats:', error.message)
      setIsLoadingStats(false)
    })
    
    // Request initial state
    socketInstance.emit('getState')
    
    setSocket(socketInstance)
    
    return () => {
      socketInstance.disconnect()
    }
  }, [])

  // Calculate total queue duration
  const { totalSeconds: totalQueueSeconds, formatted: totalQueueDurationFormatted } = calculateTotalQueueDuration(queueState.queue)

  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex flex-col items-center p-8">
      <AnimatedBackground />
      <div className="w-full max-w-6xl mx-auto relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {/* Main Content Area (3/4 width) */}
          <div className="md:col-span-3 space-y-6">
            {/* Song Request Queue */}
            <SongRequestQueue />
            
            {/* All-Time Stats Card - Moved under the queue */}
            <StatisticsCard 
              isLoading={isLoadingStats}
              stats={allTimeStats}
              includeRequesters={true}
              title="All-Time Statistics"
              description="Overall system usage stats."
              className="bg-gray-800/80 border-gray-700 backdrop-blur-sm"
              heightClass="h-[220px]"
            />
          </div>

          {/* Side Panel: Queue Statistics (1/4 width) */}
          <div className="md:col-span-1">
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
                  <div className="grid grid-cols-1 gap-4">
                    <div className="bg-gray-700/70 p-4 rounded-lg text-center">
                      <p className="text-xs text-gray-400">In Queue</p>
                      <p className="text-2xl font-bold text-white">{queueState.queue.length}</p>
                    </div>
                    <div className="bg-gray-700/70 p-4 rounded-lg text-center">
                      <p className="text-xs text-gray-400">Total Duration</p>
                      <p className="text-2xl font-bold text-white flex items-center justify-center">
                        <Clock className="inline-block mr-2" size={20} />
                        {totalQueueDurationFormatted}
                      </p>
                    </div>
                    <div className="bg-gray-700/70 p-4 rounded-lg text-center">
                      <p className="text-xs text-gray-400">Songs Played</p>
                      <p className="text-2xl font-bold text-white">{queueState.history.length}</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </main>
  )
}

