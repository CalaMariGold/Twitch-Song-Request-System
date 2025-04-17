import { Server as SocketIOServer } from 'socket.io'
import { Server as NetServer } from 'http'
import UDPServer from './udp-server'

export type NextApiResponseWithSocket = {
  socket: {
    server: NetServer & {
      io?: SocketIOServer
    }
  }
}

let udpServer: UDPServer | null = null

export const initSocket = (res: NextApiResponseWithSocket) => {
  if (!res.socket.server.io) {
    const io = new SocketIOServer(res.socket.server)
    res.socket.server.io = io
    global.io = io

    io.on('connection', (socket) => {
      console.log('Client connected')

      socket.on('disconnect', () => {
        console.log('Client disconnected')
      })
    })

    // Initialize UDP server if not already running
    if (!udpServer) {
      udpServer = new UDPServer(3000)
      udpServer.on('songRequest', (data) => {
        io.emit('newSongRequest', data)
      })
      udpServer.start()
    }
  }
  return res.socket.server.io
} 