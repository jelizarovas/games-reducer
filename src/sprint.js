const outcomes=['keep','discard','skip'];
const available=g=>g&&!g.missing&&!['unsupported','invalid'].includes(g.compatibility?.status);
export function createSprint(games,ids,now=Date.now(),id=crypto.randomUUID()){
 if(!Array.isArray(ids)||!ids.length||ids.length>50000||new Set(ids).size!==ids.length)throw new Error('Choose a valid sprint size.');
 const byId=new Map(games.map(g=>[g.id,g]));
 const entries=ids.map(id=>{const g=byId.get(id);if(!available(g)||g.status!=='unreviewed')throw new Error('Some sprint games are no longer available to try.');return {id,title:g.title,system:g.system,outcome:null};});
 return {version:1,id,status:'active',startedAt:now,finishedAt:null,target:entries.length,entries};
}
export function syncSprint(sprint,games,now=Date.now()){
 if(!sprint||sprint.status==='ended')return sprint;
 const byId=new Map(games.map(g=>[g.id,g]));
 const entries=sprint.entries.map(e=>{const g=byId.get(e.id);return g?{...e,outcome:outcomes.includes(g.status)?g.status:null}:e;});
 const complete=entries.every(e=>e.outcome);
 return {...sprint,entries,status:complete?'completed':'active',finishedAt:complete?(sprint.finishedAt||now):null};
}
export function sprintSummary(sprint){
 const counts={keep:0,discard:0,skip:0};for(const e of sprint?.entries||[])if(outcomes.includes(e.outcome))counts[e.outcome]++;
 const done=Object.values(counts).reduce((a,b)=>a+b,0);return {counts,done,target:sprint?.target||0,remaining:(sprint?.target||0)-done};
}
export function nextSprintGame(sprint,games){
 if(sprint?.status!=='active')return null;const byId=new Map(games.map(g=>[g.id,g]));
 return sprint.entries.filter(e=>!e.outcome).map(e=>byId.get(e.id)).find(g=>available(g)&&g.status==='unreviewed')||null;
}
export function validateSprint(value){
 if(value===null)return null;
 if(!value||value.version!==1||typeof value.id!=='string'||!value.id.length||value.id.length>80||!['active','completed','ended'].includes(value.status)||!Number.isFinite(value.startedAt)||value.startedAt<0||value.finishedAt!==null&&(!Number.isFinite(value.finishedAt)||value.finishedAt<value.startedAt)||!Array.isArray(value.entries)||!value.entries.length||value.entries.length>50000||value.target!==value.entries.length)throw new Error('Invalid sprint record.');
 const ids=new Set();const entries=value.entries.map(e=>{if(!e||!/^[a-f0-9]{24}$/.test(e.id)||ids.has(e.id)||typeof e.title!=='string'||!['nes','snes','megadrive'].includes(e.system)||e.outcome!==null&&!outcomes.includes(e.outcome))throw new Error('Invalid sprint game.');ids.add(e.id);return {id:e.id,title:e.title.slice(0,400),system:e.system,outcome:e.outcome};});
 const complete=entries.every(e=>e.outcome);if(value.status==='completed'&&!complete||value.status==='active'&&complete)throw new Error('Invalid sprint progress.');
 return {version:1,id:value.id,status:value.status,startedAt:value.startedAt,finishedAt:value.finishedAt,target:entries.length,entries};
}
