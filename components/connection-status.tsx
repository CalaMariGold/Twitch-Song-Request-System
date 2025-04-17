import React from 'react'
import { Badge } from '@/components/ui/badge'
import { Wifi, WifiOff } from 'lucide-react'

interface ConnectionStatusProps {
  isConnected: boolean
}

export function ConnectionStatus({ isConnected }: ConnectionStatusProps) {
  return (
    <Badge variant={isConnected ? "outline" : "destructive"} className="flex items-center gap-1">
      {isConnected ? (
        <>
          <Wifi size={12} className="text-green-500" />
          <span>Connected</span>
        </>
      ) : (
        <>
          <WifiOff size={12} />
          <span>Disconnected</span>
        </>
      )}
    </Badge>
  )
} 