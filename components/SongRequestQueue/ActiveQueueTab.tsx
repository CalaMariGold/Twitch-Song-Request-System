import { SongRequest } from "@/lib/types";
import { SongList } from "./SongList";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Socket } from "socket.io-client";
import React, { useMemo } from "react";

interface ActiveQueueTabProps {
  songs: SongRequest[];
  searchTerm: string;
  currentUser: { id?: string; login?: string } | null;
  socket: Socket | null;
  setEditingSongId: React.Dispatch<React.SetStateAction<string | null>>;
  setCurrentSpotifyUrl: React.Dispatch<React.SetStateAction<string>>;
  setCurrentYouTubeUrl: React.Dispatch<React.SetStateAction<string>>;
  setIsEditSongLinksDialogOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setEditSpotifyError: React.Dispatch<React.SetStateAction<string | null>>;
  setEditSpotifySuccess: React.Dispatch<React.SetStateAction<boolean>>;
  setEditYouTubeError: React.Dispatch<React.SetStateAction<string | null>>;
  setEditYouTubeSuccess: React.Dispatch<React.SetStateAction<boolean>>;
}

export function ActiveQueueTab({
  songs,
  searchTerm,
  currentUser,
  socket,
  setEditingSongId,
  setCurrentSpotifyUrl,
  setCurrentYouTubeUrl,
  setIsEditSongLinksDialogOpen,
  setEditSpotifyError,
  setEditSpotifySuccess,
  setEditYouTubeError,
  setEditYouTubeSuccess,
}: ActiveQueueTabProps) {
  // Filter queue based on search term
  const filteredQueue = useMemo(
    () =>
      songs.filter(
        (song) =>
          song.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          song.artist?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          song.requester.toLowerCase().includes(searchTerm.toLowerCase())
      ),
    [songs, searchTerm]
  );

  return (
    <ErrorBoundary>
      <SongList
        songs={filteredQueue}
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
    </ErrorBoundary>
  );
} 