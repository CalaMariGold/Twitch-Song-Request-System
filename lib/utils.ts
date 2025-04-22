import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import React from "react"
import { SongRequest } from "./types"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Common utility functions for the song request system
 */

/**
 * Format timestamp to a human-readable date/time
 * Uses Eastern Time (UTC-4) for display
 * Shows "Today" instead of the date if the timestamp is from today
 */
export function formatTimestamp(isoString?: string): string {
  if (!isoString) return 'N/A'
  try {
    const date = new Date(isoString)
    const now = new Date()
    
    // Format options for the time portion (hour:minute)
    const timeOptions: Intl.DateTimeFormatOptions = {
      timeZone: 'America/New_York',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }
    
    // Check if the date is today
    const isToday = 
      date.getFullYear() === now.getFullYear() && 
      date.getMonth() === now.getMonth() && 
      date.getDate() === now.getDate()
    
    if (isToday) {
      // For today's date, just show "Today, HH:MM AM/PM"
      return `Today, ${date.toLocaleString('en-US', timeOptions)}`
    } else {
      // For other dates, show the full date and time
      return date.toLocaleString('en-US', {
        ...timeOptions,
        month: 'short',
        day: 'numeric'
      })
    }
  } catch (e) {
    return 'Invalid Date'
  }
}

/**
 * Format duration in seconds to a human-readable string (MM:SS or HH:MM:SS)
 */
export function formatDuration(totalSeconds?: number): string {
  if (totalSeconds === undefined || totalSeconds === null || totalSeconds < 0) {
    return '?:??'
  }
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = Math.floor(totalSeconds % 60)

  const paddedSeconds = seconds.toString().padStart(2, '0')

  if (hours > 0) {
    const paddedMinutes = minutes.toString().padStart(2, '0')
    return `${hours}:${paddedMinutes}:${paddedSeconds}`
  } else {
    return `${minutes}:${paddedSeconds}`
  }
}

/**
 * Calculate total duration of songs in a queue
 */
export function calculateTotalQueueDuration(songs: SongRequest[]): { 
  totalSeconds: number; 
  formatted: string;
} {
  const totalSeconds = songs.reduce((sum, song) => {
    return sum + (song.durationSeconds || 0) 
  }, 0)
  
  return {
    totalSeconds,
    formatted: formatDuration(totalSeconds)
  }
}

/**
 * Extract YouTube ID from a YouTube URL
 */
export function extractYouTubeId(url: string): string | null {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu.be\/)([\w-]+)/)
  return match ? match[1] : null
}

/**
 * Create a Spotify icon component
 */
export const SpotifyIcon = ({ className = "h-5 w-5" }: { className?: string }) => {
  return React.createElement("svg", {
    viewBox: "0 0 24 24",
    fill: "currentColor",
    className: className
  }, 
  React.createElement("path", {
    d: "M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"
  }));
};

// Format ISO date to readable string
export function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString)
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    })
  } catch (error) {
    return dateString
  }
} 