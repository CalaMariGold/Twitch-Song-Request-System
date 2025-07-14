import { AllTimeStats } from "@/lib/types"
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import { BarChart2, Loader2, Music, User, Users, Trophy, Award, Medal } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"

interface StatisticsCardProps {
  isLoading: boolean
  stats: AllTimeStats | null
  includeRequesters?: boolean
  className?: string
  title?: string
  description?: string
  heightClass?: string
  showAllStats?: boolean
}

export function StatisticsCard({
  isLoading,
  stats,
  includeRequesters = true,
  className = "bg-brand-purple-deep/70 border-brand-purple-neon/30 backdrop-blur-md shadow-glow-purple-sm",
  title = "All-Time Statistics",
  description = "Overall system usage stats.",
  heightClass = "h-[200px]",
  showAllStats = true
}: StatisticsCardProps) {
  // Determine default tab based on whether we're showing requesters
  const defaultTab = includeRequesters ? "requesters" : "songs"
  
  // Helper to generate medal icon for top entries
  const getMedalIcon = (index: number) => {
    if (index === 0) return <Trophy className="h-3.5 w-3.5 text-yellow-400" />
    if (index === 1) return <Award className="h-3.5 w-3.5 text-gray-300" />
    if (index === 2) return <Medal className="h-3.5 w-3.5 text-amber-700" />
    return null
  }
  
  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-brand-pink-light flex items-center text-xl text-glow-pink">
          <div className="p-1.5 rounded-md bg-brand-purple-dark/50 mr-3 border border-brand-purple-neon/20">
            <BarChart2 className="h-5 w-5 text-brand-pink-neon" />
          </div>
          {title}
        </CardTitle>
        <CardDescription className="text-brand-purple-light/80">{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-8 h-8 animate-spin text-brand-pink-neon" />
            <span className="ml-2 text-brand-purple-light/70">Loading stats...</span>
          </div>
        ) : stats ? (
          <Tabs defaultValue={defaultTab} className="w-full">
            <TabsList className={`grid w-full ${includeRequesters ? 'grid-cols-3' : 'grid-cols-2'} bg-brand-purple-dark/50 border border-brand-purple-neon/10 p-1 h-auto rounded-lg mb-3`}>
              {includeRequesters && (
                <TabsTrigger 
                  value="requesters" 
                  className="text-xs rounded-md data-[state=active]:bg-brand-pink-neon/80 data-[state=active]:text-brand-black data-[state=active]:font-semibold data-[state=active]:shadow-md data-[state=active]:shadow-brand-black/30 text-brand-purple-light/80 hover:bg-brand-purple-dark/70 hover:text-white transition-all flex items-center gap-1.5 data-[state=active]:border data-[state=active]:border-brand-pink-neon"
                >
                  <Users className="h-3.5 w-3.5" /> Requesters
                </TabsTrigger>
              )}
              <TabsTrigger 
                value="songs" 
                className="text-xs rounded-md data-[state=active]:bg-brand-purple-neon/80 data-[state=active]:text-brand-black data-[state=active]:font-semibold data-[state=active]:shadow-md data-[state=active]:shadow-brand-black/30 text-brand-purple-light/80 hover:bg-brand-purple-dark/70 hover:text-white transition-all flex items-center gap-1.5 data-[state=active]:border data-[state=active]:border-brand-purple-neon"
              >
                <Music className="h-3.5 w-3.5" /> Songs
              </TabsTrigger>
              <TabsTrigger 
                value="artists" 
                className="text-xs rounded-md data-[state=active]:bg-brand-purple-dark data-[state=active]:text-brand-pink-light data-[state=active]:font-semibold data-[state=active]:shadow-md data-[state=active]:shadow-brand-black/30 text-brand-purple-light/80 hover:bg-brand-purple-dark/70 hover:text-white transition-all flex items-center gap-1.5 data-[state=active]:border data-[state=active]:border-brand-pink-neon/50"
              >
                <User className="h-3.5 w-3.5" /> Artists
              </TabsTrigger>
            </TabsList>
            
            {includeRequesters && (
              <TabsContent value="requesters">
                <ScrollArea className={`${heightClass} pr-2 rounded-md border border-brand-purple-dark/80 p-2 bg-gradient-to-b from-brand-purple-dark/40 to-brand-purple-deep/60`}>
                  <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {stats.topRequesters.length > 0 ? stats.topRequesters.map((r, i) => (
                      <li key={i} className={`text-brand-purple-light/90 pl-1.5 pr-2 py-1 rounded-md flex items-center justify-between ${i < 3 ? 'bg-brand-pink-neon/10 border border-brand-pink-neon/30 shadow-sm' : 'bg-brand-purple-dark/40 border border-brand-purple-dark/60'} list-none`}>
                        <div className="flex items-center gap-1.5">
                          <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
                            {getMedalIcon(i) || <span className="text-xs text-brand-purple-light/60 font-medium">{i+1}</span>}
                          </div>
                          <span className="font-medium text-white text-sm">{r.requester}</span>
                        </div>
                        <div className="text-xs bg-brand-pink-neon/70 text-brand-black px-1.5 py-0.5 rounded-full font-medium">
                          {r.request_count} {r.request_count === 1 ? 'req' : 'reqs'}
                        </div>
                      </li>
                    )) : <p className="text-brand-purple-light/70 italic text-center py-6 col-span-2">No requester data yet.</p>}
                  </ul>
                </ScrollArea>
              </TabsContent>
            )}
            
            <TabsContent value="songs">
              <ScrollArea className={`${heightClass} pr-2 rounded-md border border-brand-purple-dark/80 p-2 bg-gradient-to-b from-brand-purple-dark/40 to-brand-purple-deep/60`}>
                <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {stats.topSongs.length > 0 ? stats.topSongs.map((s, i) => (
                    <li key={i} className={`text-brand-purple-light/90 pl-1.5 pr-2 py-1 rounded-md ${i < 3 ? 'bg-brand-purple-neon/10 border border-brand-purple-neon/30 shadow-sm' : 'bg-brand-purple-dark/40 border border-brand-purple-dark/60'} list-none`}>
                      <div className="flex items-center gap-1.5">
                        <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
                          {getMedalIcon(i) || <span className="text-xs text-brand-purple-light/60 font-medium">{i+1}</span>}
                        </div>
                        <span className="font-medium text-white text-sm truncate max-w-[70%]" title={s.title || 'Unknown Title'}>
                          {s.title || 'Unknown Title'}
                        </span>
                        <div className="text-xs bg-brand-purple-neon/70 text-brand-black px-1.5 py-0.5 rounded-full font-medium ml-auto">
                          {s.play_count} {s.play_count === 1 ? 'play' : 'plays'}
                        </div>
                      </div>
                      <div className="flex ml-6 mt-1">
                        <span className="italic text-brand-purple-light/70 text-xs" title={s.artist || 'Unknown Artist'}>
                          by {s.artist || 'Unknown Artist'}
                        </span>
                      </div>
                    </li>
                  )) : <p className="text-brand-purple-light/70 italic text-center py-6 col-span-2">No songs with 2 or more plays yet.</p>}
                </ul>
              </ScrollArea>
            </TabsContent>
            
            <TabsContent value="artists">
              <ScrollArea className={`${heightClass} pr-2 rounded-md border border-brand-purple-dark/80 p-2 bg-gradient-to-b from-brand-purple-dark/40 to-brand-purple-deep/60`}>
                <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {stats.topArtists.length > 0 ? stats.topArtists.map((a, i) => (
                    <li key={i} className={`text-brand-purple-light/90 pl-1.5 pr-2 py-1 rounded-md flex items-center justify-between ${i < 3 ? 'bg-brand-purple-dark/30 border border-brand-pink-neon/20 shadow-sm' : 'bg-brand-purple-dark/40 border border-brand-purple-dark/60'} list-none`}>
                      <div className="flex items-center gap-1.5">
                        <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
                          {getMedalIcon(i) || <span className="text-xs text-brand-purple-light/60 font-medium">{i+1}</span>}
                        </div>
                        <span className="font-medium text-white text-sm">{a.artist || 'Unknown Artist'}</span>
                      </div>
                      <div className="text-xs bg-brand-purple-dark/80 text-brand-pink-light px-1.5 py-0.5 rounded-full font-medium">
                        {a.play_count} {a.play_count === 1 ? 'play' : 'plays'}
                      </div>
                    </li>
                  )) : <p className="text-brand-purple-light/70 italic text-center py-6 col-span-2">No artists with 2 or more plays yet.</p>}
                </ul>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        ) : (
          <div className="bg-brand-purple-dark/30 rounded-lg border border-brand-purple-dark/50 p-6 text-center">
            <BarChart2 className="h-10 w-10 text-brand-purple-light/50 mx-auto mb-3" />
            <p className="text-brand-purple-light/70 italic">Could not load statistics.</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
} 