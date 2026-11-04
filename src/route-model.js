export function routeName(pathname,search='',base='/'){
 const path=pathname.startsWith(base)?pathname.slice(base.length):pathname.replace(/^\//,'');
 const clean=path.replace(/\/index\.html$/,'').replace(/^index\.html$/,'').replace(/\/+$/,'');
 if(clean==='games')return 'games';
 if(clean==='play'||(!clean&&new URLSearchParams(search).has('game')))return 'player';
 return 'home';
}
export const pathForRoute=(route,base='/')=>`${base}${route==='player'?'play/':route==='games'?'games/':''}`;
