import { SongRequest } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { Clock, Edit, Trash2, Youtube, Music } from "lucide-react";
import Link from 'next/link';
import { formatDurationFromSeconds, formatTimestamp, SpotifyIcon, cn } from "@/lib/utils";
import { Socket } from "socket.io-client";
import React from "react";
import { socketEvents } from "@/lib/config";

export function SongList({ 
  songs, 
  isHistory, 
  currentUser, 
  socket,
  setEditingSongId,
  setCurrentSpotifyUrl,
  setCurrentYouTubeUrl,
  setIsEditSongLinksDialogOpen,
  setEditSpotifyError,
  setEditSpotifySuccess,
  setEditYouTubeError,
  setEditYouTubeSuccess
}: { 
  songs: SongRequest[], 
  isHistory: boolean, 
  currentUser: { id?: string, login?: string } | null, 
  socket: Socket | null,
  setEditingSongId?: React.Dispatch<React.SetStateAction<string | null>>,
  setCurrentSpotifyUrl?: React.Dispatch<React.SetStateAction<string>>,
  setCurrentYouTubeUrl?: React.Dispatch<React.SetStateAction<string>>,
  setIsEditSongLinksDialogOpen?: React.Dispatch<React.SetStateAction<boolean>>,
  setEditSpotifyError?: React.Dispatch<React.SetStateAction<string | null>>,
  setEditSpotifySuccess?: React.Dispatch<React.SetStateAction<boolean>>,
  setEditYouTubeError?: React.Dispatch<React.SetStateAction<string | null>>,
  setEditYouTubeSuccess?: React.Dispatch<React.SetStateAction<boolean>>
}) {
  if (songs.length === 0) {
    return null;
  }
  const userLogin = currentUser?.login?.toLowerCase();
  return (
    <AnimatePresence>
      {songs.map((song, index) => {
        const isOwnRequest = !!userLogin && 
                             (song.requesterLogin?.toLowerCase() === userLogin || 
                              song.requester?.toLowerCase() === userLogin);
        return (
          <motion.div
            key={song.id}
            layout
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3, delay: index * 0.05 }}
            className={cn(
              "mb-2 rounded-md",
            )}
          >
            <div 
              className={cn(
                "flex flex-wrap sm:flex-nowrap items-center sm:space-x-3 p-3 rounded-md bg-brand-purple-dark/30 hover:bg-brand-purple-dark/50 transition-colors duration-200 border border-brand-purple-neon/10 hover:border-brand-purple-neon/30", 
                isOwnRequest && "shadow-glow-pink-sm"
              )}
            >
              {/* Left section (Index + Thumbnail) */}
              <div className="flex items-center space-x-3 flex-shrink-0">
                <div className={cn(`flex-shrink-0 font-semibold w-6 text-center`, isHistory ? 'text-brand-purple-light/50' : 'text-brand-purple-light/70')}
                >
                  {index + 1}
                </div>
                <div className="relative w-16 h-9 rounded-md overflow-hidden flex-shrink-0 border border-brand-purple-neon/10">
                  {song.thumbnailUrl ? (
                    <img 
                      src={song.thumbnailUrl}
                      alt={song.title || 'Song thumbnail'}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Avatar className="w-full h-full rounded-md bg-brand-purple-dark/50">
                      <AvatarFallback className="rounded-md bg-transparent flex items-center justify-center">
                        <Music size={24} className={`text-brand-purple-light/${isHistory ? '50' : '70'}`}/>
                      </AvatarFallback>
                    </Avatar>
                  )}
                </div>
              </div>
              {/* Middle section (Title, Artist, Duration, Requester) */}
              <div className="flex-grow min-w-0 w-full sm:w-auto order-first sm:order-none mb-2 sm:mb-0">
                <p className={`font-medium truncate flex items-center gap-1 ${isHistory ? 'text-gray-400' : 'text-white'}`}>
                  {song.title || (song.youtubeUrl ? 'Untitled YouTube Video' : 'Untitled Song')}
                </p>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
                  {song.youtubeUrl && song.channelId ? (
                    <Link href={`https://www.youtube.com/channel/${song.channelId}`} target="_blank" rel="noopener noreferrer" className={`hover:text-brand-pink-light transition-colors group ${isHistory ? 'text-brand-purple-light/60' : 'text-brand-purple-light/80'}`}> 
                      <Badge variant="outline" className={`text-xs font-normal cursor-pointer border-brand-purple-neon/20 group-hover:border-brand-pink-neon/40 group-hover:text-brand-pink-light transition-colors ${isHistory ? 'text-brand-purple-light/60' : 'text-brand-purple-light/80'}`}> 
                        {song.artist || 'Unknown Artist'}
                      </Badge>
                    </Link>
                  ) : (
                    <Badge variant="outline" className={`text-xs font-normal border-brand-purple-neon/20 ${isHistory ? 'text-brand-purple-light/60' : 'text-brand-purple-light/80'}`}> 
                      {song.artist || 'Unknown Artist'}
                    </Badge>
                  )}
                  <span className={cn(`text-xs flex items-center whitespace-nowrap`, isHistory ? 'text-brand-purple-light/50' : 'text-brand-purple-light/70')}
                  >
                    <Clock className="inline-block mr-1" size={12} />
                    {formatDurationFromSeconds(song.durationSeconds ?? 0)}
                  </span>
                  <div className={cn(`text-xs flex items-center gap-1 flex-wrap`, isHistory ? 'text-brand-purple-light/50' : 'text-brand-purple-light/70')}
                  >
                    <span className="whitespace-nowrap">by:</span>
                    <Avatar className="w-3 h-3 rounded-full inline-block border border-brand-purple-light/20">
                      <AvatarImage src={song.requesterAvatar ?? undefined} alt={song.requester} />
                      <AvatarFallback className="text-[8px] bg-brand-purple-dark">{song.requester.slice(0,1)}</AvatarFallback>
                    </Avatar>
                    <Link href={`https://www.twitch.tv/${song.requesterLogin || song.requester.toLowerCase()}`} target="_blank" rel="noopener noreferrer" className="hover:text-brand-pink-light hover:underline transition-colors min-w-0 truncate">
                      {song.requester}
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
              {/* Right section (Buttons + Timestamp) */}
              <div className="flex flex-col space-y-1 w-full sm:w-auto items-start sm:items-end flex-shrink-0">
                <div className="flex space-x-1 items-center">
                  {song.youtubeUrl && (
                    <a href={song.youtubeUrl} target="_blank" rel="noopener noreferrer" aria-label="Watch on YouTube">
                       <Button variant="ghost" className="p-1 text-red-500 hover:text-red-400 hover:bg-red-500/10 rounded-full transition-all">
                         <Youtube className="h-5 w-5" />
                      </Button>
                    </a>
                  )}
                  {song.spotifyData && song.spotifyData.url && (
                    <a href={String(song.spotifyData.url)} target="_blank" rel="noopener noreferrer" aria-label="Listen on Spotify">
                      <Button variant="ghost" className="p-1 text-green-500 hover:text-green-400 hover:bg-green-500/10 rounded-full transition-all">
                         <SpotifyIcon className="h-5 w-5" />
                      </Button>
                    </a>
                  )}
                  {/* Edit Song Links button */}
                  {!isHistory && isOwnRequest && socket && 
                   setEditingSongId && setCurrentSpotifyUrl && setCurrentYouTubeUrl && setIsEditSongLinksDialogOpen && 
                   setEditSpotifyError && setEditSpotifySuccess && setEditYouTubeError && setEditYouTubeSuccess && (
                     <Button
                        variant="ghost"
                        size="icon"
                        className="text-brand-purple-light/60 hover:text-green-500 hover:bg-green-500/10 rounded-full transition-all"
                        onClick={() => {
                          if (socket && currentUser?.login) {
                            setEditingSongId(song.id);
                            setCurrentSpotifyUrl(song.spotifyData?.url || '');
                            setCurrentYouTubeUrl(song.youtubeUrl || '');
                            setIsEditSongLinksDialogOpen(true);
                            setEditSpotifyError(null);
                            setEditSpotifySuccess(false);
                            setEditYouTubeError(null);
                            setEditYouTubeSuccess(false);
                          }
                        }}
                        title="Edit song links"
                        aria-label="Edit song links"
                      >
                        <Edit size={18} />
                   </Button>
                  )}
                  {/* Delete button (existing) */}
                  {!isHistory && isOwnRequest && socket && (
                   <Button
                      variant="ghost"
                      size="icon"
                      className="text-brand-purple-light/60 hover:text-red-500 hover:bg-red-500/10 rounded-full transition-all"
                      onClick={() => {
                        const currentLogin = currentUser?.login;
                        if (socket && currentLogin) {
                          socket.emit(socketEvents.DELETE_MY_REQUEST, { 
                            requestId: song.id,
                            userLogin: currentLogin
                          });
                        }
                      }}
                      title="Delete my request"
                      aria-label="Delete my request"
                    >
                      <Trash2 size={18} />
                   </Button>
                  )}
                </div>
                <span className="text-xs text-brand-purple-light/50 whitespace-nowrap">
                   {isHistory ? 'Completed:' : 'Added:'} {formatTimestamp(song.timestamp)}
                </span>
              </div>
            </div>
          </motion.div>
        )
      })}
    </AnimatePresence>
  )
} 