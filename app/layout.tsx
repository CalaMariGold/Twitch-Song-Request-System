import { Inter } from "next/font/google"
import "./globals.css"

const inter = Inter({ subsets: ["latin"] })

export interface Song {
  id: string
  title: string
  artist: string
  requester: string
  requesterAvatar: string
  duration: string
  videoUrl?: string
}

export const metadata = {
  title: 'Song Request System',
  description: 'A Twitch-integrated song request system for drum streams',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  )
}

