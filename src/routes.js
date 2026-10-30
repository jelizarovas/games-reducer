import {useEffect,useState} from 'react';
export const routePath=route=>`${import.meta.env.BASE_URL}${route==='player'?'':`${route}/`}`;
export function currentRoute(){const path=location.pathname.replace(/\/+$/,'');return path.endsWith('/games')?'games':'player';}
export function useRoute(){
  const [route,setRoute]=useState(currentRoute);
  useEffect(()=>{const pop=()=>setRoute(currentRoute());window.addEventListener('popstate',pop);return()=>window.removeEventListener('popstate',pop);},[]);
  return [route,next=>{if(next!==currentRoute())history.pushState({},'',routePath(next));setRoute(next);}];
}
