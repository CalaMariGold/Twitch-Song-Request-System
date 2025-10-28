# 🎵 CalaMariGold's Twitch Song Request System

This is a passion project made with love for [my Twitch community](https://twitch.tv/calamarigold
). I've spent many hours on this and improving it. What was originally supposed to be something simple, over time has turned into something huge and kind of amazing!

This is a real-time, web-based song request system designed for Twitch streamers, specifically built for my own drum streams. This system allows viewers to request songs via donations, channel points, and Twitch bits, managing a robust dynamic queue with raffle mechanics, including many QoL features, configuration options, and fun stats!

## Features

### **Multiple Request Methods**
- **Donations** - Priority queue placement
- **Twitch Bits** - Priority queue placement
- **Channel Points** - Free requests via raffle pool (when enabled)

### **Dynamic Queue System**
- **Slot-based queue** with pre-allocated positions
- **Raffle mode** - Channel points go into a raffle pool, randomly selected after every X donation songs
- **Donation-only mode** - All slots reserved for paid requests
- **Real-time updates** via Socket.IO

### **Smart Song Matching**
- **YouTube URL support** with automatic Spotify matching
- **Spotify track links** for direct requests
- **Text search** using Spotify's search API
- **Sophisticated matching algorithm** for finding the best Spotify equivalent

### **Content Management**
- **Blacklist system** for songs, artists, and keywords
- **User blocking** capabilities
- **Duration limits** per request type
- **Duplicate prevention** in raffle pool

### **Analytics & Statistics**
- **Real-time statistics** - songs played today, queue duration
- **All-time stats** - top songs, artists, requesters
- **History search** with full database search capabilities
- **Request type tracking** (donations vs channel points vs bits)


## **Tech Stack**

| Category | Technology |
|----------|------------|
| **Frontend** | Next.js, React, TypeScript, Tailwind CSS |
| **Backend** | Node.js, Socket.IO |
| **Database** | SQLite with better-sqlite3 |
| **APIs** | StreamElements, Twitch, Spotify, YouTube |
| **UI Components** | Radix UI, Lucide React |
| **Animations** | Framer Motion |

## **Project Structure**

```
├── app/                    # Next.js app directory
│   ├── (public)/          # Public pages
│   ├── admin/             # Admin dashboard
│   └── auth/              # Authentication routes
├── components/            # React components
│   ├── SongRequestQueue/  # Queue management UI
│   ├── ui/               # Reusable UI components
│   └── ...               # Other components
├── server/               # Backend server
│   ├── index.js         # Main server file
│   ├── database.js      # Database operations
│   ├── streamElements.js # StreamElements integration
│   ├── twitch.js        # Twitch API integration
│   ├── spotify.js       # Spotify API integration
│   ├── youtube.js       # YouTube API integration
│   ├── helpers.js       # Utility functions
│   └── statistics.js    # Statistics calculations
├── lib/                 # Shared utilities and types
└── data/               # SQLite database files
```

## **Configuration**

The site uses environment variables for configuration. Key settings include:

- **Twitch Integration**: Client ID, OAuth tokens, channel name
- **StreamElements**: JWT token, account ID, reward title
- **Spotify/YouTube**: API keys for song matching
- **Queue Settings**: Duration limits, raffle intervals, queue modes
- **Deployment**: Socket URL, allowed origins, database path

## **Contributing**

While this project is primarily for my own streams, I welcome contributions! Feel free to:
- Report bugs or issues
- Suggest new features
- Submit pull requests for improvements
- Fork the project for your own use

## **License**

This project is open source. Feel free to use it for your own streams or as a learning resource!

## **Live Demo**

This site is currently deployed and active at: **[calamarigoldrequests.com](https://calamarigoldrequests.com)**

---

*Want to see it in action? Check out my streams where this system manages all the song requests! :3* 🥁<br>
https://twitch.tv/calamarigold
