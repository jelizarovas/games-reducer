import {useState} from 'react';
import {Check,ChevronDown,ListFilter} from 'lucide-react';
import {Dropdown} from './Dropdown';
import {languageLabel,toggleLanguage} from './languages';

const statuses=[['unreviewed','To try'],['keep','Keepers'],['discard','Marked'],['skip','Later'],['all','All games']].map(([value,label])=>({value,label}));
export function FilterMenu({filter,onFilter,category,onCategory,categories,language,onLanguage,languages,library=false}){
  const [section,setSection]=useState('language');
  const active=category!=='all'||!language.includes('all')||filter!=='unreviewed';
  const groups=[
    {id:'status',label:'Review status',summary:statuses.find(o=>o.value===filter)?.label,value:filter,options:statuses,onChange:onFilter},
    {id:'category',label:'Category',summary:categories.find(o=>o.value===category)?.label,value:category,options:categories,onChange:onCategory},
    {id:'language',label:'Languages',summary:languageLabel(language),value:language,options:languages,onChange:choice=>onLanguage(toggleLanguage(language,choice)),multiple:true}
  ];
  return <Dropdown label={library?'Library filters':'Filters'} showArrow={false} width={300} maxHeight={460} triggerClassName={`search-dropdown filters-trigger ${active?'active':''}`} renderPanel={()=> <div className="filter-menu">
    {groups.map(group=><div key={group.id}>
      <button className="filter-section-trigger" aria-expanded={section===group.id} onClick={()=>setSection(section===group.id?null:group.id)}><span><strong>{group.label}</strong><small>{group.summary}</small></span><ChevronDown size={14}/></button>
      {section===group.id&&<div className="filter-options" role="group" aria-label={group.label}>
        {group.multiple&&<p className="language-filter-note">Select any languages, including Unknown. Region tags are estimates.</p>}
        {group.options.map(option=>{const selected=group.multiple?group.value.includes(option.value):group.value===option.value;return <button key={option.value} role={group.multiple?'checkbox':'radio'} aria-checked={selected} onClick={()=>group.onChange(option.value)}><span>{option.label}</span><span className="filter-check">{selected&&<Check size={15}/>}</span></button>;})}
      </div>}
    </div>)}
  </div>}><ListFilter size={18}/>{active&&<span className="filter-active-dot"/>}</Dropdown>;
}
