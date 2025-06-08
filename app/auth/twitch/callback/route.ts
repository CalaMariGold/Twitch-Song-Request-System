import { NextResponse } from 'next/server'
import { exchangeCodeForToken, getTwitchUserInfo, isAdmin } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    // Get the code from the URL
    const url = new URL(request.url)
    const code = url.searchParams.get('code')
    
    if (!code) {
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}?error=missing_code`)
    }

    // Exchange code for token
    const tokenData = await exchangeCodeForToken(code)
    
    // Get user info
    const userInfo = await getTwitchUserInfo(tokenData.access_token)
    
    // Create response with redirect
    const response = NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}?auth=success`)

    // Set two cookies: one for authentication (httpOnly) and one for UI display (non-httpOnly)
    // Secure auth cookie that can't be accessed by JavaScript
    response.cookies.set('twitch_auth', JSON.stringify({
      id: userInfo.id,
      login: userInfo.login,
      isAdmin: isAdmin(userInfo.login)
    }), {
      httpOnly: true, // Can't be accessed by JavaScript
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: tokenData.expires_in,
      path: '/'
    })
    
    // Non-sensitive UI data that can be accessed by JavaScript
    response.cookies.set('twitch_user_display', JSON.stringify({
      display_name: userInfo.display_name,
      profile_image_url: userInfo.profile_image_url,
      login: userInfo.login
    }), {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: tokenData.expires_in,
      path: '/'
    })

    return response
    
  } catch (error) {
    console.error('Auth callback error:', error)
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}?error=auth_failed`)
  }
} 