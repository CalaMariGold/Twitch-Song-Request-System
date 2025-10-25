import { SongRequest } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles, User } from "lucide-react";
import Link from 'next/link';
import { SongList } from "./SongList";
import { getTwitchAuthUrl } from "@/lib/auth";
import { Socket } from "socket.io-client";
import React from "react";

interface TwitchUserDisplay {
  login: string;
  display_name: string;
  profile_image_url: string;
}

interface RafflePoolTabProps {
  currentUser: TwitchUserDisplay | null,
  rafflePool: SongRequest[],
  searchTerm: string,
  isLoading: boolean,
  socket: Socket | null,
  setEditingSongId: React.Dispatch<React.SetStateAction<string | null>>,
  setCurrentSpotifyUrl: React.Dispatch<React.SetStateAction<string>>,
  setCurrentYouTubeUrl: React.Dispatch<React.SetStateAction<string>>,
  setIsEditSongLinksDialogOpen: React.Dispatch<React.SetStateAction<boolean>>,
  setEditSpotifyError: React.Dispatch<React.SetStateAction<string | null>>,
  setEditSpotifySuccess: React.Dispatch<React.SetStateAction<boolean>>,
  setEditYouTubeError: React.Dispatch<React.SetStateAction<string | null>>,
  setEditYouTubeSuccess: React.Dispatch<React.SetStateAction<boolean>>
}

export function RafflePoolTab({ 
  currentUser, 
  rafflePool, 
  searchTerm,
  isLoading,
  socket,
  setEditingSongId,
  setCurrentSpotifyUrl,
  setCurrentYouTubeUrl,
  setIsEditSongLinksDialogOpen,
  setEditSpotifyError,
  setEditSpotifySuccess,
  setEditYouTubeError,
  setEditYouTubeSuccess
}: RafflePoolTabProps) {
  // Filter raffle pool based on search term
  const filteredRafflePool = rafflePool.filter(song => 
      song.title?.toLowerCase().includes(searchTerm.toLowerCase()) || 
      song.artist?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      song.requester?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (isLoading) {
    return <div className="flex items-center justify-center h-full"><Loader2 className="w-8 h-8 animate-spin text-brand-pink-neon" /></div>;
  }

  if (filteredRafflePool.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <Sparkles size={24} className="text-brand-pink-neon/70 mb-2" />
        <p className="text-brand-purple-light/70">
          {searchTerm ? "No songs match your search" : "The raffle pool is empty"}
        </p>
        {!searchTerm && (
          <p className="text-brand-purple-light/50 text-sm mt-2">
            Channel point redemptions will appear here
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles size={20} className="text-brand-pink-neon" />
          <h3 className="text-lg font-semibold text-brand-pink-neon">
            Raffle Pool ({filteredRafflePool.length})
          </h3>
        </div>
        <p className="text-brand-purple-light/60 text-sm">
          Waiting to be randomly selected
        </p>
      </div>
      
      <SongList 
        songs={filteredRafflePool} 
        isHistory={false} 
        currentUser={currentUser} 
        socket={socket} 
        setEditingSongId={setEditingSongId}
        setCurrentSpotifyUrl={setCurrentSpotifyUrl}
        setCurrentYouTubeUrl={setCurrentYouTubeUrl}
        setIsEditSongLinksDialogOpen={setIsEditSongLinksDialogOpen}
        setEditSpotifyError={setEditSpotifyError}
        setEditSpotifySuccess={setEditSpotifySuccess}
        setEditYouTubeError={setEditYouTubeError}
        setEditYouTubeSuccess={setEditYouTubeSuccess}
      />
    </div>
  )
}

