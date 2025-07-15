import { Card, CardHeader, CardTitle, CardContent } from "./ui/card";
import { History, Clock, Divide, Gift, DollarSign, Star } from "lucide-react";
import React from "react";

interface HistoryStatisticsCardProps {
  totalHistory: number;
  totalHistoryDuration: string;
  averageSongDuration: string;
  donationCount: number;
  channelPointCount: number;
}

function formatDurationWithUnits(duration: string) {
  // Accepts a string like '1:23:45' or '12:34' and returns JSX with h, m, s units
  if (!duration || typeof duration !== 'string') return duration;
  const parts = duration.split(":").map(Number);
  let hours = 0, minutes = 0, seconds = 0;
  if (parts.length === 3) {
    hours = parts[0];
    minutes = parts[1];
    seconds = parts[2];
  } else if (parts.length === 2) {
    minutes = parts[0];
    seconds = parts[1];
  } else if (parts.length === 1) {
    seconds = parts[0];
  }
  return (
    <span>
      {hours > 0 && <><span>{hours}</span><span className="text-xs align-top ml-0.5">h</span> </>}
      {minutes > 0 && <><span>{minutes}</span><span className="text-xs align-top ml-0.5">m</span> </>}
      <span>{seconds}</span><span className="text-xs align-top ml-0.5">s</span>
    </span>
  );
}

const HistoryStatisticsCard: React.FC<HistoryStatisticsCardProps> = ({
  totalHistory,
  totalHistoryDuration,
  averageSongDuration,
  donationCount,
  channelPointCount,
}) => (
  <Card className="bg-brand-purple-deep/70 border-brand-purple-neon/30 backdrop-blur-md shadow-glow-purple-sm">
    <CardHeader>
      <CardTitle className="text-brand-pink-light flex items-center gap-2 text-glow-pink">
        <History size={18} />
        History Statistics
      </CardTitle>
    </CardHeader>
    <CardContent className="space-y-4">
      <div className="grid grid-cols-1 gap-4">
        <div className="bg-brand-purple-dark/50 p-4 rounded-lg text-center border border-brand-purple-neon/20">
          <p className="text-xs text-brand-purple-light/80">Total History</p>
          <p className="text-2xl font-bold text-white">{totalHistory}</p>
        </div>
        <div className="bg-brand-purple-dark/50 p-4 rounded-lg text-center border border-brand-purple-neon/20">
          <p className="text-xs text-brand-purple-light/80">Total History Duration</p>
          <p className="text-2xl font-bold text-white flex items-center justify-center">
            <Clock className="inline-block mr-2" size={20} />
            {formatDurationWithUnits(totalHistoryDuration)}
          </p>
        </div>
        <div className="bg-brand-purple-dark/50 p-4 rounded-lg text-center border border-brand-purple-neon/20">
          <p className="text-xs text-brand-purple-light/80">Average Song Duration</p>
          <p className="text-2xl font-bold text-white flex items-center justify-center">
            <Clock className="inline-block mr-2" size={20} />
            {averageSongDuration}
          </p>
        </div>
        <div className="bg-brand-purple-dark/50 p-4 rounded-lg text-center border border-brand-purple-neon/20">
          <p className="text-xs text-brand-purple-light/80">By Request Type</p>
          <div className="flex items-center justify-center gap-4 mt-2">
            <span className="flex items-center gap-1 text-green-400 font-semibold">
              <DollarSign size={16} /> {donationCount}
            </span>
            <span className="flex items-center gap-1 text-purple-400 font-semibold">
              <span className="inline-block w-4 h-4 rounded-full bg-brand-purple-neon" /> {channelPointCount}
            </span>
          </div>
        </div>
      </div>
    </CardContent>
  </Card>
);

export default HistoryStatisticsCard; 