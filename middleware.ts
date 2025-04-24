import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { cookies } from 'next/headers'

// List of Twitch usernames that have admin access from environment variable
const ADMIN_USERNAMES = process.env.ADMIN_USERNAMES 
  ? process.env.ADMIN_USERNAMES.split(',').map(name => name.trim()) 
  : []

export function middleware(request: NextRequest) {
  // Skip middleware for Socket.IO connections
  if (request.nextUrl.pathname.startsWith('/socket.io')) {
    return NextResponse.next()
  }

  // Only run this middleware on admin routes
  if (!request.nextUrl.pathname.startsWith('/admin')) {
    return NextResponse.next()
  }

  // Get the twitch_user cookie
  const twitchUserCookie = request.cookies.get('twitch_user')
  
  // If no cookie, redirect to login
  if (!twitchUserCookie) {
    return NextResponse.redirect(new URL('/?error=auth_required', request.url))
  }

  try {
    // Parse the cookie value
    const userData = JSON.parse(decodeURIComponent(twitchUserCookie.value))
    
    // Check if the user is admin
    const isAdmin = ADMIN_USERNAMES.some(
      adminName => adminName.toLowerCase() === userData.login.toLowerCase()
    )

    // If not admin, redirect to home with error
    if (!isAdmin) {
      return NextResponse.redirect(new URL('/?error=not_admin', request.url))
    }

    // Allow access to admin route for admins
    return NextResponse.next()
  } catch (error) {
    console.error('Error parsing twitch user cookie:', error)
    // If there's an error, redirect to login
    return NextResponse.redirect(new URL('/?error=auth_required', request.url))
  }
}

// Only run middleware on admin routes and exclude socket.io paths
export const config = {
  matcher: [
    '/admin/:path*',
    '/((?!socket\\.io).*)' // Exclude socket.io paths from middleware
  ]
} 