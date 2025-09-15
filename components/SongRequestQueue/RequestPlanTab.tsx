import { useState } from "react";
import { DragDropContext, Draggable, Droppable, DropResult } from '@hello-pangea/dnd';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Music, Clock, GripVertical, Trash2, Plus, Youtube } from "lucide-react";
import Link from 'next/link';
import { motion } from "framer-motion";
import { formatTimestamp, formatDurationFromSeconds, addToRequestPlan, saveRequestPlan, removeFromRequestPlan, SpotifyIcon, cn } from "@/lib/utils";
import { AddToPlanDialog } from "./AddToPlanDialog";
import { PlannedRequest } from "@/lib/types";
import { Socket } from "socket.io-client";

interface TwitchUserDisplay {
  login: string;
  display_name: string;
  profile_image_url: string;
}

interface RequestPlanTabProps {
  currentUser: TwitchUserDisplay | null;
  requestPlan: PlannedRequest[];
  searchTerm: string;
  isLoading: boolean;
  onDragEnd: (result: DropResult) => void;
  onRemove: (songId: string) => void;
  socket: Socket | null;
  isYoutubeDialogOpen: boolean;
  setIsYoutubeDialogOpen: (open: boolean) => void;
  setRequestPlan: (plan: PlannedRequest[]) => void;
}

export function RequestPlanTab({ 
  currentUser, 
  requestPlan,
  searchTerm,
  isLoading,
  onDragEnd,
  onRemove,
  socket,
  isYoutubeDialogOpen,
  setIsYoutubeDialogOpen,
  setRequestPlan
}: RequestPlanTabProps) {
  // Filter the request plan based on search term
  const filteredPlan = requestPlan.filter(song => 
    song.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    song.artist?.toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  // Handle requesting a song from the plan
  const handleRequestSong = (song: PlannedRequest) => {
    if (!socket || !currentUser?.login) return;
    
    socket.emit('addSong', {
      youtubeUrl: song.youtubeUrl,
      requester: currentUser.login,
      requestType: 'channelPoint' // Assuming channel points for manual requests
    } as Partial<PlannedRequest> & { requester: string; youtubeUrl?: string; message?: string }, (error: any) => {
      if (error) {
        console.error('Error requesting song:', error);
        return;
      }
      // Remove from plan after successful request
      onRemove(song.id);
    });
  };
    
  if (isLoading) {
    return <div>Loading...</div>;
  }
  
  if (!currentUser) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <p className="text-brand-purple-light/70">Please login with Twitch to use your Request Plan</p>
      </div>
    )
  }
  
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <AddToPlanDialog 
          isOpen={isYoutubeDialogOpen}
          onOpenChange={setIsYoutubeDialogOpen}
          currentUser={currentUser}
          socket={socket}
          onAddToRequestPlan={(newSong) => {
            if (currentUser?.login) {
              const updatedPlan = addToRequestPlan(currentUser.login, newSong);
              setRequestPlan(updatedPlan);
            }
          }}
        />
        <p className="text-sm text-brand-purple-light/80 flex-1">
          {filteredPlan.length === 0 
            ? "Add songs to your plan for easy requesting later."
            : `${filteredPlan.length} song${filteredPlan.length !== 1 ? 's' : ''} in your plan.`}
        </p>
      </div>
      {filteredPlan.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-[300px] border border-dashed border-brand-purple-dark rounded-md">
          <p className="text-brand-purple-light/70 mb-2">Your request plan is empty</p>
          <p className="text-gray-500 text-sm mt-1">Add songs to request them later</p>
        </div>
      ) : (
        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="requestPlan">
            {(provided: any) => (
              <div
                {...provided.droppableProps}
                ref={provided.innerRef}
                className="space-y-2"
              >
                {filteredPlan.map((song, index) => (
                  <Draggable key={song.id} draggableId={song.id} index={index}>
                    {(provided: any) => (
                      <motion.div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        className={cn(
                          "flex flex-wrap sm:flex-nowrap items-center sm:space-x-3 p-3 rounded-md bg-brand-purple-dark/30 hover:bg-brand-purple-dark/50 transition-colors duration-200 mb-2 border border-brand-purple-neon/10 hover:border-brand-purple-neon/30",
                        )}
                      >
                        <div className="flex items-center space-x-3 flex-shrink-0">
                          <div
                            {...provided.dragHandleProps}
                            className="flex-shrink-0 cursor-move text-brand-purple-light/50 hover:text-brand-purple-light/80 transition-colors"
                          >
                            <GripVertical size={20} />
                          </div>
                          <div className="flex-shrink-0 font-semibold text-brand-purple-light/60 w-6 text-center">
                            {index + 1}
                          </div>
                          <div className="relative w-16 h-9 rounded-md overflow-hidden flex-shrink-0 border border-brand-purple-neon/10">
                            {song.thumbnailUrl ? (
                              <img 
                                src={song.thumbnailUrl} 
                                alt={song.title || 'Video thumbnail'}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <Avatar className="w-full h-full rounded-md bg-brand-purple-dark/50">
                                <AvatarFallback className="rounded-md bg-transparent flex items-center justify-center">
                                  <Music size={24} className="text-brand-purple-light/70"/>
                                </AvatarFallback>
                              </Avatar>
                            )}
                          </div>
                        </div>
                        <div className="flex-grow min-w-0 w-full sm:w-auto order-first sm:order-none mb-2 sm:mb-0">
                          <p className="font-medium text-white break-words flex items-center gap-1">
                            {song.title || song.youtubeUrl}
                          </p>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
                            {song.channelId ? (
                              <Link href={`https://www.youtube.com/channel/${song.channelId}`} target="_blank" rel="noopener noreferrer" className="hover:text-brand-pink-light transition-colors group">
                                <Badge variant="outline" className="text-xs font-normal cursor-pointer border-brand-purple-neon/20 text-brand-purple-light/80 group-hover:border-brand-pink-neon/40 group-hover:text-brand-pink-light transition-colors">
                                  {song.artist || 'Unknown Artist'}
                                </Badge>
                              </Link>
                            ) : (
                              <Badge variant="outline" className="text-xs font-normal border-brand-purple-neon/20 text-brand-purple-light/80">
                                {song.artist || 'Unknown Artist'}
                              </Badge>
                            )}
                            {song.durationSeconds !== undefined && (
                              <span className="text-xs text-brand-purple-light/70 flex items-center">
                                <Clock className="inline-block mr-1" size={12} />
                                {formatDurationFromSeconds(song.durationSeconds ?? 0)}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col items-start sm:items-end space-y-1 flex-shrink-0 w-full sm:w-auto">
                          <div className="flex space-x-1 items-center">
                            {/* Youtube button - Only show if youtubeUrl exists */}
                            {song.youtubeUrl && (
                              <a href={song.youtubeUrl} target="_blank" rel="noopener noreferrer" aria-label="Watch on YouTube">
                                <Button variant="ghost" className="p-1 text-red-500 hover:text-red-400" aria-label="Watch on YouTube">
                                  <Youtube className="h-5 w-5" />
                                </Button>
                              </a>
                            )}
                            {/* Spotify Link Button - Only show if Spotify data exists */}
                            {song.spotifyData && song.spotifyData.url && (
                              <a href={String(song.spotifyData.url)} target="_blank" rel="noopener noreferrer" aria-label="Listen on Spotify">
                                <Button variant="ghost" className="p-1 text-green-500 hover:text-green-400" aria-label="Listen on Spotify">
                                  <SpotifyIcon className="h-5 w-5" />
                                </Button>
                              </a>
                            )}
                            {/* Remove button */}
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="p-1 text-brand-pink-neon/70 hover:text-brand-pink-neon hover:bg-brand-pink-neon/10 rounded-full transition-all"
                              onClick={() => onRemove(song.id)}
                              title="Remove from plan"
                              aria-label="Remove from plan"
                            >
                              <Trash2 size={18} />
                            </Button>
                          </div>
                          {/* Timestamp below buttons */}
                          <span className="text-xs text-brand-purple-light/50 whitespace-nowrap">
                            Added: {formatTimestamp(song.addedAt)}
                          </span>
                        </div>
                      </motion.div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      )}
    </div>
  )
} 