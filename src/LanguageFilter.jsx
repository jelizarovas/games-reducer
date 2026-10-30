import {Dropdown} from './Dropdown';
import {languageLabel,toggleLanguage} from './languages';
export function LanguageFilter({value,onChange,options,sidebar=false}){
  return <Dropdown multiple label={sidebar?'Game language':'Library language'} value={value} onChange={choice=>onChange(toggleLanguage(value,choice))} options={options} width={280} triggerClassName={sidebar?`category-filter ${!value.includes('all')?'active':''}`:''} panelHeader={<p className="language-filter-note">Select any languages. Includes estimates from ROM regions.</p>}><span>{languageLabel(value)}</span></Dropdown>;
}
