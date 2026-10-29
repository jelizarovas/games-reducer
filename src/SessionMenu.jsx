import {Ellipsis,LogOut,RotateCcw,Menu,Settings2} from 'lucide-react';
import {Dropdown} from './Dropdown';

export function SessionMenu({onFinish,onUndo,onController,onSettings,busy}) {
  return <Dropdown label="More actions" menu triggerClassName="overflow-trigger" options={[
    {value:'undo',label:'Undo last decision',icon:<RotateCcw size={17}/>,disabled:busy,onSelect:onUndo},
    {value:'controller',label:'Controller menu',icon:<Menu size={17}/>,onSelect:onController},
    {value:'settings',label:'Library settings',icon:<Settings2 size={17}/>,onSelect:onSettings},
    {value:'finish',label:'Finish session',icon:<LogOut size={17}/>,disabled:busy,onSelect:onFinish},
  ]}><Ellipsis size={21}/></Dropdown>;
}
