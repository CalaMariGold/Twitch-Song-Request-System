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

  // Get the twitch_auth cookie (httpOnly secure cookie)
  const twitchAuthCookie = request.cookies.get('twitch_auth')
  
  // If no cookie, redirect to login
  if (!twitchAuthCookie) {
    return NextResponse.redirect(new URL('/?error=auth_required', request.url))
  }

  try {
    // Parse the cookie value
    const userData = JSON.parse(decodeURIComponent(twitchAuthCookie.value))
    
    // Check if the user is admin directly from the cookie's isAdmin flag
    // This provides a second layer of verification beyond what's in the cookie
    const isAdminFromUsername = ADMIN_USERNAMES.some(
      adminName => adminName.toLowerCase() === userData.login.toLowerCase()
    )

    // User must have both the isAdmin flag in the cookie AND their username must be in ADMIN_USERNAMES
    const isAuthorized = userData.isAdmin === true && isAdminFromUsername

    // If not admin, redirect to home with error
    if (!isAuthorized) {
      return NextResponse.redirect(new URL('/?error=not_admin', request.url))
    }

    // Allow access to admin route for admins
    return NextResponse.next()
  } catch (error) {
    console.error('Error parsing twitch auth cookie:', error)
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