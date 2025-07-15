import { useState, useEffect } from "react";
import { PlannedRequest } from "@/lib/types";
import { getRequestPlan, saveRequestPlan } from "@/lib/utils";

export interface TwitchUserDisplay {
  login: string;
  display_name: string;
  profile_image_url: string;
}

export function useTwitchUser() {
  const [currentUser, setCurrentUser] = useState<TwitchUserDisplay | null>(null);
  const [requestPlan, setRequestPlan] = useState<PlannedRequest[]>([]);

  useEffect(() => {
    const readUserFromCookie = () => {
      const cookies = document.cookie.split(';').reduce((acc, cookie) => {
        const [key, value] = cookie.trim().split('=');
        acc[key] = value;
        return acc;
      }, {} as Record<string, string>);
      const userDisplayJson = cookies['twitch_user_display'];
      if (userDisplayJson) {
        try {
          const decoded = decodeURIComponent(userDisplayJson);
          setCurrentUser(prevUser => {
            if (JSON.stringify(prevUser) !== decoded) {
              const newUser = JSON.parse(decoded);
              if (newUser.login) {
                const loadedPlan = getRequestPlan(newUser.login);
                setRequestPlan(loadedPlan);
              }
              return newUser;
            }
            return prevUser;
          });
        } catch (e) {
          console.error('Failed to parse user display cookie:', e);
          setCurrentUser(null);
          setRequestPlan([]);
        }
      } else {
        setCurrentUser(null);
        setRequestPlan([]);
      }
    };
    readUserFromCookie();
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'logout' || e.key === 'login') {
        readUserFromCookie();
      } else if (e.key === 'twitch_user_display') {
        readUserFromCookie();
      }
    };
    window.addEventListener('storage', handleStorageChange);
    const intervalId = setInterval(readUserFromCookie, 5000);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(intervalId);
    };
  }, []);

  return {
    currentUser,
    setCurrentUser,
    requestPlan,
    setRequestPlan,
  };
} 