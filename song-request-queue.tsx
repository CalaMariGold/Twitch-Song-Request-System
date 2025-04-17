"use client"

import { useState, useEffect } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Search, Music, Clock, History } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"

interface Song {
  id: string
  title: string
  artist: string
  requester: string
  requesterAvatar: string
  duration: string
}

const mockQueue: Song[] = [
  {
    id: "1",
    title: "Bohemian Rhapsody",
    artist: "Queen",
    requester: "FanOfQueen",
    requesterAvatar: "/placeholder.svg?height=32&width=32",
    duration: "5:55",
  },
  {
    id: "2",
    title: "Stairway to Heaven",
    artist: "Led Zeppelin",
    requester: "RockLover",
    requesterAvatar: "/placeholder.svg?height=32&width=32",
    duration: "8:02",
  },
  {
    id: "3",
    title: "Imagine",
    artist: "John Lennon",
    requester: "PeaceAndLove",
    requesterAvatar: "/placeholder.svg?height=32&width=32",
    duration: "3:03",
  },
]

const mockHistory: Song[] = [
  {
    id: "4",
    title: "Smells Like Teen Spirit",
    artist: "Nirvana",
    requester: "GrungeKid",
    requesterAvatar: "/placeholder.svg?height=32&width=32",
    duration: "5:01",
  },
  {
    id: "5",
    title: "Billie Jean",
    artist: "Michael Jackson",
    requester: "MoonwalkerFan",
    requesterAvatar: "/placeholder.svg?height=32&width=32",
    duration: "4:54",
  },
  {
    id: "6",
    title: "Like a Rolling Stone",
    artist: "Bob Dylan",
    requester: "FolkRocker",
    requesterAvatar: "/placeholder.svg?height=32&width=32",
    duration: "6:13",
  },
]

export default function SongRequestQueue() {
  const [queue, setQueue] = useState<Song[]>(mockQueue)
  const [history, setHistory] = useState<Song[]>(mockHistory)
  const [searchTerm, setSearchTerm] = useState("")
  const [nowPlaying, setNowPlaying] = useState<Song | null>(null)

  useEffect(() => {
    // Simulate a song being played every 10 seconds
    const interval = setInterval(() => {
      if (queue.length > 0) {
        const [nextSong, ...remainingQueue] = queue
        setNowPlaying(nextSong)
        setQueue(remainingQueue)
        setHistory((prev) => [nextSong, ...prev])
      }
    }, 10000)

    return () => clearInterval(interval)
  }, [queue])

  const filteredQueue = queue.filter(
    (song) =>
      song.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      song.artist.toLowerCase().includes(searchTerm.toLowerCase()) ||
      song.requester.toLowerCase().includes(searchTerm.toLowerCase()),
  )

  const filteredHistory = history.filter(
    (song) =>
      song.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      song.artist.toLowerCase().includes(searchTerm.toLowerCase()) ||
      song.requester.toLowerCase().includes(searchTerm.toLowerCase()),
  )

  return (
    <div className="w-full max-w-4xl mx-auto p-6 bg-gray-900 text-white rounded-lg shadow-xl">
      <h1 className="text-3xl font-bold mb-6 text-center">Twitch Song Request Queue</h1>

      <NowPlaying song={nowPlaying} />

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
            Current Queue
          </TabsTrigger>
          <TabsTrigger value="history" className="data-[state=active]:bg-gray-700">
            <History className="mr-2" size={18} />
            History
          </TabsTrigger>
        </TabsList>
        <TabsContent value="queue">
          <ScrollArea className="h-[400px] w-full rounded-md border border-gray-700 p-4 bg-gray-800">
            <SongList songs={filteredQueue} />
          </ScrollArea>
        </TabsContent>
        <TabsContent value="history">
          <ScrollArea className="h-[400px] w-full rounded-md border border-gray-700 p-4 bg-gray-800">
            <SongList songs={filteredHistory} />
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function NowPlaying({ song }: { song: Song | null }) {
  return (
    <div className="mb-6 p-4 bg-gray-800 rounded-lg shadow-md">
      <h2 className="text-xl font-semibold mb-2 flex items-center">
        <Music className="mr-2" size={24} />
        Now Playing
      </h2>
      {song ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex items-center space-x-4"
        >
          <Avatar className="w-16 h-16">
            <AvatarImage src={song.requesterAvatar} alt={song.requester} />
            <AvatarFallback>{song.requester.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div>
            <h3 className="text-lg font-medium">{song.title}</h3>
            <p className="text-gray-400">{song.artist}</p>
            <p className="text-sm text-gray-500">Requested by: {song.requester}</p>
          </div>
        </motion.div>
      ) : (
        <p className="text-gray-400">No song is currently playing</p>
      )}
    </div>
  )
}

function SongList({ songs }: { songs: Song[] }) {
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
          <div className="flex items-center space-x-4 p-3 rounded-lg hover:bg-gray-700 transition-colors mb-2">
            <Avatar>
              <AvatarImage src={song.requesterAvatar} alt={song.requester} />
              <AvatarFallback>{song.requester.slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="flex-grow">
              <h3 className="font-semibold">{song.title}</h3>
              <p className="text-sm text-gray-400">{song.artist}</p>
            </div>
            <div className="text-sm text-gray-400 flex items-center">
              <Clock className="mr-1" size={14} />
              {song.duration}
            </div>
            <div className="text-sm text-gray-400">{song.requester}</div>
          </div>
        </motion.div>
      ))}
    </AnimatePresence>
  )
}

