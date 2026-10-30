export function summarizeGames(games){
  const available=games.filter(g=>!g.missing),counts={unreviewed:0,keep:0,discard:0,skip:0};
  for(const game of available)if(game.status in counts)counts[game.status]++;
  return {total:available.length,missing:games.length-available.length,counts,reviewed:available.length-counts.unreviewed,seconds:games.reduce((sum,g)=>sum+(g.seconds||0),0)};
}
export const playTime=seconds=>seconds<3600?`${Math.floor(seconds/60)} min`:`${Math.floor(seconds/3600)} h ${Math.floor(seconds%3600/60)} min`;
