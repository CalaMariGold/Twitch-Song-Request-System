"use client"

import Link from "next/link"
import SongRequestQueue from "@/components/song-request-queue"
import AnimatedBackground from "@/components/animated-background"
import { Button } from "@/components/ui/button"

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex flex-col items-center justify-center p-8">
      <AnimatedBackground />
      <div className="w-full max-w-4xl mx-auto">
        <div className="flex justify-end mb-4">
          <Link href="/admin">
            <Button variant="outline">Admin Panel</Button>
          </Link>
        </div>
        <SongRequestQueue />
      </div>
    </main>
  )
}

