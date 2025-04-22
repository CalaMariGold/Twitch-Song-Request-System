import { config } from './config'

// List of Twitch usernames that have admin access
export const ADMIN_USERNAMES = process.env.ADMIN_USERNAMES 
  ? process.env.ADMIN_USERNAMES.split(',').map(name => name.trim()) 
  : []

export interface TwitchUser {
  id: string
  login: string
  display_name: string
  profile_image_url: string
  type: string
  broadcaster_type: string
}

export interface TwitchAuthResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  scope: string[]
  token_type: string
}

/**
 * Get Twitch OAuth URL for login
 */
export function getTwitchAuthUrl(): string {
  const scopes = ['user:read:email', 'channel:read:redemptions']
  
  return `https://id.twitch.tv/oauth2/authorize?` +
    `client_id=${config.NEXT_PUBLIC_TWITCH_CLIENT_ID}&` +
    `redirect_uri=${config.NEXT_PUBLIC_TWITCH_REDIRECT_URI}&` +
    `response_type=code&` +
    `scope=${scopes.join(' ')}`
}

/**
 * Exchange code for access token
 */
export async function exchangeCodeForToken(code: string): Promise<TwitchAuthResponse> {
  const params = new URLSearchParams({
    client_id: config.NEXT_PUBLIC_TWITCH_CLIENT_ID,
    client_secret: config.TWITCH_CLIENT_SECRET,
    code,
    grant_type: 'authorization_code',
    redirect_uri: config.NEXT_PUBLIC_TWITCH_REDIRECT_URI
  })

  const response = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    body: params
  })

  if (!response.ok) {
    throw new Error('Failed to exchange code for token')
  }

  return response.json()
}

/**
 * Get user info from Twitch API
 */
export async function getTwitchUserInfo(accessToken: string): Promise<TwitchUser> {
  const response = await fetch('https://api.twitch.tv/helix/users', {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Client-Id': config.NEXT_PUBLIC_TWITCH_CLIENT_ID
    }
  })

  if (!response.ok) {
    throw new Error('Failed to get user info')
  }

  const data = await response.json()
  return data.data[0]
}

/**
 * Check if a user is an admin
 */
export function isAdmin(username: string): boolean {
  // Normalize the usernames to lowercase for comparison
  const normalizedUsernames = ADMIN_USERNAMES.map(name => name.toLowerCase())
  return normalizedUsernames.includes(username.toLowerCase())
}

/**
 * Validate session token
 */
export async function validateToken(accessToken: string): Promise<boolean> {
  try {
    const response = await fetch('https://id.twitch.tv/oauth2/validate', {
      headers: {
        'Authorization': `OAuth ${accessToken}`
      }
    })
    return response.ok
  } catch (error) {
    return false
  }
} 