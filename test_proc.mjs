import { AutoProcessor, env } from '@xenova/transformers';

env.allowLocalModels = false;
env.useBrowserCache = false;
env.cacheDir = './.cache';

async function testProcessor() {
    console.log('Loading processor...');
    const processor = await AutoProcessor.from_pretrained('Xenova/whisper-tiny');
    const pcm = new Float32Array(16000 * 3);
    for (let i = 0; i < pcm.length; ++i) pcm[i] = Math.sin(i / 10);
    
    console.log('Processing audio...');
    const out = await processor(pcm);
    console.log('Processor output keys:', Object.keys(out));
    console.log('input_features:', out.input_features);
    console.log('input_features.data length:', out.input_features?.data?.length);
    console.log('input_features.dims:', out.input_features?.dims);
}

testProcessor().catch(console.error);
