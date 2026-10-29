export const consoleNames = { all: 'All', megadrive: 'Genesis', snes: 'SNES', nes: 'NES' };
export const matchesConsole = (game, system) => system === 'all' || game.system === system;
export function gameCategories(metadata = {}) {
  const raw=metadata.genre || metadata.genres || '';
  const genres=(Array.isArray(raw)?raw:String(raw).split(/[;,|]/)).map(g=>String(g).trim()).filter(g=>g && !/^(unknown|n\/a|unspecified)$/i.test(g));
  const names={platform:'Platformer',platformer:'Platformer','shoot \'em up':'Shooter','shooting':'Shooter',shooter:'Shooter',puzzle:'Puzzle',arcade:'Arcade'};
  return [...new Set(genres.map(g=>names[g.toLowerCase().replace(/[’‘]/g,"'")]||g))];
}
export const matchesCategory = (game, category) => category === 'all' || (category === 'uncategorized' ? !gameCategories(game.metadata).length : gameCategories(game.metadata).includes(category));
export function gameCategory(metadata = {}) {
  const normalized=gameCategories(metadata);
  const specific=normalized.filter(g=>g.toLowerCase()!=='action');
  return (specific.length?specific:normalized).slice(0,2).join(', ');
}
export const cardDetails = game => [releaseYear(game.metadata),consoleNames[game.system],gameCategory(game.metadata)].filter(Boolean).join(' · ');
export function releaseYear(metadata = {}) {
  const value = String(metadata.released || metadata.releasedate || metadata.year || '').trim();
  const match = value.match(/^(19\d{2}|20\d{2})(?:$|[-/.T\d])/);
  return match ? match[1] : null;
}
export function sortGames(games, order = 'title') {
  return [...games].sort((a, b) => {
    if (order.startsWith('year')) {
      const x = Number(releaseYear(a.metadata)), y = Number(releaseYear(b.metadata));
      if (!x || !y) { if (x !== y) return x ? -1 : 1; }
      else if (x !== y) return order === 'year-desc' ? y - x : x - y;
    }
    const title = a.title.localeCompare(b.title, undefined, {numeric:true, sensitivity:'base'});
    return (order === 'title-desc' ? -title : title) || a.system.localeCompare(b.system) || a.id.localeCompare(b.id);
  });
}
