import { SongRequest, AppState } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Loader2, Music, History, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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

interface MyRequestsTabProps {
  currentUser: TwitchUserDisplay | null,
  state: AppState,
  searchTerm: string,
  isLoading: boolean,
  socket: Socket | null,
  myRequestsHistory: SongRequest[],
  myRequestsTotal: number,
  hasMoreMyRequests: boolean,
  isLoadingMyRequests: boolean,
  loadMoreMyRequests: () => void,
  setEditingSongId: React.Dispatch<React.SetStateAction<string | null>>,
  setCurrentSpotifyUrl: React.Dispatch<React.SetStateAction<string>>,
  setCurrentYouTubeUrl: React.Dispatch<React.SetStateAction<string>>,
  setIsEditSongLinksDialogOpen: React.Dispatch<React.SetStateAction<boolean>>,
  setEditSpotifyError: React.Dispatch<React.SetStateAction<string | null>>,
  setEditSpotifySuccess: React.Dispatch<React.SetStateAction<boolean>>,
  setEditYouTubeError: React.Dispatch<React.SetStateAction<string | null>>,
  setEditYouTubeSuccess: React.Dispatch<React.SetStateAction<boolean>>
}

export function MyRequestsTab({ 
  currentUser, 
  state, 
  searchTerm,
  isLoading,
  socket,
  myRequestsHistory,
  myRequestsTotal,
  hasMoreMyRequests,
  isLoadingMyRequests,
  loadMoreMyRequests,
  setEditingSongId,
  setCurrentSpotifyUrl,
  setCurrentYouTubeUrl,
  setIsEditSongLinksDialogOpen,
  setEditSpotifyError,
  setEditSpotifySuccess,
  setEditYouTubeError,
  setEditYouTubeSuccess
}: MyRequestsTabProps) {
  const lowerCaseLogin = currentUser?.login?.toLowerCase();
  // Filter queue and history based on login name and search term
  const myQueueSongs = state.queue.filter(song => 
      (song.requesterLogin?.toLowerCase() === lowerCaseLogin || song.requester.toLowerCase() === lowerCaseLogin) &&
      (song.title?.toLowerCase().includes(searchTerm.toLowerCase()) || song.artist?.toLowerCase().includes(searchTerm.toLowerCase()))
  );
  const myFilteredHistorySongs = myRequestsHistory.filter(song => 
      (song.title?.toLowerCase().includes(searchTerm.toLowerCase()) || song.artist?.toLowerCase().includes(searchTerm.toLowerCase()))
  );
  const hasNoRequests = myQueueSongs.length === 0 && myFilteredHistorySongs.length === 0 && !isLoadingMyRequests;
  if (isLoading || (isLoadingMyRequests && myRequestsHistory.length === 0)) {
    return <div className="flex items-center justify-center h-full"><Loader2 className="w-8 h-8 animate-spin text-brand-pink-neon" /></div>;
  }
  if (!currentUser) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <User size={24} className="text-brand-purple-light/70" />
        <p className="text-brand-purple-light/70">Please login with Twitch to see your requests</p>
        <Button 
          variant="outline" 
          size="sm"
          onClick={() => window.location.href = getTwitchAuthUrl()}
          className="flex items-center gap-2 bg-brand-purple-neon/10 hover:bg-brand-purple-neon/20 text-brand-purple-light border-brand-purple-neon/40 hover:shadow-glow-purple-sm transition-shadow"
        >
          Login with Twitch
        </Button>
      </div>
    )
  }
  if (hasNoRequests) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <User size={24} className="text-brand-purple-light/70 mb-2" />
        <p className="text-brand-purple-light/70">You haven't made any song requests yet</p>
      </div>
    )
  }
  return (
    <div className="space-y-4">
      {myQueueSongs.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center gap-2 mb-2">
            <Music size={16} className="text-brand-purple-light" />
            <h3 className="text-sm font-medium text-brand-purple-light">In Queue ({myQueueSongs.length})</h3>
          </div>
          <SongList 
            songs={myQueueSongs} 
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
      )}
      {myQueueSongs.length > 0 && myFilteredHistorySongs.length > 0 && (
        <div className="border-t border-brand-purple-dark my-4"></div>
      )}
      {myFilteredHistorySongs.length > 0 && (
        <div className="mt-6 pt-6 border-t border-brand-purple-dark/30">
          <div className="flex items-center gap-2 mb-2">
            <History size={16} className="text-brand-purple-light/80" />
            <h3 className="text-sm font-medium text-brand-purple-light/80">Previously Requested ({myRequestsTotal})</h3>
          </div>
          <SongList 
            songs={myFilteredHistorySongs} 
            isHistory={true} 
            currentUser={currentUser} 
            socket={socket}
          />
        </div>
      )}
      {hasMoreMyRequests && (
        <div className="mt-6 flex justify-center">
          <Button
            variant="outline"
            className="bg-brand-purple-dark/50 border-brand-purple-neon/20 text-brand-purple-light hover:bg-brand-purple-dark/70 hover:border-brand-purple-neon/40 hover:text-white transition-all"
            onClick={loadMoreMyRequests}
            disabled={isLoadingMyRequests}
          >
            {isLoadingMyRequests ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading...
              </>
            ) : (
              <>Load More History</>
            )}
          </Button>
        </div>
      )}
    </div>
  )
} 