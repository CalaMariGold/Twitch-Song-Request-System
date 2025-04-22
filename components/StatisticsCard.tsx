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
  className = "bg-gray-800 border-gray-700",
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
        <CardTitle className="text-white flex items-center text-xl">
          <div className="p-1.5 rounded-md bg-gray-700 mr-3">
            <BarChart2 className="h-5 w-5 text-purple-400" />
          </div>
          {title}
        </CardTitle>
        <CardDescription className="text-gray-400">{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
            <span className="ml-2 text-gray-400">Loading stats...</span>
          </div>
        ) : stats ? (
          <Tabs defaultValue={defaultTab} className="w-full">
            <TabsList className={`grid w-full ${includeRequesters ? 'grid-cols-3' : 'grid-cols-2'} bg-gray-700/80 mb-3 h-9 rounded-xl p-1`}>
              {includeRequesters && (
                <TabsTrigger value="requesters" className="text-xs rounded-lg data-[state=active]:bg-purple-700 data-[state=active]:text-white flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" /> Requesters
                </TabsTrigger>
              )}
              <TabsTrigger value="songs" className="text-xs rounded-lg data-[state=active]:bg-blue-700 data-[state=active]:text-white flex items-center gap-1.5">
                <Music className="h-3.5 w-3.5" /> Songs
              </TabsTrigger>
              <TabsTrigger value="artists" className="text-xs rounded-lg data-[state=active]:bg-indigo-700 data-[state=active]:text-white flex items-center gap-1.5">
                <User className="h-3.5 w-3.5" /> Artists
              </TabsTrigger>
            </TabsList>
            
            {includeRequesters && (
              <TabsContent value="requesters">
                <ScrollArea className={`${heightClass} pr-2 rounded-md border border-gray-700 p-2 bg-gradient-to-b from-gray-700/70 to-gray-800/90`}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {stats.topRequesters.length > 0 ? stats.topRequesters.map((r, i) => (
                      <li key={i} className={`text-gray-300 pl-1.5 pr-2 py-1 rounded-md flex items-center justify-between ${i < 3 ? 'bg-purple-900/20 border border-purple-800/30' : 'bg-gray-800/50'} list-none`}>
                        <div className="flex items-center gap-1.5">
                          <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
                            {getMedalIcon(i) || <span className="text-xs text-gray-500 font-medium">{i+1}</span>}
                          </div>
                          <span className="font-medium text-white text-sm">{r.requester}</span>
                        </div>
                        <div className="text-xs bg-purple-800/60 text-purple-200 px-1.5 py-0.5 rounded-full">
                          {r.request_count} {r.request_count === 1 ? 'request' : 'requests'}
                        </div>
                      </li>
                    )) : <p className="text-gray-400 italic text-center py-6 col-span-2">No requester data yet.</p>}
                  </div>
                </ScrollArea>
              </TabsContent>
            )}
            
            <TabsContent value="songs">
              <ScrollArea className={`${heightClass} pr-2 rounded-md border border-gray-700 p-2 bg-gradient-to-b from-gray-700/70 to-gray-800/90`}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {stats.topSongs.length > 0 ? stats.topSongs.map((s, i) => (
                    <li key={i} className={`text-gray-300 pl-1.5 pr-2 py-1 rounded-md ${i < 3 ? 'bg-blue-900/20 border border-blue-800/30' : 'bg-gray-800/50'} list-none`}>
                      <div className="flex items-center gap-1.5">
                        <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
                          {getMedalIcon(i) || <span className="text-xs text-gray-500 font-medium">{i+1}</span>}
                        </div>
                        <span className="font-medium text-white text-sm truncate max-w-[70%]" title={s.title || 'Unknown Title'}>
                          {s.title || 'Unknown Title'}
                        </span>
                        <div className="text-xs bg-blue-800/60 text-blue-200 px-1.5 py-0.5 rounded-full ml-auto">
                          {s.play_count} {s.play_count === 1 ? 'play' : 'plays'}
                        </div>
                      </div>
                      <div className="flex ml-6 mt-1">
                        <span className="italic text-gray-400 text-xs" title={s.artist || 'Unknown Artist'}>
                          by {s.artist || 'Unknown Artist'}
                        </span>
                      </div>
                    </li>
                  )) : <p className="text-gray-400 italic text-center py-6 col-span-2">No song data yet.</p>}
                </div>
              </ScrollArea>
            </TabsContent>
            
            <TabsContent value="artists">
              <ScrollArea className={`${heightClass} pr-2 rounded-md border border-gray-700 p-2 bg-gradient-to-b from-gray-700/70 to-gray-800/90`}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {stats.topArtists.length > 0 ? stats.topArtists.map((a, i) => (
                    <li key={i} className={`text-gray-300 pl-1.5 pr-2 py-1 rounded-md flex items-center justify-between ${i < 3 ? 'bg-indigo-900/20 border border-indigo-800/30' : 'bg-gray-800/50'} list-none`}>
                      <div className="flex items-center gap-1.5">
                        <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
                          {getMedalIcon(i) || <span className="text-xs text-gray-500 font-medium">{i+1}</span>}
                        </div>
                        <span className="font-medium text-white text-sm">{a.artist || 'Unknown Artist'}</span>
                      </div>
                      <div className="text-xs bg-indigo-800/60 text-indigo-200 px-1.5 py-0.5 rounded-full">
                        {a.play_count} {a.play_count === 1 ? 'play' : 'plays'}
                      </div>
                    </li>
                  )) : <p className="text-gray-400 italic text-center py-6 col-span-2">No artist data yet.</p>}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        ) : (
          <div className="bg-gray-800/80 rounded-lg border border-gray-700 p-6 text-center">
            <BarChart2 className="h-10 w-10 text-gray-500 mx-auto mb-3" />
            <p className="text-gray-400 italic">Could not load statistics.</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
} 