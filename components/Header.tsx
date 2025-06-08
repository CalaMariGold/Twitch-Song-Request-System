"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { LogIn, AlertCircle, Shield, LogOut, Settings, Music2, Home, ChevronDown, User } from "lucide-react"
import { getTwitchAuthUrl, ADMIN_USERNAMES } from "@/lib/auth"
import { ConnectionStatus } from "@/components/ConnectionStatus"
import { useEffect, useState } from "react"
import { useSearchParams, usePathname } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { format } from 'date-fns-tz'

interface HeaderProps {
  isConnected: boolean
}

const ERROR_MESSAGES = {
  missing_code: "Authentication failed: Missing authorization code",
  auth_failed: "Authentication failed: Please try again",
  auth_required: "Authentication required: Please log in",
  not_admin: "Access denied: You don't have admin privileges"
}

interface TwitchUserDisplay {
  login: string
  display_name: string
  profile_image_url: string
  isAdmin: boolean
}

export function Header({ isConnected }: HeaderProps) {
  const [user, setUser] = useState<TwitchUserDisplay | null>(null)
  const [error, setError] = useState<string | null>(null)
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const isAdminPage = pathname?.includes('/admin')
  const [currentTimeEst, setCurrentTimeEst] = useState('')
  


  const readUserFromCookie = () => {
    const cookies = document.cookie.split(';').reduce((acc, cookie) => {
      const [key, value] = cookie.trim().split('=')
      acc[key] = value
      return acc
    }, {} as Record<string, string>)
    
    const userDisplayJson = cookies['twitch_user_display'];
    if (userDisplayJson) {
      try {
        const decoded = decodeURIComponent(userDisplayJson)
        const userData = JSON.parse(decoded)
        setUser(userData)
      } catch (e) {
        console.error('Failed to parse user display cookie:', e)
        setUser(null);
      }
    } else {
      setUser(null);
    }
  }

  const handleLogout = () => {
    document.cookie = 'twitch_auth=; Max-Age=0; path=/; secure=; samesite=lax'
    document.cookie = 'twitch_user_display=; Max-Age=0; path=/; secure=; samesite=lax'
    document.cookie = 'twitch_user=; Max-Age=0; path=/'
    document.cookie = 'twitch_token=; Max-Age=0; path=/' 
    setUser(null)
    window.location.href = '/'
  }

  useEffect(() => {
    const errorCode = searchParams.get('error')
    const authSuccess = searchParams.get('auth')

    if (errorCode && ERROR_MESSAGES[errorCode as keyof typeof ERROR_MESSAGES]) {
      setError(ERROR_MESSAGES[errorCode as keyof typeof ERROR_MESSAGES])
      window.history.replaceState({}, '', window.location.pathname)
    }

    if (authSuccess === 'success') {
      readUserFromCookie()
      window.history.replaceState({}, '', window.location.pathname)
    } else {
      readUserFromCookie()
    }
    
    const handleStorage = (event: StorageEvent) => {
        if (event.key === 'logout' || event.key === 'login') {
            readUserFromCookie();
        }
    };
    window.addEventListener('storage', handleStorage);

    return () => {
        window.removeEventListener('storage', handleStorage);
    };

  }, [searchParams])

  useEffect(() => {
    const updateTime = () => {
      const estTime = format(new Date(), 'hh:mm a', { timeZone: 'America/New_York' })
      setCurrentTimeEst(estTime)
    }

    updateTime()
    const intervalId = setInterval(updateTime, 1000)

    return () => clearInterval(intervalId)
  }, [])

  return (
    <div className="w-full">
      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-col sm:flex-row items-center sm:justify-between py-3 px-4 bg-gradient-to-r from-brand-purple-dark/70 to-brand-purple-deep/70 backdrop-blur-sm rounded-lg mb-6 border border-brand-purple-neon/20 shadow-md gap-3 sm:gap-0">
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto justify-center sm:justify-start">
          <div className="flex flex-col items-center sm:items-start">
            <Link href="/" className="flex items-center gap-2 text-brand-pink-light hover:text-white hover:text-glow-pink transition-all duration-200 group">
              <h1 className="text-lg sm:text-2xl font-bold whitespace-nowrap">🥁 CalaMariGold Requests</h1>
              <div className="relative w-4 h-4 sm:w-5 sm:h-5 -ml-1 group-hover:animate-pulse flex-shrink-0">
                <Image 
                  src="/shiny.png" 
                  alt="Shiny emoji" 
                  fill
                  sizes="20px"
                  className="object-contain transform -rotate-12 group-hover:rotate-0 transition-transform duration-300"
                />
              </div>
            </Link>
            {currentTimeEst && (
              <div className="text-xs text-gray-400 mt-1 font-mono tracking-wider">
                Mari's Time: {currentTimeEst} EST
              </div>
            )}
          </div>
          <ConnectionStatus isConnected={isConnected} />
        </div>
        
        <div className="flex items-center justify-center sm:justify-end gap-4 w-full sm:w-auto">
          {user ? (
            <div className="flex items-center gap-3">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="flex items-center gap-2 hover:bg-gray-700/50 transition-colors rounded-full pr-2 pl-3">
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-gray-200 font-medium">{user.display_name}</span>
                      <Avatar className="h-8 w-8 ring-2 ring-purple-500/20">
                        <AvatarImage src={user.profile_image_url} alt={user.display_name} />
                        <AvatarFallback>{user.display_name.slice(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <ChevronDown className="h-4 w-4 text-gray-400" />
                    </div>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-60 bg-gray-800 border-gray-700 text-white" align="end">
                  <div className="flex items-start gap-3 p-3">
                    <Avatar className="h-10 w-10 ring-2 ring-purple-500/20">
                      <AvatarImage src={user.profile_image_url} alt={user.display_name} />
                      <AvatarFallback>{user.display_name.slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col">
                      <span className="font-medium">{user.display_name}</span>
                      <span className="text-xs text-gray-400">@{user.login}</span>
                    </div>
                  </div>
                  <DropdownMenuSeparator className="bg-gray-700" />
                  <Link href="/">
                    <DropdownMenuItem className="cursor-pointer hover:bg-gray-700 focus:bg-gray-700">
                      <Home className="mr-2 h-4 w-4" />
                      <span>Home</span>
                    </DropdownMenuItem>
                  </Link>
                  <Link href={`https://twitch.tv/${user.login}`} target="_blank">
                    <DropdownMenuItem className="cursor-pointer hover:bg-gray-700 focus:bg-gray-700">
                      <User className="mr-2 h-4 w-4" />
                      <span>View Twitch Profile</span>
                    </DropdownMenuItem>
                  </Link>
                  {user.isAdmin && (
                    <Link href="/admin">
                      <DropdownMenuItem className="cursor-pointer hover:bg-gray-700 focus:bg-gray-700">
                        <Shield className="mr-2 h-4 w-4" />
                        <span>Admin Dashboard</span>
                      </DropdownMenuItem>
                    </Link>
                  )}
                  <DropdownMenuSeparator className="bg-gray-700" />
                  <DropdownMenuItem 
                    className="cursor-pointer text-red-400 hover:bg-red-900/50 focus:bg-red-900/50 focus:text-red-300 hover:text-red-300" 
                    onClick={handleLogout}
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Log Out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : (
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => window.location.href = getTwitchAuthUrl()}
              className="flex items-center gap-2 bg-brand-pink-neon/10 hover:bg-brand-pink-neon/20 text-brand-pink-light border-brand-pink-neon/50 hover:border-brand-pink-neon/80 hover:shadow-glow-pink-sm transition-all duration-200 relative group"
            >
              <LogIn size={16} />
              Login with Twitch
              <div className="absolute -top-1 -right-1 w-3 h-3 opacity-70 group-hover:opacity-100 group-hover:scale-110 transition-all duration-200">
                  <Image src="/shiny.png" alt="" fill sizes="12px" className="object-contain"/>
              </div>
            </Button>
          )}
        </div>
      </div>
    </div>
  )
} 