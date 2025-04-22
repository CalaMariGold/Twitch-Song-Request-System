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
import { LogIn, AlertCircle, Shield, LogOut, Settings, Music2, Home, ChevronDown } from "lucide-react"
import { getTwitchAuthUrl } from "@/lib/auth"
import { ConnectionStatus } from "@/components/ConnectionStatus"
import { useEffect, useState } from "react"
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

interface HeaderProps {
  isConnected: boolean
}

const ERROR_MESSAGES = {
  missing_code: "Authentication failed: Missing authorization code",
  auth_failed: "Authentication failed: Please try again"
}

interface TwitchUser {
  id: string
  login: string
  display_name: string
  profile_image_url: string
  isAdmin: boolean
}

export function Header({ isConnected }: HeaderProps) {
  const [user, setUser] = useState<TwitchUser | null>(null)
  const [error, setError] = useState<string | null>(null)
  const searchParams = useSearchParams()

  const readUserFromCookie = () => {
    const cookies = document.cookie.split(';').reduce((acc, cookie) => {
      const [key, value] = cookie.trim().split('=')
      acc[key] = value
      return acc
    }, {} as Record<string, string>)
    
    const userJson = cookies['twitch_user']
    if (userJson) {
      try {
        const decoded = decodeURIComponent(userJson)
        const userData = JSON.parse(decoded)
        setUser(userData)
      } catch (e) {
        console.error('Failed to parse user cookie:', e)
      }
    }
  }

  const handleLogout = () => {
    document.cookie = 'twitch_token=; Max-Age=0; path=/'
    document.cookie = 'twitch_user=; Max-Age=0; path=/'
    setUser(null)
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
    }

    readUserFromCookie()
  }, [searchParams])

  return (
    <div className="w-full">
      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="flex items-center justify-between py-4 px-6 bg-gray-800/50 backdrop-blur-sm rounded-lg mb-6">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2 hover:text-purple-400 transition-colors">
            <Music2 className="h-6 w-6" />
            <h1 className="text-2xl font-bold">Song Request Queue</h1>
          </Link>
          <ConnectionStatus isConnected={isConnected} />
        </div>
        
        <div className="flex items-center gap-4">
          {user ? (
            <div className="flex items-center gap-3">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="flex items-center gap-2 hover:bg-gray-800/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-gray-300">{user.display_name}</span>
                      <Avatar className="h-10 w-10 ring-2 ring-purple-500/20">
                        <AvatarImage src={user.profile_image_url} alt={user.display_name} />
                        <AvatarFallback>{user.display_name.slice(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <ChevronDown className="h-4 w-4 text-gray-400" />
                    </div>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="end">
                  <DropdownMenuLabel>
                    <div className="flex flex-col">
                      <span>{user.display_name}</span>
                      {user.isAdmin && (
                        <span className="text-xs text-purple-400 flex items-center gap-1">
                          <Shield size={12} />
                          Admin
                        </span>
                      )}
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <Link href="/">
                    <DropdownMenuItem className="cursor-pointer">
                      <Home className="mr-2 h-4 w-4" />
                      <span>Home</span>
                    </DropdownMenuItem>
                  </Link>
                  {user.isAdmin && (
                    <Link href="/admin">
                      <DropdownMenuItem className="cursor-pointer">
                        <Settings className="mr-2 h-4 w-4" />
                        <span>Admin Panel</span>
                      </DropdownMenuItem>
                    </Link>
                  )}
                  <DropdownMenuItem className="cursor-pointer text-red-500" onClick={handleLogout}>
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
              className="flex items-center gap-2 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border-purple-500/20"
            >
              <LogIn size={16} />
              Login with Twitch
            </Button>
          )}
        </div>
      </div>
    </div>
  )
} 