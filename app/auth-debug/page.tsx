"use client"

import { useState, useEffect } from "react"

export default function AuthDebugPage() {
  const [userCookie, setUserCookie] = useState<string | null>(null)
  const [parsedUser, setParsedUser] = useState<any>(null)

  useEffect(() => {
    // Get all cookies
    const cookies = document.cookie.split(';').reduce((acc, cookie) => {
      const [key, value] = cookie.trim().split('=')
      acc[key] = value
      return acc
    }, {} as Record<string, string>)
    
    const userJson = cookies['twitch_user']
    setUserCookie(userJson || null)
    
    if (userJson) {
      try {
        const decoded = decodeURIComponent(userJson)
        const userData = JSON.parse(decoded)
        setParsedUser(userData)
      } catch (e) {
        console.error('Failed to parse user cookie:', e)
      }
    }
  }, [])

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 p-8 text-white">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Auth Debug</h1>
        
        <div className="space-y-6">
          <div className="bg-gray-800 p-4 rounded-lg">
            <h2 className="text-xl font-semibold mb-2">Cookie Information</h2>
            <p>Twitch User Cookie Found: {userCookie ? 'Yes' : 'No'}</p>
          </div>
          
          {parsedUser && (
            <div className="bg-gray-800 p-4 rounded-lg">
              <h2 className="text-xl font-semibold mb-2">User Information</h2>
              <dl className="space-y-2">
                <div>
                  <dt className="font-semibold">User ID:</dt>
                  <dd>{parsedUser.id}</dd>
                </div>
                <div>
                  <dt className="font-semibold">Login (username):</dt>
                  <dd>{parsedUser.login}</dd>
                </div>
                <div>
                  <dt className="font-semibold">Display Name:</dt>
                  <dd>{parsedUser.display_name}</dd>
                </div>
                <div>
                  <dt className="font-semibold">Is Admin:</dt>
                  <dd>{parsedUser.isAdmin ? '✅ Yes' : '❌ No'}</dd>
                </div>
              </dl>
            </div>
          )}
          
          <div className="bg-gray-800 p-4 rounded-lg">
            <h2 className="text-xl font-semibold mb-2">Admin Check</h2>
            <p className="mb-4">According to auth.ts, the admins are: ['CalaMariGold']</p>
            <p>The admin check case sensitivity has been fixed. Please try:</p>
            <ol className="list-decimal list-inside ml-4 space-y-2">
              <li>Go to this debug page</li>
              <li>Check if your login username and isAdmin status match</li>
              <li>Log out and log back in if needed</li>
              <li>Try accessing the admin page again</li>
            </ol>
          </div>
          
          <div className="flex gap-4">
            <a href="/admin" className="bg-blue-600 px-4 py-2 rounded-md text-white font-medium">
              Try Admin Page
            </a>
            
            <button 
              onClick={() => {
                document.cookie = 'twitch_token=; Max-Age=0; path=/'
                document.cookie = 'twitch_user=; Max-Age=0; path=/'
                window.location.href = '/'
              }}
              className="bg-red-600 px-4 py-2 rounded-md text-white font-medium"
            >
              Log Out
            </button>
          </div>
        </div>
      </div>
    </div>
  )
} 