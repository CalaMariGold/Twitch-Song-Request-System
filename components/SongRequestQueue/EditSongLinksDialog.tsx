import React, { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { SpotifyIcon } from "@/lib/utils";
import { socketEvents } from "@/lib/config";
import { Socket } from "socket.io-client";

export function EditSongLinksDialog({ 
  isOpen, 
  onOpenChange, 
  currentUser, 
  socket, 
  songId,
  initialSpotifyUrl,
  initialYouTubeUrl,
  spotifySuccess,
  spotifyError,
  youtubeSuccess,
  youtubeError,
  onReset 
}: { 
  isOpen: boolean; 
  onOpenChange: (open: boolean) => void; 
  currentUser: { id?: string, login?: string } | null;
  socket: Socket | null;
  songId: string | null;
  initialSpotifyUrl: string;
  initialYouTubeUrl: string;
  spotifySuccess: boolean;
  spotifyError: string | null;
  youtubeSuccess: boolean;
  youtubeError: string | null;
  onReset: () => void;
}) {
  const [spotifyInputValue, setSpotifyInputValue] = useState("");
  const [youtubeInputValue, setYoutubeInputValue] = useState("");
  const [isSubmittingSpotify, setIsSubmittingSpotify] = useState(false);
  const [isSubmittingYoutube, setIsSubmittingYoutube] = useState(false);
  const spotifyInputRef = useRef<HTMLInputElement>(null);
  const youtubeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setSpotifyInputValue(initialSpotifyUrl);
      setYoutubeInputValue(initialYouTubeUrl);
      setIsSubmittingSpotify(false);
      setIsSubmittingYoutube(false);
      onReset();
    }
  }, [isOpen, initialSpotifyUrl, initialYouTubeUrl, onReset]);

  useEffect(() => {
    if (isOpen && spotifyInputRef.current) {
      setTimeout(() => {
        spotifyInputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  const handleSpotifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!spotifyInputValue || !currentUser?.login || !socket || !songId) {
      return;
    }
    setIsSubmittingSpotify(true);
    socket.emit(socketEvents.EDIT_MY_SONG_SPOTIFY, { 
      requestId: songId,
      spotifyUrl: spotifyInputValue,
      userLogin: currentUser.login
    });
    setIsSubmittingSpotify(false);
  };

  const handleYouTubeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser?.login || !socket || !songId) {
      return;
    }
    setIsSubmittingYoutube(true);
    socket.emit(socketEvents.EDIT_MY_SONG_YOUTUBE, { 
      requestId: songId,
      youtubeUrl: youtubeInputValue.trim(),
      userLogin: currentUser.login
    });
    setIsSubmittingYoutube(false);
  };

  const isAnySubmitting = isSubmittingSpotify || isSubmittingYoutube;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!isAnySubmitting) {
        onOpenChange(open);
      }
    }}>
      <DialogContent className="bg-brand-black/95 backdrop-blur border-brand-purple-neon/50 text-brand-purple-light max-w-md">
        <DialogHeader>
          <DialogTitle className="text-brand-purple-light">Edit Song Links</DialogTitle>
          <DialogDescription className="text-brand-purple-light/70">
            Update the Spotify or YouTube links for your song request.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-6">
          {/* Spotify Section */}
          <form onSubmit={handleSpotifySubmit} className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <SpotifyIcon className="h-4 w-4" />
              <Label className="text-sm font-medium">Spotify Link</Label>
            </div>
            <Input 
              ref={spotifyInputRef}
              value={spotifyInputValue} 
              onChange={(e) => setSpotifyInputValue(e.target.value)}
              placeholder="https://open.spotify.com/track/..." 
              className="bg-brand-black/60 text-white border-brand-purple-neon/30 focus-visible:ring-brand-purple-neon/70 placeholder:text-brand-purple-light/50"
              autoComplete="off"
              disabled={isAnySubmitting || spotifySuccess}
            />
            {spotifyError && <p className="text-red-500 text-sm">{spotifyError}</p>}
            {spotifySuccess && <p className="text-green-500 text-sm">Spotify link updated successfully!</p>}
            <Button
              type="submit"
              className="bg-green-600 hover:bg-green-700 text-white font-semibold transition-all"
              disabled={isAnySubmitting || spotifySuccess || !spotifyInputValue || !spotifyInputValue.includes('spotify.com/track/')}
            >
              {isSubmittingSpotify ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <SpotifyIcon className="mr-2 h-4 w-4" />}
              {isSubmittingSpotify ? "Updating..." : spotifySuccess ? "Updated!" : "Update Spotify Link"}
            </Button>
          </form>
          <div className="border-t border-brand-purple-neon/20" />
          {/* YouTube Section */}
          <form onSubmit={handleYouTubeSubmit} className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
              </svg>
              <Label className="text-sm font-medium">YouTube Link</Label>
            </div>
            <Input 
              ref={youtubeInputRef}
              value={youtubeInputValue} 
              onChange={(e) => setYoutubeInputValue(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=... (leave empty to remove)" 
              className="bg-brand-black/60 text-white border-brand-purple-neon/30 focus-visible:ring-brand-purple-neon/70 placeholder:text-brand-purple-light/50"
              autoComplete="off"
              disabled={isAnySubmitting || youtubeSuccess}
            />
            {youtubeError && <p className="text-red-500 text-sm">{youtubeError}</p>}
            {youtubeSuccess && <p className="text-green-500 text-sm">YouTube link updated successfully!</p>}
            <Button
              type="submit"
              className="bg-red-600 hover:bg-red-700 text-white font-semibold transition-all"
              disabled={isAnySubmitting || youtubeSuccess}
            >
              {isSubmittingYoutube ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>}
              {isSubmittingYoutube ? "Updating..." : youtubeSuccess ? "Updated!" : youtubeInputValue.trim() ? "Update YouTube Link" : "Remove YouTube Link"}
            </Button>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
} 