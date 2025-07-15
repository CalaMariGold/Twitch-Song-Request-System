import { SongRequest } from "@/lib/types";
import { motion } from "framer-motion";
import Image from 'next/image';
import { Music, Clock, Youtube } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from 'next/link';
import { formatDurationFromSeconds, SpotifyIcon } from "@/lib/utils";
import React from "react";

export function ActiveSong({ song, isLoading }: { song: SongRequest | null, isLoading: boolean }) {
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
        <div className="flex items-center justify-center h-full"><span>Loading...</span></div>
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