import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
test('muting drains the audio queue without stopping emulation and restores output',()=>{
  let Processor,drained=0;
  const context={AudioWorkletProcessor:class{constructor(){this.port={};}},initSync(){},AudioProcessor:class{process(left,right){drained++;left.fill(.5);right.fill(.5);}},registerProcessor(name,Type){Processor=Type;}};
  const source=fs.readFileSync('public/engine/js/audio-processor.js','utf8').replace(/^import .*;\r?\n/,'');
  vm.runInNewContext(source,context);
  const p=new Processor({processorOptions:[null,null,null]}),output=[[new Float32Array(128),new Float32Array(128)]];
  p.process([],output);assert.equal(output[0][0][0],.5);
  p.port.onmessage({data:{type:'mute',muted:true}});p.process([],output);assert.equal(drained,2);assert.ok(output[0].every(c=>c.every(v=>v===0)));
  p.port.onmessage({data:{type:'speed',speed:3}});p.process([],output);assert.equal(drained,5);
  p.port.onmessage({data:{type:'speed',speed:1}});p.process([],output);assert.equal(output[0][0][0],0);
  p.port.onmessage({data:{type:'mute',muted:false}});p.process([],output);assert.equal(output[0][0][0],.5);
});
