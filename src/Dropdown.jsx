import {useEffect,useId,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {ChevronDown,Check} from 'lucide-react';

export function Dropdown({label,value,options,onChange,children,triggerClassName='',menu=false,width=210}) {
  const [open,setOpen]=useState(false),[position,setPosition]=useState({left:0,top:0});
  const trigger=useRef(null),panel=useRef(null),id=useId();
  const close=(focus=false)=>{setOpen(false);if(focus)trigger.current?.focus();};
  const items=()=>[...(panel.current?.querySelectorAll('button:not(:disabled)')||[])];
  useLayoutEffect(()=>{
    if(!open)return;
    const place=()=>{
      const rect=trigger.current.getBoundingClientRect(),height=Math.min(panel.current.scrollHeight,320,innerHeight-16),actualWidth=Math.min(width,innerWidth-16);
      const below=innerHeight-rect.bottom-8,above=rect.top-8;
      setPosition({left:Math.max(8,Math.min(rect.left,innerWidth-actualWidth-8)),top:below<height&&above>below?Math.max(8,rect.top-height-4):Math.min(rect.bottom+4,innerHeight-height-8)});
    };
    place();
    (panel.current.querySelector('[aria-selected="true"]:not(:disabled)')||items()[0])?.focus({preventScroll:true});
    window.addEventListener('resize',place);
    return()=>window.removeEventListener('resize',place);
  },[open,width]);
  useEffect(()=>{
    if(!open)return;
    const outside=e=>{if(!trigger.current?.contains(e.target)&&!panel.current?.contains(e.target))close();};
    const blur=()=>close();
    document.addEventListener('pointerdown',outside);document.addEventListener('focusin',outside);window.addEventListener('blur',blur);
    return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('focusin',outside);window.removeEventListener('blur',blur);};
  },[open]);
  const keys=e=>{
    e.stopPropagation();
    if(e.key==='Escape'){e.preventDefault();close(true);return;}
    if(e.key==='Tab'){close(true);return;}
    const list=items(),index=list.indexOf(document.activeElement);
    if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){
      e.preventDefault();
      const next=e.key==='Home'?0:e.key==='End'?list.length-1:(index+(e.key==='ArrowDown'?1:-1)+list.length)%list.length;
      list[next]?.focus();
    }
  };
  return <>
    <button ref={trigger} className={`dropdown-trigger ${triggerClassName}`} role={menu?undefined:'combobox'} aria-label={label} title={label} aria-haspopup={menu?'menu':'listbox'} aria-controls={open?id:undefined} aria-expanded={open} data-value={value}
      onClick={()=>setOpen(v=>!v)} onKeyDown={e=>{if(['ArrowDown','ArrowUp','Enter',' '].includes(e.key)){e.preventDefault();e.stopPropagation();setOpen(true);}if(e.key==='Escape'&&open){e.preventDefault();e.stopPropagation();close(true);}}}>
      {children}<ChevronDown className="dropdown-arrow" size={12}/>
    </button>
    {open&&createPortal(<div ref={panel} id={id} className="dropdown-panel" style={{...position,width:`min(${width}px, calc(100vw - 16px))`}} role={menu?'menu':'listbox'} aria-label={label} onKeyDown={keys} onKeyUp={e=>e.stopPropagation()}>
      {options.map(option=><button key={option.value} role={menu?'menuitem':'option'} aria-selected={menu?undefined:value===option.value} disabled={option.disabled} onClick={()=>{close(true);if(menu)option.onSelect?.();else onChange(option.value);}}>
        {option.icon}<span>{option.label}</span>{!menu&&value===option.value&&<Check size={15}/>}
      </button>)}
    </div>,document.body)}
  </>;
}
