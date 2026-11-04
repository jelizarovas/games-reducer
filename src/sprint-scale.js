// Reserve the slider for short sessions; the number field can use the full library.
export const sprintSliderMax=available=>Math.min(100,Math.max(1,available));
export const sprintSliderPosition=(size,max)=>max<=1?0:Math.round(Math.log(Math.min(max,Math.max(1,size)))/Math.log(max)*1000);
export const sprintSliderSize=(position,max)=>max<=1?1:Math.round(max**(Math.min(1000,Math.max(0,position))/1000));
