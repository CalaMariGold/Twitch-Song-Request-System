"use client"

import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import Image from "next/image"
import SongRequestQueue from "@/components/SongRequestQueue/SongRequestQueue"
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
import QueueStatisticsCard from "@/components/QueueStatisticsCard";
import HowToRequestCard from "@/components/HowToRequestCard";
import PosterCard from "@/components/PosterCard";
import HistoryStatisticsCard from "@/components/HistoryStatisticsCard";

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
  const [historyStats, setHistoryStats] = useState({
    totalDurationFormatted: "-",
    averageDurationFormatted: "-",
    totalDuration: 0,
    averageDuration: 0,
    donationCount: 0,
    channelPointCount: 0,
    totalHistory: 0,
  });
  const [playerError, setPlayerError] = useState(false);
  const playerRef = useRef<HTMLIFrameElement>(null);
  

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
      socketInstance.emit('getAllTimeStats')
    })
    
    socketInstance.on('disconnect', () => {
      setIsConnected(false)
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
      // The server will also send historyUpdate so we don't need to update history directly here
    })
    
    // Add listener for history order changes
    socketInstance.on('historyOrderChanged', () => {
      // No need to do anything here as we'll get a historyUpdate event with the new order
    })
    
    // Handle initial state - critical for loading history correctly on first connection
    socketInstance.on('initialState', (initialState: any) => {
      setQueueState(prev => ({
        ...prev,
        queue: initialState.queue || [],
        history: initialState.history || [],
        activeSong: initialState.activeSong,
        isLoading: false
      }))
      if (initialState.historyStats) {
        setHistoryStats({
          totalDurationFormatted: initialState.historyStats.totalDurationFormatted,
          averageDurationFormatted: initialState.historyStats.averageDurationFormatted,
          totalDuration: initialState.historyStats.totalDuration,
          averageDuration: initialState.historyStats.averageDuration,
          donationCount: initialState.historyStats.donationCount,
          channelPointCount: initialState.historyStats.channelPointCount,
          totalHistory: initialState.history?.length || 0,
        });
      }
    })
    
    // Handle statistics updates
    socketInstance.on('allTimeStatsUpdate', (stats: AllTimeStats) => {
      setAllTimeStats(stats)
      setIsLoadingStats(false)
    })

    socketInstance.on('allTimeStatsError', (error: { message: string }) => {
      setIsLoadingStats(false)
    })
    
    // Listen for total count updates
    socketInstance.on('totalCountsUpdate', (counts: { history: number; queue: number }) => {
      setTotalHistoryCount(counts.history);
      setTotalQueueCount(counts.queue);
    });
    
    // Listen for today's count update
    socketInstance.on('todaysCountUpdate', (data: { count: number }) => {
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
            <div className="w-full aspect-video bg-black rounded-lg overflow-hidden shadow-lg border border-brand-purple-neon/20 mb-6 relative" role="region" aria-label="Twitch Stream Player">
              <iframe
                ref={playerRef}
                src={twitchEmbedSrc}
                height="100%"
                width="100%"
                allowFullScreen={true}
                title={`Twitch Player for ${twitchChannel}`}
                aria-label={`Twitch Player for ${twitchChannel}`}
                className="border-0"
                loading="lazy"
                sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                allow="autoplay; fullscreen; picture-in-picture"
                onError={() => setPlayerError(true)}
                tabIndex={0}
              />
              {playerError && (
                <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-80 text-white z-10 rounded-lg">
                  Failed to load Twitch player. Please check your connection or disable adblockers.
                </div>
              )}
              <noscript>
                <div className="absolute inset-0 flex items-center justify-center bg-black text-white rounded-lg">
                  Twitch player requires JavaScript enabled.
                </div>
              </noscript>
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
              description="Request stats since 4/25/2025."
              // Use brand colors, add blur and subtle glow
              className="bg-brand-purple-deep/70 border-brand-purple-neon/30 backdrop-blur-md shadow-glow-purple-sm"
              heightClass="h-[220px]"
            />
          </div>

          {/* Side Panel: Queue Statistics (1/4 width) */}
          <div className="md:col-span-1 space-y-6">

            {/* ShinyFest Poster Card */}
            <PosterCard />

            {/* How to Request Card */}
            <HowToRequestCard />

            {/* Queue Statistics Card - Use brand colors, add blur and subtle glow */}
            <QueueStatisticsCard
              isLoading={queueState.isLoading}
              totalQueueCount={totalQueueCount}
              totalQueueDurationFormatted={totalQueueDurationFormatted}
              songsPlayedToday={songsPlayedToday}
            />
            <HistoryStatisticsCard
              totalHistory={totalHistoryCount}
              totalHistoryDuration={historyStats.totalDurationFormatted}
              averageSongDuration={historyStats.averageDurationFormatted}
              donationCount={historyStats.donationCount}
              channelPointCount={historyStats.channelPointCount}
            />
          </div>
        </div>
      </div>
      <Footer />
    </main>
  )
}

