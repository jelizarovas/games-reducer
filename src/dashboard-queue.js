import {canQueue} from './nes-compatibility.js';
import {matchesLanguage} from './languages.js';
export function nextDashboardGame(games,languages,preferredId){
 const queue=games.filter(g=>g.status==='unreviewed'&&canQueue(g)&&matchesLanguage(g,languages));
 return queue.find(g=>g.id===preferredId)||queue.sort((a,b)=>a.title.localeCompare(b.title))[0]||null;
}
