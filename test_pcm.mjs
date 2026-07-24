import { pipeline, env } from '@xenova/transformers';

env.allowLocalModels = false;
env.useBrowserCache = false;
env.cacheDir = './.cache';

async function test() {
    console.log('Loading pipeline...');
    const transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny');
    console.log('Pipeline loaded!');

    // 16kHz float32 audio
    const pcm = new Float32Array(16000 * 3); // 3 seconds
    for (let i = 0; i < pcm.length; ++i) {
        pcm[i] = Math.sin(i / 10);
    }

    console.log('Running transcriber...');
    const out = await transcriber(pcm, {
        task: 'transcribe',
        language: 'portuguese',
        return_timestamps: false
    });
    console.log('Output:', out);
}

test().catch(err => console.error('Error:', err));
