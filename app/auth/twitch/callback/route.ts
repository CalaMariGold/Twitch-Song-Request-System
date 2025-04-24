import { NextResponse } from 'next/server'
import { exchangeCodeForToken, getTwitchUserInfo, isAdmin } from '@/lib/auth'
import { config } from '@/lib/config'
import { writeFile } from 'fs/promises'
import path from 'path'
import fs from 'fs/promises'

// Define path for storing the token
const persistentPath = process.env.PERSISTENT_DATA_PATH; // Path provided by Railway Volume mount
const baseAuthDir = persistentPath ? path.join(persistentPath, 'auth') : path.join(process.cwd(), 'auth');
const tokenFileName = 'auth_tokens.json';
const tokenFilePath = path.join(baseAuthDir, tokenFileName);

async function ensureDirExists(filePath: string) {
    const dir = path.dirname(filePath);
    try {
        await fs.access(dir); // Check if directory exists
    } catch (error: any) {
        if (error.code === 'ENOENT') { // If directory doesn't exist
            await fs.mkdir(dir, { recursive: true }); // Create it recursively
        } else {
            throw error; // Re-throw other errors
        }
    }
}

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
    
    // --- NEW: Save the token to a file --- 
    // IMPORTANT: This is for local development ONLY. 
    // In production, tokens should be stored securely (e.g., encrypted DB).
    // Access TWITCH_CHANNEL_NAME directly from process.env in API routes
    const broadcasterLogin = process.env.TWITCH_CHANNEL_NAME;
    if (!broadcasterLogin) {
        console.error("TWITCH_CHANNEL_NAME environment variable is not set!");
        // Handle the error appropriately - maybe redirect with a specific error?
        throw new Error("Server configuration error: Missing TWITCH_CHANNEL_NAME");
    }

    if (userInfo.login.toLowerCase() === broadcasterLogin.toLowerCase()) {
        console.log(`Broadcaster ${userInfo.login} logged in. Saving token...`);
        const tokenToSave = {
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token, // Good practice to save refresh token
            expires_at: Date.now() + tokenData.expires_in * 1000, // Calculate expiry timestamp
            scope: tokenData.scope
        };
        try {
            await ensureDirExists(tokenFilePath); // Ensure the directory exists before writing
            await writeFile(tokenFilePath, JSON.stringify(tokenToSave, null, 2), 'utf-8');
            console.log(`User token saved to ${tokenFilePath}`);
        } catch (fileError) {
            console.error(`Error saving user token to file ${tokenFilePath}:`, fileError);
            // Decide if this should prevent login or just log an error
            // For now, we'll just log it and continue.
        }
    } else {
         console.log(`User ${userInfo.login} logged in, but is not the configured broadcaster (${broadcasterLogin}). Token not saved.`);
    }
    // --- END: Save token --- 

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