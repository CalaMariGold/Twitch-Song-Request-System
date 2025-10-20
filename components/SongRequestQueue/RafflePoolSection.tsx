import { SongRequest } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { motion, AnimatePresence } from "framer-motion";
import { Clock, Music } from "lucide-react";
import Link from 'next/link';
import { formatDurationFromSeconds, SpotifyIcon, cn } from "@/lib/utils";

export function RafflePoolSection({ 
  rafflePool, 
  queueMode,
  currentUser
}: { 
  rafflePool: SongRequest[], 
  queueMode: 'raffle' | 'donation-only',
  currentUser?: { login?: string } | null
}) {
  // Don't show raffle pool in donation-only mode
  if (queueMode === 'donation-only' || rafflePool.length === 0) {
    return null;
  }

  return (
    <div className="mt-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          🎲 Channel Point Raffle Pool
          <Badge variant="outline" className="ml-2 bg-purple-500/20 text-purple-300 border-purple-500/30">
            {rafflePool.length} {rafflePool.length === 1 ? 'song' : 'songs'}
          </Badge>
        </h3>
      </div>
      
      <p className="text-sm text-brand-purple-light/70 mb-4">
        Songs requested with channel points. Mari will randomly select from this pool to fill raffle slots in the queue.<br /> This pool automatically clears at the end of every stream. If your song is never played, your channel points will be refunded.
      </p>

      <div className="space-y-2">
        <AnimatePresence>
          {rafflePool.map((song, index) => {
            // Check if this song belongs to the current user
            const isOwnSong = !!currentUser?.login && 
              (song.requesterLogin?.toLowerCase() === currentUser.login.toLowerCase() || 
               song.requester?.toLowerCase() === currentUser.login.toLowerCase());
            
            return (
            <motion.div
              key={song.id}
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3, delay: index * 0.03 }}
              className="mb-2 rounded-md"
            >
              <div className={cn(
                "flex flex-wrap sm:flex-nowrap items-center sm:space-x-3 p-3 rounded-md transition-colors duration-200",
                isOwnSong 
                  ? "bg-purple-900/40 border-2 border-purple-400/60 shadow-glow-pink-sm" 
                  : "bg-purple-900/20 border border-purple-500/20 hover:border-purple-500/40"
              )}>
                {/* Thumbnail */}
                <div className="flex items-center space-x-3 flex-shrink-0">
                  <div className="flex-shrink-0 font-semibold w-6 text-center text-purple-300/70">
                    {index + 1}
                  </div>
                  <div className="relative w-16 h-9 rounded-md overflow-hidden flex-shrink-0 border border-purple-500/20">
                    {song.thumbnailUrl ? (
                      <img 
                        src={song.thumbnailUrl}
                        alt={song.title || 'Song thumbnail'}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Avatar className="w-full h-full rounded-md bg-purple-900/30">
                        <AvatarFallback className="rounded-md bg-transparent flex items-center justify-center">
                          <Music size={24} className="text-purple-300/50"/>
                        </AvatarFallback>
                      </Avatar>
                    )}
                  </div>
                </div>

                {/* Song Info */}
                <div className="flex-grow min-w-0 w-full sm:w-auto order-first sm:order-none mb-2 sm:mb-0">
                  <p className="font-medium break-words text-purple-100">
                    {song.title || 'Untitled Song'}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
                    {song.youtubeUrl && song.channelId ? (
                      <Link 
                        href={`https://www.youtube.com/channel/${song.channelId}`} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="hover:text-brand-pink-light transition-colors group text-purple-300/70"
                      >
                        <Badge 
                          variant="outline" 
                          className="text-xs font-normal cursor-pointer border-purple-500/20 group-hover:border-brand-pink-neon/40 group-hover:text-brand-pink-light transition-colors text-purple-300/70"
                        >
                          {song.artist || 'Unknown Artist'}
                        </Badge>
                      </Link>
                    ) : (
                      <Badge 
                        variant="outline" 
                        className="text-xs font-normal border-purple-500/20 text-purple-300/70"
                      >
                        {song.artist || 'Unknown Artist'}
                      </Badge>
                    )}
                    
                    <span className="text-xs flex items-center whitespace-nowrap text-purple-300/70">
                      <Clock className="inline-block mr-1" size={12} />
                      {formatDurationFromSeconds(song.durationSeconds ?? 0)}
                    </span>
                    
                    <div className="text-xs flex items-center gap-1 text-purple-300/70">
                      <span className="whitespace-nowrap">by:</span>
                      <Avatar className="w-3 h-3 rounded-full inline-block border border-purple-500/20">
                        <AvatarImage src={song.requesterAvatar ?? undefined} alt={song.requester} />
                        <AvatarFallback className="text-[8px] bg-purple-900">{song.requester.slice(0,1)}</AvatarFallback>
                      </Avatar>
                      <Link 
                        href={`https://www.twitch.tv/${song.requesterLogin || song.requester.toLowerCase()}`} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="hover:text-brand-pink-light hover:underline transition-colors truncate"
                      >
                        {song.requester}
                      </Link>
                    </div>

                    <Badge 
                      variant="outline" 
                      className="px-1.5 py-0.5 text-xs bg-purple-500/30 text-purple-200 font-semibold border-purple-500/40"
                    >
                      🎲 Raffle
                    </Badge>
                  </div>
                </div>

                {/* Links */}
                <div className="flex space-x-1 items-center">
                  {song.youtubeUrl && (
                    <Link 
                      href={song.youtubeUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="p-1 text-red-400/70 hover:text-red-400 hover:bg-red-500/10 rounded-full transition-all"
                      aria-label="Watch on YouTube"
                    >
                      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                      </svg>
                    </Link>
                  )}
                  {song.spotifyData && song.spotifyData.url && (
                    <Link 
                      href={String(song.spotifyData.url)} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="p-1 text-green-400/70 hover:text-green-400 hover:bg-green-500/10 rounded-full transition-all"
                      aria-label="Listen on Spotify"
                    >
                      <SpotifyIcon className="h-5 w-5" />
                    </Link>
                  )}
                </div>
              </div>
            </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}

