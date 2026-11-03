export function batchDecision(library,ids,status,activeId){
  if(!['keep','discard','skip'].includes(status)||!Array.isArray(ids)||!ids.length)throw new Error('Choose games and a review action.');
  const selected=new Set(ids),byId=new Map(library.games.map(g=>[g.id,g]));
  if([...selected].some(id=>!byId.has(id)))throw new Error('Some selected games are no longer in the library.');
  if(activeId&&selected.has(activeId))throw new Error('Stop the selected game before changing its review status.');
  const batch=[...selected].filter(id=>byId.get(id).status!==status).map(id=>({id,before:byId.get(id).status}));
  return {count:batch.length,next:{...library,games:library.games.map(g=>selected.has(g.id)?{...g,status}:g),history:batch.length?[...library.history,{batch}]:library.history}};
}
export function pruneReviewHistory(history,removed){
  const ids=new Set(removed);
  return history.flatMap(entry=>{if(!entry.batch)return ids.has(entry.id)?[]:[entry];const batch=entry.batch.filter(item=>!ids.has(item.id));return batch.length?[{...entry,batch}]:[];});
}
