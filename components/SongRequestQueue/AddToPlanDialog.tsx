import React, { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Plus } from "lucide-react";
import { PlannedRequest } from "@/lib/types";
import { Socket } from "socket.io-client";

export function AddToPlanDialog({ 
  isOpen, 
  onOpenChange, 
  currentUser, 
  socket, 
  onAddToRequestPlan 
}: { 
  isOpen: boolean; 
  onOpenChange: (open: boolean) => void; 
  currentUser: { id?: string, login?: string } | null;
  socket: Socket | null;
  onAddToRequestPlan: (song: Partial<PlannedRequest>) => void;
}) {
  const [inputValue, setInputValue] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setInputValue("");
      setError(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue || !currentUser?.login || !socket) {
      setError("Please enter a song URL or search text");
      return;
    }
    setError(null);
    setIsAdding(true);
    socket.emit('getSongDetailsForPlan', inputValue, (error: any, details: any) => {
      setIsAdding(false);
      if (error) {
        console.error('Error fetching song details:', error);
        setError(error.error || "Failed to load song details. Please check your input.");
        return;
      }
      const newSong: Partial<PlannedRequest> = {
        youtubeUrl: details.youtubeUrl || null,
        title: details.title,
        artist: details.artist,
        channelId: details.channelId,
        duration: details.duration,
        durationSeconds: details.durationSeconds,
        thumbnailUrl: details.thumbnailUrl,
        spotifyData: details.spotifyData,
        sourceType: details.sourceType
      };
      onAddToRequestPlan(newSong);
      onOpenChange(false);
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button 
          variant="outline" 
          className="flex gap-2 bg-brand-pink-neon/10 hover:bg-brand-pink-neon/20 text-brand-pink-light border-brand-pink-neon/40 hover:shadow-glow-pink-sm transition-shadow"
        >
          <Plus size={16} />
          Add to Plan
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-brand-black/95 backdrop-blur border-brand-purple-neon/50 text-brand-purple-light">
        <DialogHeader>
          <DialogTitle className="text-brand-purple-light">Add to Request Plan</DialogTitle>
          <DialogDescription className="text-brand-purple-light/70">
            Enter a YouTube URL, Spotify URL, or simply type the artist and song name
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <Input 
            ref={inputRef}
            value={inputValue} 
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="YouTube URL, Spotify URL, or Artist - Song Title" 
            className="bg-brand-black/60 text-white border-brand-purple-neon/30 focus-visible:ring-brand-purple-neon/70 placeholder:text-brand-purple-light/50"
            autoComplete="off"
          />
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <DialogFooter>
            <Button
              type="submit"
              className="bg-brand-pink-neon hover:bg-brand-pink-dark text-brand-black font-semibold hover:shadow-glow-pink transition-all"
              disabled={isAdding || !inputValue}
            >
              {isAdding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              {isAdding ? "Adding..." : "Add to Plan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
} 