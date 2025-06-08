"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import Image from "next/image"
import SongRequestQueue from "@/components/SongRequestQueue"
import AnimatedBackground from "@/components/AnimatedBackground"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { BarChart2, Clock, DollarSign, Star, AlertTriangle, Gift, ExternalLink } from "lucide-react"
import { io, Socket } from "socket.io-client"
import { SongRequest, QueueState, AllTimeStats } from "@/lib/types"
import { StatisticsCard } from "@/components/StatisticsCard"
import { formatDuration, calculateTotalQueueDuration } from "@/lib/utils"
import React from "react"
import Footer from "@/components/Footer"

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
  const [totalQueueCount, setTotalQueueCount] = useState(0)
  const [totalHistoryCount, setTotalHistoryCount] = useState(0)
  const [songsPlayedToday, setSongsPlayedToday] = useState(0)
  

  // Socket Connection & State Fetching
  useEffect(() => {
    const socketHost = process.env.NEXT_PUBLIC_SOCKET_URL || '';
    let connectionAttempts = 0;
    
    const socketInstance = io(socketHost, {
      transports: ['polling', 'websocket'], // Try polling first, then upgrade to websocket
      path: '/socket.io/',
      timeout: 20000, // Increase timeout
      forceNew: true,
      autoConnect: true,
      upgrade: true,
      reconnectionAttempts: 5
    })
    
    socketInstance.on('connect', () => {
      setIsConnected(true)
      console.log('Connected to Socket.IO server (Public Page)')
      socketInstance.emit('getAllTimeStats')
    })
    
    socketInstance.on('disconnect', () => {
      setIsConnected(false)
      console.log('Disconnected from Socket.IO server (Public Page)')
    })
    
    socketInstance.on('connect_error', (error) => {
      console.error('Socket connection error (Public Page):', error)
      connectionAttempts++;
      
      // If first attempt fails, try with websocket only
      if (connectionAttempts === 1) {
        console.log('First connection attempt failed, trying with websocket only...')
        socketInstance.io.opts.transports = ['websocket']
      }
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
    
    // Add listener for history order changes
    socketInstance.on('historyOrderChanged', () => {
      console.log('Public page: History order changed signal received')
      // No need to do anything here as we'll get a historyUpdate event with the new order
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
    
    // Listen for total count updates
    socketInstance.on('totalCountsUpdate', (counts: { history: number; queue: number }) => {
      console.log('Public: Received total counts:', counts);
      setTotalHistoryCount(counts.history);
      setTotalQueueCount(counts.queue);
    });
    
    // Listen for today's count update
    socketInstance.on('todaysCountUpdate', (data: { count: number }) => {
      console.log('Public: Received today\'s count:', data);
      setSongsPlayedToday(data.count);
    });
    
    // Request initial state
    socketInstance.emit('getState')
    
    setSocket(socketInstance)
    
    return () => {
      // Clean up count listener
      socketInstance.off('totalCountsUpdate');
      socketInstance.off('todaysCountUpdate');
      socketInstance.off('historyOrderChanged');
      socketInstance.disconnect()
    }
  }, [])

  // Calculate total queue duration
  const { totalSeconds: totalQueueSeconds, formatted: totalQueueDurationFormatted } = calculateTotalQueueDuration(queueState.queue)

  const twitchChannel = "calamarigold"
  
  // --- Logic to extract hostname for Twitch parent parameter ---
  let parentHostname = "localhost"; // Default for local development
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (appUrl) {
    try {
      const urlObject = new URL(appUrl);
      parentHostname = urlObject.hostname; // Extract just the hostname (e.g., "mydomain.com")
    } catch (error) {
      console.warn(`Invalid NEXT_PUBLIC_APP_URL ("${appUrl}"). Defaulting Twitch parent to "localhost". Error: ${error}`);
      // Keep the default "localhost"
    }
  }
  // IMPORTANT: For deployment, ensure NEXT_PUBLIC_APP_URL is set correctly in your environment variables.
  // If deploying to multiple domains/subdomains, you might need multiple parent parameters.
  // Example: &parent=yourdomain.com&parent=www.yourdomain.com
  // Currently, this code only supports a single parent derived from NEXT_PUBLIC_APP_URL.
  // --- End of hostname extraction logic ---
  
  const twitchEmbedSrc = `https://player.twitch.tv/?channel=${twitchChannel}&parent=${parentHostname}&autoplay=false&muted=true`;

  return (
    <main className="min-h-screen flex flex-col items-center p-8 pt-4"> {/* Reduced top padding slightly */}
      <AnimatedBackground />
      <div className="w-full max-w-6xl mx-auto relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {/* Main Content Area (3/4 width) */}
          <div className="md:col-span-3 space-y-6">

            {/* Twitch Embed */}
            <div className="w-full aspect-video bg-black rounded-lg overflow-hidden shadow-lg border border-brand-purple-neon/20 shadow-glow-purple-sm mb-6"> 
              <iframe
                src={twitchEmbedSrc}
                height="100%"
                width="100%"
                allowFullScreen={true}
                title={`Twitch Player for ${twitchChannel}`}
                className="border-0"
              >
              </iframe>
            </div>

            {/* Song Request Queue */}
            <React.Suspense fallback={<div className="h-[600px] rounded-lg bg-brand-purple-deep/50 animate-pulse"></div>}>
              <SongRequestQueue />
            </React.Suspense>
            
            {/* All-Time Stats Card - Moved under the queue */}
            <StatisticsCard 
              isLoading={isLoadingStats}
              stats={allTimeStats}
              includeRequesters={true}
              title="All-Time Statistics"
              description="Overall system usage stats."
              // Use brand colors, add blur and subtle glow
              className="bg-brand-purple-deep/70 border-brand-purple-neon/30 backdrop-blur-md shadow-glow-purple-sm"
              heightClass="h-[220px]"
            />
          </div>

          {/* Side Panel: Queue Statistics (1/4 width) */}
          <div className="md:col-span-1 space-y-6">

            {/* ShinyFest Poster Card */}
            <Card className="bg-gradient-to-br from-brand-pink-light/80 to-brand-pink-dark/80 border-brand-pink-neon/40 backdrop-blur-md shadow-glow-pink-md hover:shadow-glow-pink-lg transition-all duration-300 ease-in-out hover:scale-[1.01]">
              <a href="https://calamarigold-shop.fourthwall.com/products/shinyfest-2025-concert-poster" target="_blank" rel="noopener noreferrer" className="block hover:opacity-90 transition-opacity">
                <CardContent className="p-1 flex flex-col items-center text-center">
                  <div className="relative w-full aspect-[5/7] mb-0 border-2 border-brand-pink-neon/30 rounded-md overflow-hidden shadow-inner shadow-brand-black/30">
                    <Image 
                      src="/shinyfest 2025 poster.png" 
                      alt="ShinyFest 2025 Poster" 
                      fill
                      className="object-cover"
                      priority
                      quality={100}
                    />
                  </div>
                  <p className="text-[11px] font-semibold text-white leading-snug pt-1 [text-shadow:1px_1px_3px_black]">
                    ShinyFest 2025 poster now available for sale!
                  </p>
                </CardContent>
              </a>
            </Card>

            {/* How to Request Card */}
            <Card className="bg-brand-purple-deep/70 border-brand-purple-neon/30 backdrop-blur-md shadow-glow-purple-sm">
              <CardHeader className="pb-2 pt-3"> {/* Adjust header padding */}
                <CardTitle className="text-brand-pink-light flex items-center gap-2 text-glow-pink">
                  <Gift size={18} />
                  How to Request
                </CardTitle>
              </CardHeader>
              {/* Adjusted CardContent for cleaner look */}
              <CardContent className="space-y-3 px-3 pb-3 pt-1 text-sm"> {/* Adjust content padding */}
                {/* Donation Section */}
                <div className="space-y-1.5"> {/* Slightly reduce spacing */}
                  <h4 className="font-semibold text-white flex items-center gap-1.5 pt-1"> {/* Add padding top to move header effectively up */}
                    <DollarSign size={16} className="text-green-400"/> Priority Request (Donation)
                  </h4>
                  <p className="text-brand-purple-light/90 text-xs">
                    IMPORTANT: Include the YouTube link, Spotify link, OR Artist & Song Title in your donation message.
                  </p>
                  {/* Add margin top/bottom to the link/button wrapper */}
                  <a 
                    href="https://streamelements.com/calamarigold/tip" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="block my-3.0" /* Added margin */
                  >
                    <Button 
                      variant="default" 
                      size="sm" 
                      className="w-full bg-gradient-to-r from-brand-pink-light to-brand-pink-neon text-brand-black font-bold hover:opacity-90 transition-opacity shadow-md hover:shadow-glow-pink-lg text-glow-white-xs transition-transform duration-200 hover:scale-[1.02]"
                    >
                      Tip Here to Request <ExternalLink size={14} className="ml-1.5" />
                    </Button>
                  </a>
                  <ul className="list-disc list-inside text-brand-purple-light/80 space-y-0.5 pl-1 text-xs">
                    <li>Donations get queue priority!</li>
                    <li>Songs less than 5 min: $5</li>
                    <li>Songs greater than 5 min: $10</li>
                    <li>Max 10 min duration</li>
                  </ul>
                </div>

                <hr className="border-brand-purple-dark/50" />

                {/* Channel Points Section */}
                <div className="space-y-1">
                   <h4 className="font-semibold text-white flex items-center gap-1.5">
                     <Star size={16} className="text-yellow-400" /> Channel Point Request
                   </h4>
                   <p className="text-brand-purple-light/90 text-xs">
                     Redeem the 'Request a Song!' reward on Twitch to add a song to the end of the queue.
                   </p>
                </div>
                
                <hr className="border-brand-purple-dark/50" />

                {/* Song Rules Section */}
                <div className="space-y-1">
                   <h4 className="font-semibold text-white flex items-center gap-1.5">
                     <AlertTriangle size={16} className="text-red-400" /> Song Rules
                   </h4>
                   <ul className="list-disc list-inside text-brand-purple-light/80 space-y-0.5 pl-1 text-xs">
                    <li>No Deathcore</li>
                    <li>No Jazz</li>
                    <li>No YouTuber/Fandom songs (ie FNAF)</li>
                    <li>No AI-Generated Music</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            {/* Queue Statistics Card - Use brand colors, add blur and subtle glow */}
            <Card className="bg-brand-purple-deep/70 border-brand-purple-neon/30 backdrop-blur-md shadow-glow-purple-sm">
              <CardHeader>
                <CardTitle className="text-brand-pink-light flex items-center gap-2 text-glow-pink">
                  <BarChart2 size={18} />
                  Queue Statistics
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {queueState.isLoading ? (
                  <div className="text-center py-4 text-brand-purple-light/80">Loading stats...</div>
                ) : (
                  <div className="grid grid-cols-1 gap-4">
                    {/* Update stat item backgrounds */}
                    <div className="bg-brand-purple-dark/50 p-4 rounded-lg text-center border border-brand-purple-neon/20">
                      <p className="text-xs text-brand-purple-light/80">In Queue</p>
                      <p className="text-2xl font-bold text-white">{totalQueueCount}</p>
                    </div>
                    <div className="bg-brand-purple-dark/50 p-4 rounded-lg text-center border border-brand-purple-neon/20">
                      <p className="text-xs text-brand-purple-light/80">Total Duration</p>
                      <p className="text-2xl font-bold text-white flex items-center justify-center">
                        <Clock className="inline-block mr-2" size={20} />
                        {totalQueueDurationFormatted}
                      </p>
                    </div>
                    <div className="bg-brand-purple-dark/50 p-4 rounded-lg text-center border border-brand-purple-neon/20">
                      <p className="text-xs text-brand-purple-light/80">Songs Played Today</p>
                      <p className="text-2xl font-bold text-white">{songsPlayedToday}</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
      <Footer />
    </main>
  )
}

