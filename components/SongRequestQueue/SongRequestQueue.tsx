"use client"

import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { io, Socket } from "socket.io-client"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Input } from "@/components/ui/input"
import { Search, Music, Clock, History, Loader2, Youtube, User, ListPlus, Trash2, GripVertical, Save, Plus, Link as LinkIcon, Edit } from "lucide-react"
import { Button } from "@/components/ui/button"
import { motion, AnimatePresence } from "framer-motion"
import { ErrorBoundary } from "@/components/ErrorBoundary"
import { SongRequest, AppState } from "@/lib/types"
import { constants, socketEvents } from "@/lib/config"
import { Header } from "@/components/Header"
import { Badge } from "@/components/ui/badge"
import Link from 'next/link'
import { 
  formatTimestamp, 
  SpotifyIcon, 
  calculateTotalQueueDuration,
  saveRequestPlan,
  removeFromRequestPlan,
  formatDurationFromSeconds
} from "@/lib/utils"
import { getTwitchAuthUrl } from "@/lib/auth"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { DragDropContext, Draggable, Droppable, DropResult } from '@hello-pangea/dnd'
import Image from 'next/image'
import { cn } from "@/lib/utils"
import { RequestPlanTab } from "./RequestPlanTab";
import { MyRequestsTab } from "./MyRequestsTab";
import { ActiveSong } from "./ActiveSong";
import { LoadingState } from "./LoadingState";
import { EditSongLinksDialog } from "./EditSongLinksDialog";
import { useTwitchUser } from "@/hooks/useTwitchUser";
import { useSocketConnection } from "@/hooks/useSocketConnection";
import { ActiveQueueTab } from "./ActiveQueueTab";
import { HistoryTab } from "./HistoryTab";

/*
 * Main queue component that displays current queue, history, and active song
 */

export default function SongRequestQueue() {
  const [state, setState] = useState<AppState>({
    queue: [],
    history: [],
    activeSong: null,
    settings: {},
    blacklist: [],
    blockedUsers: [],
    isLoading: true,
    error: null
  })
  const [searchTerm, setSearchTerm] = useState("")
  const { currentUser, setCurrentUser, requestPlan, setRequestPlan } = useTwitchUser();
  const currentUserRef = useRef(currentUser);
  const [isYoutubeDialogOpen, setIsYoutubeDialogOpen] = useState(false)
  const [historyPage, setHistoryPage] = useState(1)
  const [isLoadingMoreHistory, setIsLoadingMoreHistory] = useState(false)
  const [hasMoreHistory, setHasMoreHistory] = useState(true)
  const [totalHistoryCount, setTotalHistoryCount] = useState(0)
  const [totalQueueCount, setTotalQueueCount] = useState(0)
  const [isEditSongLinksDialogOpen, setIsEditSongLinksDialogOpen] = useState(false)
  const [editingSongId, setEditingSongId] = useState<string | null>(null)
  const [currentSpotifyUrl, setCurrentSpotifyUrl] = useState('')
  const [currentYouTubeUrl, setCurrentYouTubeUrl] = useState('')
  const [editSpotifyError, setEditSpotifyError] = useState<string | null>(null)
  const [editSpotifySuccess, setEditSpotifySuccess] = useState(false)
  const [editYouTubeError, setEditYouTubeError] = useState<string | null>(null)
  const [editYouTubeSuccess, setEditYouTubeSuccess] = useState(false)
  const [activeTab, setActiveTab] = useState("queue");
  const [myRequestsHistory, setMyRequestsHistory] = useState<SongRequest[]>([]);
  const [myRequestsTotal, setMyRequestsTotal] = useState(0);
  const [myRequestsOffset, setMyRequestsOffset] = useState(0);
  const [isLoadingMyRequests, setIsLoadingMyRequests] = useState(false);
  const [hasMoreMyRequests, setHasMoreMyRequests] = useState(true);

  // Add state for search results and search mode
  const [searchResults, setSearchResults] = useState<SongRequest[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchTotal, setSearchTotal] = useState(0);
  const [searchPage, setSearchPage] = useState(1);
  const [isLoadingSearch, setIsLoadingSearch] = useState(false);
  const SEARCH_PAGE_SIZE = 20;

  // Calculate total queue duration
  const { formatted: totalQueueDurationFormatted } = calculateTotalQueueDuration(state.queue)

  // Function to handle song drag-and-drop in request plan
  const onDragEnd = (result: DropResult) => {
    if (!result.destination || !currentUser?.login) return;
    
    const items = Array.from(requestPlan);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    
    setRequestPlan(items);
    saveRequestPlan(currentUser.login, items);
  };
  
  // Function to handle removing a song from the request plan
  const handleRemoveFromRequestPlan = (songId: string) => {
    if (!currentUser?.login) return;
    
    const updatedPlan = removeFromRequestPlan(currentUser.login, songId);
    setRequestPlan(updatedPlan);
  };

  const { socket, setSocket, isConnected } = useSocketConnection(
    setState,
    setMyRequestsHistory,
    setMyRequestsTotal,
    setMyRequestsOffset,
    setHasMoreMyRequests,
    setIsLoadingMyRequests,
    currentUserRef,
    setTotalQueueCount,
    setTotalHistoryCount
  );

  useEffect(() => {
    if (socket && currentUser?.login) {
      // Fetch initial total count for the "My Requests" tab
      socket.emit('getUserHistory', { 
        userLogin: currentUser.login, 
        limit: 0, 
        offset: 0 
      });
    }
  }, [socket, currentUser]);

  useEffect(() => {
    if (activeTab === 'my-requests' && currentUser?.login && myRequestsHistory.length === 0 && socket) {
        setIsLoadingMyRequests(true);
        socket.emit('getUserHistory', { 
            userLogin: currentUser.login, 
            limit: constants.HISTORY_PAGE_SIZE,
            offset: 0 
        });
    }
  }, [activeTab, currentUser, socket, myRequestsHistory.length]);

  // Effect: When searchTerm changes, trigger backend search or reset
  useEffect(() => {
    if (!socket) return;
    if (searchTerm.trim() === "") {
      setIsSearching(false);
      setSearchResults([]);
      setSearchTotal(0);
      setSearchPage(1);
      return;
    }
    setIsSearching(true);
    setIsLoadingSearch(true);
    setSearchPage(1);
    socket.emit('searchHistory', { query: searchTerm, limit: SEARCH_PAGE_SIZE, offset: 0 }, (res: any) => {
      if (res && !res.error) {
        setSearchResults(res.results || []);
        setSearchTotal(res.total || 0);
      } else {
        setSearchResults([]);
        setSearchTotal(0);
      }
      setIsLoadingSearch(false);
    });
  }, [searchTerm, socket]);

  // Function to load more search results
  const loadMoreSearchResults = () => {
    if (!socket || isLoadingSearch) return;
    setIsLoadingSearch(true);
    const nextOffset = searchPage * SEARCH_PAGE_SIZE;
    socket.emit('searchHistory', { query: searchTerm, limit: SEARCH_PAGE_SIZE, offset: nextOffset }, (res: any) => {
      if (res && !res.error) {
        setSearchResults(prev => [...prev, ...(res.results || [])]);
        setSearchTotal(res.total || 0);
        setSearchPage(prev => prev + 1);
      }
      setIsLoadingSearch(false);
    });
  };

  // Filter handlers
  const filteredQueue = useCallback(() => 
    state.queue.filter((song: SongRequest) => 
      song.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      song.artist?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      song.requester.toLowerCase().includes(searchTerm.toLowerCase())
    ),
    [state.queue, searchTerm]
  )

  const filteredHistory = useCallback(() => 
    state.history.filter((song: SongRequest) => 
      song.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      song.artist?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      song.requester.toLowerCase().includes(searchTerm.toLowerCase())
    ),
    [state.history, searchTerm]
  )
  
  // Count of user's requests in the queue
  const myQueueSongsCount = useMemo(() => {
    if (!currentUser?.login) return 0;
    const lowerCaseLogin = currentUser.login.toLowerCase();
    return state.queue.filter(song => 
      (song.requesterLogin?.toLowerCase() === lowerCaseLogin || song.requester.toLowerCase() === lowerCaseLogin)
    ).length;
  }, [state.queue, currentUser]);

  // Total count for "My Requests" tab = songs in queue + total from history
  const myRequestsCount = myQueueSongsCount + myRequestsTotal;

  // Function to load more history data
  const loadMoreHistory = useCallback(() => {
    if (!socket || isLoadingMoreHistory || !hasMoreHistory) return;
    
    setIsLoadingMoreHistory(true);
    
    const pageSize = 20;
    const offset = historyPage * pageSize;
    
    socket.emit('getMoreHistory', { offset, limit: pageSize });
  }, [socket, historyPage, isLoadingMoreHistory, hasMoreHistory]);

  // Listen for moreHistoryData from backend and update history/hasMoreHistory
  useEffect(() => {
    if (!socket) return () => {};
    const handleMoreHistoryData = (newHistoryChunk: SongRequest[]) => {
      if (newHistoryChunk.length === 0) {
        setHasMoreHistory(false);
        setIsLoadingMoreHistory(false);
        return;
      }
      setState(prev => ({
        ...prev,
        history: [
          ...prev.history,
          ...newHistoryChunk.filter(
            item => !prev.history.some(existing => existing.id === item.id)
          )
        ]
      }));
      setIsLoadingMoreHistory(false);
      if (newHistoryChunk.length < 20) {
        setHasMoreHistory(false);
      } else {
        setHasMoreHistory(true);
      }
      setHistoryPage(prev => prev + 1);
    };
    socket.on('moreHistoryData', handleMoreHistoryData);
    return () => { socket.off('moreHistoryData', handleMoreHistoryData); };
  }, [socket]);

  // Add socket listeners for the edit Spotify response 
  useEffect(() => {
    if (!socket) return;

    // Socket event listeners for editing Spotify link
    socket.on(socketEvents.EDIT_SPOTIFY_SUCCESS, (data) => {
      const { requestId, message } = data;
      if (requestId === editingSongId) {
        setEditSpotifySuccess(true);
        setEditSpotifyError(null);
        // Auto-close after success
        setTimeout(() => {
          setIsEditSongLinksDialogOpen(false);
          setEditSpotifySuccess(false); 
          setEditingSongId(null);
          setCurrentSpotifyUrl('');
          setCurrentYouTubeUrl('');
        }, 1500);
      }
    });

    socket.on(socketEvents.EDIT_SPOTIFY_ERROR, (data) => {
      const { requestId, message } = data;
      if (requestId === editingSongId) {
        setEditSpotifyError(message || 'Error updating Spotify link');
        setEditSpotifySuccess(false);
      }
    });

    socket.on(socketEvents.EDIT_YOUTUBE_SUCCESS, (data) => {
      const { requestId, message } = data;
      if (requestId === editingSongId) {
        setEditYouTubeSuccess(true);
        setEditYouTubeError(null);
        // Auto-close after success
        setTimeout(() => {
          setIsEditSongLinksDialogOpen(false);
          setEditYouTubeSuccess(false); 
          setEditingSongId(null);
          setCurrentSpotifyUrl('');
          setCurrentYouTubeUrl('');
        }, 1500);
      }
    });

    socket.on(socketEvents.EDIT_YOUTUBE_ERROR, (data) => {
      const { requestId, message } = data;
      if (requestId === editingSongId) {
        setEditYouTubeError(message || 'Error updating YouTube link');
        setEditYouTubeSuccess(false);
      }
    });

    return () => {
      socket.off(socketEvents.EDIT_SPOTIFY_SUCCESS);
      socket.off(socketEvents.EDIT_SPOTIFY_ERROR);
      socket.off(socketEvents.EDIT_YOUTUBE_SUCCESS);
      socket.off(socketEvents.EDIT_YOUTUBE_ERROR);
    };
  }, [socket, editingSongId]);

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  // --- My Requests Search State ---
  const [isSearchingMyRequests, setIsSearchingMyRequests] = useState(false);
  const [myRequestsSearchResults, setMyRequestsSearchResults] = useState<SongRequest[]>([]);
  const [myRequestsSearchTotal, setMyRequestsSearchTotal] = useState(0);
  const [myRequestsSearchPage, setMyRequestsSearchPage] = useState(1);
  const [isLoadingMyRequestsSearch, setIsLoadingMyRequestsSearch] = useState(false);
  const MY_REQUESTS_SEARCH_PAGE_SIZE = 20;

  // Effect: Trigger Search When Needed
  useEffect(() => {
    if (!socket || activeTab !== 'my-requests' || !currentUser?.login) return;
    if (searchTerm.trim() === "") {
      setIsSearchingMyRequests(false);
      setMyRequestsSearchResults([]);
      setMyRequestsSearchTotal(0);
      setMyRequestsSearchPage(1);
      return;
    }
    setIsSearchingMyRequests(true);
    setIsLoadingMyRequestsSearch(true);
    setMyRequestsSearchPage(1);
    socket.emit('searchUserHistory', {
      userLogin: currentUser.login,
      query: searchTerm,
      limit: MY_REQUESTS_SEARCH_PAGE_SIZE,
      offset: 0
    }, (res: any) => {
      if (res && !res.error) {
        setMyRequestsSearchResults(res.results || []);
        setMyRequestsSearchTotal(res.total || 0);
      } else {
        setMyRequestsSearchResults([]);
        setMyRequestsSearchTotal(0);
      }
      setIsLoadingMyRequestsSearch(false);
    });
  }, [searchTerm, socket, activeTab, currentUser]);

  // Load More Search Results Function
  const loadMoreMyRequestsSearchResults = () => {
    if (!socket || isLoadingMyRequestsSearch || !currentUser?.login) return;
    setIsLoadingMyRequestsSearch(true);
    const nextOffset = myRequestsSearchPage * MY_REQUESTS_SEARCH_PAGE_SIZE;
    socket.emit('searchUserHistory', {
      userLogin: currentUser.login,
      query: searchTerm,
      limit: MY_REQUESTS_SEARCH_PAGE_SIZE,
      offset: nextOffset
    }, (res: any) => {
      if (res && !res.error) {
        setMyRequestsSearchResults(prev => [...prev, ...(res.results || [])]);
        setMyRequestsSearchTotal(res.total || 0);
        setMyRequestsSearchPage(prev => prev + 1);
      }
      setIsLoadingMyRequestsSearch(false);
    });
  };

  return (
    <ErrorBoundary>
      <div className="w-full max-w-4xl mx-auto p-6 bg-brand-purple-deep/70 text-white rounded-lg shadow-xl border border-brand-purple-neon/20 backdrop-blur-md shadow-glow-purple">
        <Header isConnected={isConnected} />
        <ActiveSong song={state.activeSong} isLoading={state.isLoading} />

        <div className="mb-4 relative">
          <Input
            type="text"
            placeholder="Search songs, artists, or requesters..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 bg-brand-purple-dark/50 border-brand-purple-neon/30 text-white focus:ring-brand-pink-neon focus:border-brand-pink-neon placeholder:text-brand-purple-light/50"
          />
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-brand-purple-light/60" size={20} />
        </div>

        <Tabs defaultValue="queue" className="w-full" onValueChange={setActiveTab}>
          {/* Tabs Style */}
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 bg-brand-purple-dark/50 border border-brand-purple-neon/10 p-1 h-auto rounded-lg">
            <TabsTrigger value="queue" className="data-[state=active]:bg-brand-purple-dark data-[state=active]:text-brand-pink-light data-[state=active]:shadow-md data-[state=active]:shadow-brand-black/30 text-brand-purple-light/80 hover:bg-brand-purple-dark/70 hover:text-white transition-all rounded-md data-[state=active]:border data-[state=active]:border-brand-pink-neon/50 data-[state=active]:text-glow-pink relative group text-xs sm:text-sm">
              {/* Add shiny icon to active state */}
              <div className="absolute -top-1 -right-1 w-3 h-3 opacity-0 group-data-[state=active]:opacity-100 transition-opacity duration-300">
                <Image src="/shiny.png" alt="" fill sizes="12px" className="object-contain"/>
              </div>
              <Music className="mr-1 sm:mr-1.5" size={16} />
              {/* Use totalQueueCount for display */}
              <span className="truncate">Queue ({totalQueueCount})</span>
            </TabsTrigger>
            <TabsTrigger value="history" className="data-[state=active]:bg-brand-purple-dark data-[state=active]:text-brand-pink-light data-[state=active]:shadow-md data-[state=active]:shadow-brand-black/30 text-brand-purple-light/80 hover:bg-brand-purple-dark/70 hover:text-white transition-all rounded-md data-[state=active]:border data-[state=active]:border-brand-pink-neon/50 data-[state=active]:text-glow-pink relative group text-xs sm:text-sm">
              {/* Add shiny icon to active state */}
              <div className="absolute -top-1 -right-1 w-3 h-3 opacity-0 group-data-[state=active]:opacity-100 transition-opacity duration-300">
                <Image src="/shiny.png" alt="" fill sizes="12px" className="object-contain"/>
              </div>
              <History className="mr-1 sm:mr-1.5" size={16} />
              {/* Use totalHistoryCount for display */}
              <span className="truncate">History ({totalHistoryCount})</span>
            </TabsTrigger>
            <TabsTrigger value="my-requests" className="data-[state=active]:bg-brand-purple-dark data-[state=active]:text-brand-pink-light data-[state=active]:shadow-md data-[state=active]:shadow-brand-black/30 text-brand-purple-light/80 hover:bg-brand-purple-dark/70 hover:text-white transition-all rounded-md data-[state=active]:border data-[state=active]:border-brand-pink-neon/50 data-[state=active]:text-glow-pink disabled:opacity-50 disabled:pointer-events-none relative group text-xs sm:text-sm" disabled={!currentUser}>
              {/* Add shiny icon to active state */}
              <div className="absolute -top-1 -right-1 w-3 h-3 opacity-0 group-data-[state=active]:opacity-100 transition-opacity duration-300">
                <Image src="/shiny.png" alt="" fill sizes="12px" className="object-contain"/>
              </div>
              <User className="mr-1 sm:mr-1.5" size={16} />
              <span className="truncate">My Requests {currentUser ? `(${myRequestsCount})` : ''}</span>
            </TabsTrigger>
            <TabsTrigger value="request-plan" className="data-[state=active]:bg-brand-purple-dark data-[state=active]:text-brand-pink-light data-[state=active]:shadow-md data-[state=active]:shadow-brand-black/30 text-brand-purple-light/80 hover:bg-brand-purple-dark/70 hover:text-white transition-all rounded-md data-[state=active]:border data-[state=active]:border-brand-pink-neon/50 data-[state=active]:text-glow-pink disabled:opacity-50 disabled:pointer-events-none relative group text-xs sm:text-sm" disabled={!currentUser}>
              {/* Add shiny icon to active state */}
              <div className="absolute -top-1 -right-1 w-3 h-3 opacity-0 group-data-[state=active]:opacity-100 transition-opacity duration-300">
                <Image src="/shiny.png" alt="" fill sizes="12px" className="object-contain"/>
              </div>
              <ListPlus className="mr-1 sm:mr-1.5" size={16} />
              <span className="truncate">Request Plan {currentUser ? `(${requestPlan.length})` : ''}</span>
            </TabsTrigger>
          </TabsList>
          <TabsContent value="queue" className="mt-4">
            <ActiveQueueTab
              songs={state.queue}
              searchTerm={searchTerm}
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
          </TabsContent>
          <TabsContent value="history" className="mt-4">
            <HistoryTab
              songs={state.history}
              searchResults={searchResults}
              isSearching={isSearching}
              isLoadingSearch={isLoadingSearch}
              searchTotal={searchTotal}
              searchTerm={searchTerm}
              loadMoreSearchResults={loadMoreSearchResults}
              hasMoreHistory={hasMoreHistory}
              isLoadingMoreHistory={isLoadingMoreHistory}
              loadMoreHistory={loadMoreHistory}
              totalHistoryCount={totalHistoryCount}
              currentUser={currentUser}
              socket={socket}
            />
          </TabsContent>
          <TabsContent value="my-requests" className="mt-4">
            <ErrorBoundary>
              <MyRequestsTab
                currentUser={currentUser}
                state={state}
                searchTerm={searchTerm}
                isLoading={state.isLoading}
                socket={socket}
                myRequestsHistory={isSearchingMyRequests ? myRequestsSearchResults : myRequestsHistory}
                myRequestsTotal={isSearchingMyRequests ? myRequestsSearchTotal : myRequestsTotal}
                hasMoreMyRequests={isSearchingMyRequests ? (myRequestsSearchResults.length < myRequestsSearchTotal) : hasMoreMyRequests}
                isLoadingMyRequests={isSearchingMyRequests ? isLoadingMyRequestsSearch : isLoadingMyRequests}
                loadMoreMyRequests={isSearchingMyRequests ? loadMoreMyRequestsSearchResults : () => {
                  if (!socket || !currentUser?.login || isLoadingMyRequests) return;
                  setIsLoadingMyRequests(true);
                  socket.emit('getUserHistory', {
                    userLogin: currentUser.login,
                    limit: constants.HISTORY_PAGE_SIZE,
                    offset: myRequestsOffset
                  });
                }}
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
          </TabsContent>
          <TabsContent value="request-plan" className="mt-4">
            <ErrorBoundary>
              <RequestPlanTab 
                currentUser={currentUser}
                requestPlan={requestPlan}
                searchTerm={searchTerm}
                isLoading={state.isLoading}
                onDragEnd={onDragEnd}
                onRemove={handleRemoveFromRequestPlan}
                socket={socket}
                isYoutubeDialogOpen={isYoutubeDialogOpen}
                setIsYoutubeDialogOpen={setIsYoutubeDialogOpen}
                setRequestPlan={setRequestPlan}
              />
            </ErrorBoundary>
          </TabsContent>
        </Tabs>

        {/* Add the EditSongLinksDialog */}
        <EditSongLinksDialog
          isOpen={isEditSongLinksDialogOpen}
          onOpenChange={setIsEditSongLinksDialogOpen}
          currentUser={currentUser}
          socket={socket}
          songId={editingSongId}
          initialSpotifyUrl={currentSpotifyUrl}
          initialYouTubeUrl={currentYouTubeUrl}
          spotifySuccess={editSpotifySuccess}
          spotifyError={editSpotifyError}
          youtubeSuccess={editYouTubeSuccess}
          youtubeError={editYouTubeError}
          onReset={() => {
            setEditSpotifyError(null);
            setEditSpotifySuccess(false);
            setEditYouTubeError(null);
            setEditYouTubeSuccess(false);
          }}
        />
      </div>
    </ErrorBoundary>
  )
}