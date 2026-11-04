import {useEffect,useState} from 'react';
import {routeName,pathForRoute} from './route-model';
export const routePath=route=>pathForRoute(route,import.meta.env.BASE_URL);
export const currentRoute=()=>routeName(location.pathname,location.search,import.meta.env.BASE_URL);
export function useRoute(){
 const [route,setRoute]=useState(currentRoute);
 useEffect(()=>{
  // Preserve old named-game bookmarks while moving the player off the home page.
  if(currentRoute()==='player'&&!location.pathname.includes('/play'))history.replaceState(history.state,'',routePath('player')+location.search+location.hash);
  const pop=()=>setRoute(currentRoute());window.addEventListener('popstate',pop);return()=>window.removeEventListener('popstate',pop);
 },[]);
 return [route,next=>{if(next!==currentRoute())history.pushState({},'',routePath(next));setRoute(next);}];
}
