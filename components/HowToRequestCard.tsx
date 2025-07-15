import { Card, CardHeader, CardTitle, CardContent } from "./ui/card";
import { Gift, DollarSign, Star, AlertTriangle, ExternalLink } from "lucide-react";
import { Button } from "./ui/button";
import React from "react";

const HowToRequestCard: React.FC = () => (
  <Card className="bg-brand-purple-deep/70 border-brand-purple-neon/30 backdrop-blur-md shadow-glow-purple-sm">
    <CardHeader className="pb-2 pt-3">
      <CardTitle className="text-brand-pink-light flex items-center gap-2 text-glow-pink">
        <Gift size={18} />
        How to Request
      </CardTitle>
    </CardHeader>
    <CardContent className="space-y-3 px-3 pb-3 pt-1 text-sm">
      {/* Donation Section */}
      <div className="space-y-1.5">
        <h4 className="font-semibold text-white flex items-center gap-1.5 pt-1">
          <DollarSign size={16} className="text-green-400"/> Priority Request (Donation)
        </h4>
        <p className="text-brand-purple-light/90 text-xs">
          IMPORTANT: Include the YouTube link, Spotify link, OR Artist & Song Title in your donation message.
        </p>
        <a 
          href="https://streamelements.com/calamarigold/tip" 
          target="_blank" 
          rel="noopener noreferrer"
          className="block my-3.0"
        >
          <Button 
            variant="default" 
            size="sm" 
            className="w-full bg-gradient-to-r from-brand-pink-light to-brand-pink-neon text-brand-black font-bold hover:opacity-90 shadow-md hover:shadow-glow-pink-lg text-glow-white-xs transition-transform duration-200 hover:scale-[1.02]"
          >
            Tip Here to Request <ExternalLink size={14} className="ml-1.5" />
          </Button>
        </a>
        <ul className="list-disc list-inside text-brand-purple-light/80 space-y-0.5 pl-1 text-xs">
          <li>Donations get queue priority!</li>
          <li>Songs less than 5 min: $5</li>
          <li>Songs greater than 5 min: $10</li>
          <li>Max 10 min duration</li>
        </ul>
      </div>

      <hr className="border-brand-purple-dark/50" />

      {/* Channel Points Section */}
      <div className="space-y-1">
        <h4 className="font-semibold text-white flex items-center gap-1.5">
          <Star size={16} className="text-yellow-400" /> Channel Point Request
        </h4>
        <p className="text-brand-purple-light/90 text-xs">
          Redeem the 'Request a Song!' reward on Twitch to add a song to the end of the queue.
        </p>
      </div>

      <hr className="border-brand-purple-dark/50" />

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