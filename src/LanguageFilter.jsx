import {Dropdown} from './Dropdown';
import {languageNames} from './languages';
export function LanguageFilter({value,onChange,options,sidebar=false}){
  return <Dropdown label={sidebar?'Game language':'Library language'} value={value} onChange={onChange} options={options} width={250} triggerClassName={sidebar?`category-filter ${value!=='all'?'active':''}`:''} panelHeader={<p className="language-filter-note">Language tags take priority. Includes estimates from ROM regions.</p>}><span>{value==='all'?'All languages':value==='unknown'?'Unknown':languageNames[value]}</span></Dropdown>;
}
