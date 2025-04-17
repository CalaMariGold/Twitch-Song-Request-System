import { NextResponse } from 'next/server'
import { exchangeCodeForToken, getTwitchUserInfo, isAdmin } from '@/lib/auth'
import { config } from '@/lib/config'

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

    // Set cookies in the response
    response.cookies.set('twitch_token', tokenData.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: tokenData.expires_in,
      path: '/'
    })
    
    response.cookies.set('twitch_user', JSON.stringify({
      id: userInfo.id,
      login: userInfo.login,
      display_name: userInfo.display_name,
      profile_image_url: userInfo.profile_image_url,
      isAdmin: isAdmin(userInfo.login)
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