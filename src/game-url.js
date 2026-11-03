export const gameSlug=title=>String(title||'game').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'-').replace(/^-|-$/g,'')||'game';
export function findGameInUrl(games,href){
  const query=new URL(href).searchParams,slug=query.get('game'),system=query.get('console');
  if(!slug)return null;
  const matches=games.filter(g=>g.system===system&&gameSlug(g.title)===slug);
  return matches.find(g=>g.id===query.get('rom'))||matches[0]||null;
}
export function urlForGame(game,games,href){
  const url=new URL(href);
  url.searchParams.set('game',gameSlug(game.title));url.searchParams.set('console',game.system);url.searchParams.delete('rom');
  if(games.filter(g=>g.system===game.system&&gameSlug(g.title)===gameSlug(game.title)).length>1)url.searchParams.set('rom',game.id);
  return url;
}
