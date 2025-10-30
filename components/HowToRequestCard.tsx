import { Card, CardHeader, CardTitle, CardContent } from "./ui/card";
import { Music, DollarSign, Star, Ban, ExternalLink, AlertTriangle } from "lucide-react";
import { Button } from "./ui/button";
import React from "react";

interface HowToRequestCardProps {
  raffleInterval?: number;
  queueMode?: 'raffle' | 'donation-only';
}

const HowToRequestCard: React.FC<HowToRequestCardProps> = ({ raffleInterval = 3, queueMode = 'raffle' }) => (
  <Card className="bg-brand-purple-deep/70 border-brand-purple-neon/30 backdrop-blur-md shadow-glow-purple-sm">
    <CardHeader className="pb-2 pt-3">
      <CardTitle className="text-brand-pink-light flex items-center gap-2 text-glow-pink">
        <Music size={26} className="mt-1.5" />
        How to Request
      </CardTitle>
    </CardHeader>
    <CardContent className="space-y-3 px-3 pb-3 pt-1 text-sm">
      {/* Priority Request Section */}
      <div className="space-y-1.5">
        <h4 className="font-semibold text-white flex items-center gap-1.5 pt-1">
          <DollarSign size={16} className="text-green-400"/> Priority Request (Donation)
        </h4>
        <p className="text-brand-purple-light/90 text-xs">
          IMPORTANT: Include the YouTube link, Spotify link, OR Artist & Song Title in your donation/bits message.
        </p>
        {/* Tip link button */}
        <Button 
            asChild
            variant="default" 
            size="sm" 
            className="w-full bg-gradient-to-r from-brand-pink-light to-brand-pink-neon text-brand-black font-bold hover:opacity-90 shadow-md hover:shadow-glow-pink-lg text-glow-white-xs transition-transform duration-200 hover:scale-[1.02] my-3"
          >
            <a 
              href="https://streamelements.com/calamarigold/tip" 
              target="_blank" 
              rel="noopener noreferrer"
            >
              Tip Here to Request <ExternalLink size={14} className="ml-1.5" />
            </a>
          </Button>
        <ul className="list-disc list-inside text-brand-purple-light/80 space-y-0.5 pl-1 text-xs">
          <li>Donations get queue priority!</li>
          <li>All songs: $10 OR 1000 Twitch bits</li>
          <li>Max 10 min duration</li>
        </ul>
        
        <div className="mt-2 p-2 bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-400/30 rounded-md">
          <p className="text-xs text-purple-200 font-medium text-center">
            🎉 NEW: Bits are now accepted! 🎉
          </p>
        </div>
      </div>

      <hr className="border-brand-purple-dark/50" />

      {/* Channel Points Section - Only show in raffle mode */}
      {queueMode === 'raffle' && (
        <>
          <div className="space-y-1">
            <h4 className="font-semibold text-white flex items-center gap-1.5">
              <Star size={16} className="text-yellow-400" /> Channel Point Request
            </h4>
            <p className="text-brand-purple-light/90 text-xs">
              Redeem the 'Request a Song!' channel point reward (flower icon) in Twitch chat. This will add your song to the raffle pool where Mari will pull from after every {raffleInterval} songs.
            </p>
          </div>

          <hr className="border-brand-purple-dark/50" />
        </>
      )}

      {/* Donation-Only Mode Notice */}
      {queueMode === 'donation-only' && (
        <>
          <div className="space-y-1">
            <h4 className="font-semibold text-white flex items-center gap-1.5">
              <Ban size={16} className="text-orange-400" /> Free Requests Disabled
            </h4>
            <p className="text-brand-purple-light/90 text-xs">
              The queue is in donation-only mode. Use donations or bits to request songs!<br />
              Channel point requests are usually enabled on Fridays and Saturdays.
            </p>
          </div>

          <hr className="border-brand-purple-dark/50" />
        </>
      )}

      {/* Song Rules Section */}
      <div className="space-y-1">
        <h4 className="font-semibold text-white flex items-center gap-1.5">
          <AlertTriangle size={16} className="text-red-400" /> Song Rules
        </h4>
        <ul className="list-disc list-inside text-brand-purple-light/80 space-y-0.5 pl-1 text-xs">
          <li>No Deathcore/Death Metal</li>
          <li>No Jazz</li>
          <li>No YouTuber music (ie KSI)</li>
          <li>No Fandom songs (ie FNAF)</li>
          <li>No AI-Generated Music</li>
        </ul>
      </div>
    </CardContent>
  </Card>
);

export default HowToRequestCard; 