// Reserve the slider for short sessions; the number field can use the full library.
export const MIN_SPRINT_SIZE=5;
export const sprintSliderMax=available=>Math.min(100,Math.max(MIN_SPRINT_SIZE,available));
export const sprintSliderPosition=(size,max)=>max<=MIN_SPRINT_SIZE?0:Math.round(Math.log(Math.min(max,Math.max(MIN_SPRINT_SIZE,size))/MIN_SPRINT_SIZE)/Math.log(max/MIN_SPRINT_SIZE)*1000);
export const sprintSliderSize=(position,max)=>max<=MIN_SPRINT_SIZE?MIN_SPRINT_SIZE:Math.round(MIN_SPRINT_SIZE*(max/MIN_SPRINT_SIZE)**(Math.min(1000,Math.max(0,position))/1000));
