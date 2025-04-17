import { watch } from 'fs'
import { readFile, mkdir } from 'fs/promises'
import path from 'path'

class FileWatcher {
    private watcher: any
    private io: any
    private isProcessing: boolean = false
    private lastProcessedContent: string = ''

    constructor(io: any) {
        this.io = io
    }

    async start() {
        try {
            // Ensure queue directory exists
            const queueDir = path.join(process.cwd(), 'queue')
            await mkdir(queueDir, { recursive: true })
            
            const requestsFile = path.join(queueDir, 'requests.json')

            // Process any existing request
            try {
                await this.processRequestFile(requestsFile)
            } catch (error) {
                console.log('No existing request to process or invalid file')
            }

            // Watch for changes
            this.watcher = watch(queueDir, { persistent: true }, async (eventType, filename) => {
                if (filename === 'requests.json' && !this.isProcessing) {
                    // Add a small delay to ensure file is completely written
                    await new Promise(resolve => setTimeout(resolve, 100))
                    await this.processRequestFile(requestsFile)
                }
            })

            console.log('File watcher started successfully')
        } catch (error) {
            console.error('Error starting file watcher:', error)
        }
    }

    private async processRequestFile(filePath: string) {
        if (this.isProcessing) return
        
        try {
            this.isProcessing = true
            
            // Read the file content
            const content = await readFile(filePath, 'utf-8')
            
            // Skip if we've already processed this content
            if (content === this.lastProcessedContent) {
                return
            }
            
            // Try to parse the JSON
            let request
            try {
                request = JSON.parse(content.trim())
                this.lastProcessedContent = content
            } catch (parseError) {
                console.error('Error parsing JSON:', parseError)
                console.log('Invalid content:', content)
                return
            }
            
            console.log('Processing request:', request)

            // Validate required fields
            if (!request.youtubeUrl || !request.requester) {
                console.error('Missing required fields in request')
                return
            }

            // Extract video ID and fetch details
            const videoId = this.extractVideoId(request.youtubeUrl)
            if (!videoId) {
                console.error('Invalid YouTube URL:', request.youtubeUrl)
                return
            }

            console.log('Fetching details for video:', videoId)
            const videoDetails = await this.fetchYouTubeDetails(videoId)
            
            // Combine the data
            const songRequest = {
                ...request,
                title: videoDetails.title,
                artist: videoDetails.channelTitle,
                duration: videoDetails.duration
            }

            console.log('Emitting song request:', songRequest)
            
            // Emit to all connected clients
            this.io.emit('newSongRequest', songRequest)
        } catch (error) {
            console.error('Error processing request file:', error)
        } finally {
            this.isProcessing = false
        }
    }

    private extractVideoId(url: string): string {
        try {
            const match = url.match(/(?:youtube\.com\/watch\?v=|youtu.be\/)([^&\n?#]+)/)
            return match ? match[1] : ''
        } catch (error) {
            console.error('Error extracting video ID:', error)
            return ''
        }
    }

    private async fetchYouTubeDetails(videoId: string) {
        try {
            if (!process.env.YOUTUBE_API_KEY) {
                throw new Error('YouTube API key not configured')
            }

            const response = await fetch(
                `https://www.googleapis.com/youtube/v3/videos?id=${videoId}&part=snippet,contentDetails&key=${process.env.YOUTUBE_API_KEY}`,
                { cache: 'no-store' }
            )
            
            if (!response.ok) {
                throw new Error(`YouTube API error: ${response.statusText}`)
            }

            const data = await response.json()
            console.log('YouTube API response:', data)
            
            if (!data.items?.[0]) {
                throw new Error('Video not found')
            }
            
            const item = data.items[0]
            return {
                title: item.snippet.title,
                channelTitle: item.snippet.channelTitle,
                duration: this.formatDuration(item.contentDetails.duration)
            }
        } catch (error) {
            console.error('Error fetching YouTube details:', error)
            throw error
        }
    }

    private formatDuration(isoDuration: string): string {
        try {
            let durationStr = isoDuration.replace("PT", "")
            let hours = 0, minutes = 0, seconds = 0

            const hIndex = durationStr.indexOf("H")
            const mIndex = durationStr.indexOf("M")
            const sIndex = durationStr.indexOf("S")

            if (hIndex > 0) {
                hours = parseInt(durationStr.substring(0, hIndex))
                durationStr = durationStr.substring(hIndex + 1)
            }

            if (mIndex > 0) {
                minutes = parseInt(durationStr.substring(0, mIndex))
                durationStr = durationStr.substring(mIndex + 1)
            }

            if (sIndex > 0) {
                seconds = parseInt(durationStr.substring(0, sIndex))
            }

            return hours > 0 ? 
                `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}` : 
                `${minutes}:${seconds.toString().padStart(2, '0')}`
        } catch (error) {
            console.error('Error formatting duration:', error)
            return '0:00'
        }
    }

    stop() {
        if (this.watcher) {
            this.watcher.close()
        }
    }
}

export default FileWatcher 
