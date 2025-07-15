import { SongRequest } from "@/lib/types";
import { SongList } from "./SongList";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import React from "react";
import { Socket } from "socket.io-client";

interface HistoryTabProps {
  songs: SongRequest[];
  searchResults: SongRequest[];
  isSearching: boolean;
  isLoadingSearch: boolean;
  searchTotal: number;
  searchTerm: string;
  loadMoreSearchResults: () => void;
  hasMoreHistory: boolean;
  isLoadingMoreHistory: boolean;
  loadMoreHistory: () => void;
  totalHistoryCount: number;
  currentUser: { id?: string; login?: string } | null;
  socket: Socket | null;
}

export function HistoryTab({
  songs,
  searchResults,
  isSearching,
  isLoadingSearch,
  searchTotal,
  searchTerm,
  loadMoreSearchResults,
  hasMoreHistory,
  isLoadingMoreHistory,
  loadMoreHistory,
  totalHistoryCount,
  currentUser,
  socket,
}: HistoryTabProps) {
  return (
    <ErrorBoundary>
      {/* Show loading animation when searching */}
      {isSearching && isLoadingSearch && (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="w-8 h-8 animate-spin text-brand-pink-neon" />
          <span className="ml-3 text-brand-purple-light/80 text-base">Searching...</span>
        </div>
      )}
      {/* Show 'No songs found' message if search is done and no results */}
      {isSearching && !isLoadingSearch && searchResults.length === 0 && (
        <div className="flex flex-col items-center justify-center h-32">
          <Search size={32} className="text-brand-purple-light/70 mb-2" />
          <p className="text-brand-purple-light/70 text-base">No songs found</p>
          <p className="text-brand-purple-light/40 text-sm mt-1">Try a different search term.</p>
        </div>
      )}
      {/* Only show SongList if not loading and there are results, or if not searching */}
      {(!isSearching || (!isLoadingSearch && searchResults.length > 0)) && (
        <SongList
          songs={isSearching ? searchResults : songs}
          isHistory={true}
          currentUser={currentUser}
          socket={socket}
        />
      )}
      {/* Load More for search or normal history */}
      {isSearching ? (
        searchResults.length < searchTotal && (
          <div className="mt-6 flex justify-center">
            <Button
              variant="outline"
              className="bg-brand-purple-dark/50 border-brand-purple-neon/20 text-brand-purple-light hover:bg-brand-purple-dark/70 hover:border-brand-purple-neon/40 hover:text-white transition-all"
              onClick={loadMoreSearchResults}
              disabled={isLoadingSearch}
            >
              {isLoadingSearch ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading...
                </>
              ) : (
                <>Load More Results</>
              )}
            </Button>
          </div>
        )
      ) : (
        hasMoreHistory && songs.length > 0 && (
          <div className="mt-6 flex justify-center">
            <Button
              variant="outline"
              className="bg-brand-purple-dark/50 border-brand-purple-neon/20 text-brand-purple-light hover:bg-brand-purple-dark/70 hover:border-brand-purple-neon/40 hover:text-white transition-all"
              onClick={loadMoreHistory}
              disabled={isLoadingMoreHistory}
            >
              {isLoadingMoreHistory ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading...
                </>
              ) : (
                <>Load More History</>
              )}
            </Button>
          </div>
        )
      )}
      {/* End of history message for search */}
      {isSearching && searchResults.length >= searchTotal && searchResults.length > 0 && (
        <div className="mt-4 text-center text-brand-purple-light/60 text-sm">
          End of search results
        </div>
      )}
      {/* End of history message for normal history */}
      {!isSearching && !hasMoreHistory && songs.length > 0 && (
        <div className="mt-4 text-center text-brand-purple-light/60 text-sm">
          End of history reached
        </div>
      )}
    </ErrorBoundary>
  );
} 