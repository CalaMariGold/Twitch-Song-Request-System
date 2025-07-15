import { Card, CardHeader, CardTitle, CardContent } from "./ui/card";
import { BarChart2, Clock } from "lucide-react";
import React from "react";

interface QueueStatisticsCardProps {
  isLoading: boolean;
  totalQueueCount: number;
  totalQueueDurationFormatted: string;
  songsPlayedToday: number;
}

const QueueStatisticsCard: React.FC<QueueStatisticsCardProps> = ({
  isLoading,
  totalQueueCount,
  totalQueueDurationFormatted,
  songsPlayedToday,
}) => (
  <Card className="bg-brand-purple-deep/70 border-brand-purple-neon/30 backdrop-blur-md shadow-glow-purple-sm">
    <CardHeader>
      <CardTitle className="text-brand-pink-light flex items-center gap-2 text-glow-pink">
        <BarChart2 size={18} />
        Queue Statistics
      </CardTitle>
    </CardHeader>
    <CardContent className="space-y-4">
      {isLoading ? (
        <div className="text-center py-4 text-brand-purple-light/80">Loading stats...</div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          <div className="bg-brand-purple-dark/50 p-4 rounded-lg text-center border border-brand-purple-neon/20">
            <p className="text-xs text-brand-purple-light/80">In Queue</p>
            <p className="text-2xl font-bold text-white">{totalQueueCount}</p>
          </div>
          <div className="bg-brand-purple-dark/50 p-4 rounded-lg text-center border border-brand-purple-neon/20">
            <p className="text-xs text-brand-purple-light/80">Total Duration</p>
            <p className="text-2xl font-bold text-white flex items-center justify-center">
              <Clock className="inline-block mr-2" size={20} />
              {totalQueueDurationFormatted}
            </p>
          </div>
          <div className="bg-brand-purple-dark/50 p-4 rounded-lg text-center border border-brand-purple-neon/20">
            <p className="text-xs text-brand-purple-light/80">Songs Played Today</p>
            <p className="text-2xl font-bold text-white">{songsPlayedToday}</p>
          </div>
        </div>
      )}
    </CardContent>
  </Card>
);

export default QueueStatisticsCard; 