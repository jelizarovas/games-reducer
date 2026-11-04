import {useEffect,useState} from 'react';
import {routeName,pathForRoute} from './route-model';
export const routePath=route=>pathForRoute(route,import.meta.env.BASE_URL);
export const currentRoute=()=>routeName(location.pathname,location.search,import.meta.env.BASE_URL);
export function useRoute(){
 const [locationKey,setLocationKey]=useState(()=>location.pathname+location.search);
 const route=currentRoute();
 useEffect(()=>{
  // Preserve old named-game bookmarks while moving the player off the home page.
  if(currentRoute()==='player'&&!location.pathname.includes('/play'))history.replaceState(history.state,'',routePath('player')+location.search+location.hash);
  const pop=()=>setLocationKey(location.pathname+location.search);window.addEventListener('popstate',pop);return()=>window.removeEventListener('popstate',pop);
 },[]);
 return [route,(next,query)=>{if(query===undefined&&next===currentRoute())return;const path=routePath(next),search=query?'?'+new URLSearchParams(query):'';if(path+search!==location.pathname+location.search)history.pushState({},'',path+search);setLocationKey(location.pathname+location.search);},locationKey.includes('?')?locationKey.slice(locationKey.indexOf('?')):''];
}
