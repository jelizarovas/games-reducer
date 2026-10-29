import { initSync, AudioProcessor } from "../pkg/jgenesis_web.js";

class JgenesisAudioProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super();

        let [module, memory, audioQueue] = options.processorOptions;
        initSync({ module, memory });
        this.processor = new AudioProcessor(audioQueue);
        this.speed = 1; this.muted = false;
        this.port.onmessage = event => { if (event.data.type === 'mute') this.muted = Boolean(event.data.muted); if (event.data.type === 'speed') this.speed = event.data.speed === 3 ? 3 : 1; };
    }

    process(inputs, outputs) {
        // Drain accelerated audio without playing the sped-up sound.
        for (let i = 0; i < this.speed; i++) this.processor.process(outputs[0][0], outputs[0][1]);
        if (this.muted || this.speed > 1) for (const channel of outputs[0]) channel.fill(0);
        return true;
    }
}

registerProcessor("audio-processor", JgenesisAudioProcessor);
