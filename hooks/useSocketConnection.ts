import { useState, useEffect } from "react";
import { io, Socket } from "socket.io-client";
import { AppState, SongRequest } from "@/lib/types";
import { constants, socketEvents } from "@/lib/config";

export function useSocketConnection(
  setState: React.Dispatch<React.SetStateAction<AppState>>,
  setMyRequestsHistory: React.Dispatch<React.SetStateAction<SongRequest[]>>,
  setMyRequestsTotal: React.Dispatch<React.SetStateAction<number>>,
  setMyRequestsOffset: React.Dispatch<React.SetStateAction<number>>,
  setHasMoreMyRequests: React.Dispatch<React.SetStateAction<boolean>>,
  setIsLoadingMyRequests: React.Dispatch<React.SetStateAction<boolean>>,
  currentUserRef: React.MutableRefObject<any>,
  setTotalQueueCount: React.Dispatch<React.SetStateAction<number>>,
  setTotalHistoryCount: React.Dispatch<React.SetStateAction<number>>
) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const socketHost = process.env.NEXT_PUBLIC_SOCKET_URL || '';
    let connectionAttempts = 0;
    const maxAttempts = 5;
    const newSocket = io(socketHost, {
      transports: ['polling', 'websocket'],
      reconnectionAttempts: constants.SOCKET_RECONNECT_ATTEMPTS,
      reconnectionDelay: constants.SOCKET_RECONNECT_DELAY,
      path: '/socket.io/',
      timeout: 20000,
      forceNew: true,
      autoConnect: true,
      upgrade: true
    });
    newSocket.on('connect', () => {
      setIsConnected(true);
      connectionAttempts = 0;
      newSocket.emit('getState');
    });
    newSocket.on('connect_error', (error: Error) => {
      console.error('Socket connection error:', error);
      connectionAttempts++;
      if (connectionAttempts === 1) {
        newSocket.io.opts.transports = ['websocket'];
      }
      if (connectionAttempts >= maxAttempts) {
        setState((prev: AppState) => ({
          ...prev,
          queue: [],
          history: [],
          activeSong: null,
          isLoading: false,
          error: new Error(`Failed to connect to the server after ${maxAttempts} attempts.`)
        }));
      }
    });
    newSocket.on('initialState', (serverState: Partial<AppState>) => {
      setState((prev: AppState) => ({
        ...prev,
        queue: serverState.queue || [],
        history: serverState.history || [],
        activeSong: serverState.activeSong || null,
        settings: serverState.settings || {},
        blacklist: serverState.blacklist || [],
        blockedUsers: serverState.blockedUsers || [],
        isLoading: false,
        error: null
      }));
    });
    newSocket.on(socketEvents.NEW_SONG_REQUEST, (song: SongRequest) => {
      setState((prev: AppState) => ({
        ...prev,
        queue: [...prev.queue, song]
      }));
    });
    newSocket.on(socketEvents.QUEUE_UPDATE, (updatedQueue: SongRequest[]) => {
      setState((prev: AppState) => ({ ...prev, queue: updatedQueue }));
    });
    newSocket.on('historyUpdate', (updatedHistory: SongRequest[]) => {
      setState((prev: AppState) => ({ ...prev, history: updatedHistory }));
    });
    newSocket.on('songFinished', (finishedSong: SongRequest) => {
      if (currentUserRef.current && finishedSong.requesterLogin?.toLowerCase() === currentUserRef.current.login.toLowerCase()) {
        newSocket.emit('getUserHistory', {
          userLogin: currentUserRef.current.login,
          limit: constants.HISTORY_PAGE_SIZE,
          offset: 0
        });
      }
    });
    newSocket.on(socketEvents.ACTIVE_SONG, (song: SongRequest | null) => {
      setState((prev: AppState) => ({
        ...prev,
        activeSong: song,
      }));
    });
    newSocket.on('moreHistoryData', (historyChunk: SongRequest[]) => {
      if (historyChunk.length === 0) {
        setState(prev => ({ ...prev, hasMoreHistory: false }));
      } else {
        setState((prev: AppState) => ({
          ...prev,
          history: [...prev.history, ...historyChunk],
        }));
      }
      setState(prev => ({ ...prev, isLoadingMoreHistory: false }));
    });
    newSocket.on('totalCountsUpdate', (counts: { history: number; queue: number }) => {
      setTotalHistoryCount(counts.history);
      setTotalQueueCount(counts.queue);
    });
    newSocket.on('userHistoryData', ({ history: newHistory, total, offset }) => {
      if (offset === 0) {
        setMyRequestsHistory(newHistory);
      } else {
        setMyRequestsHistory(prev => [...prev, ...newHistory]);
      }
      setMyRequestsTotal(total);
      const newOffset = offset + newHistory.length;
      setMyRequestsOffset(newOffset);
      setHasMoreMyRequests(newOffset < total);
      setIsLoadingMyRequests(false);
    });
    newSocket.on('historyOrderChanged', () => {
      newSocket.emit('getState');
    });
    setSocket(newSocket);
    return () => {
      newSocket.off('historyOrderChanged');
      newSocket.disconnect();
    };
  }, [setState, setMyRequestsHistory, setMyRequestsTotal, setMyRequestsOffset, setHasMoreMyRequests, setIsLoadingMyRequests, currentUserRef, setTotalQueueCount, setTotalHistoryCount]);

  return { socket, setSocket, isConnected };
} 