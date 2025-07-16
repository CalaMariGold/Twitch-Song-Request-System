import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Berkshire_Swash } from "next/font/google";
import "./globals.css";
import { ErrorBoundary } from '@/components/ErrorBoundary'

// Configure Inter font (fallback/body font)
const inter = Inter({
  subsets: ["latin"],
  variable: '--font-inter', // CSS variable for fallback
  display: 'swap',
});

// Configure Berkshire Swash font (heading/display font)
const berkshireSwash = Berkshire_Swash({
  subsets: ["latin"],
  weight: "400", // Berkshire Swash only has regular weight
  variable: '--font-berkshire-swash', // CSS variable
  display: 'swap',
});

export interface Song {
  id: string
  title: string
  artist: string
  requester: string
  requesterAvatar: string
  duration: string
  videoUrl?: string
}

export const metadata: Metadata = {
  title: "CalaMariGold Song Requests", // Updated Title
  description: "Live song request queue for CalaMariGold's Twitch stream",
  // Add icons based on the image in the public folder
  icons: {
    icon: "/calamarigold promo.png", // Standard favicon
    apple: "/calamarigold promo.png", // Apple touch icon
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {/* Preconnect to Twitch assets for faster font/video loading */}
        <link rel="preconnect" href="https://assets.twitch.tv" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://gql.twitch.tv" crossOrigin="anonymous" />
      </head>
      {/* Combine font variables */}
      <body className={`${inter.variable} ${berkshireSwash.variable} font-sans`}>
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
      </body>
    </html>
  );
}

