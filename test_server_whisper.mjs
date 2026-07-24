// Test script for server-side Whisper pipeline execution
async function testServerWhisper() {
    console.log('🚀 Loading @xenova/transformers pipeline in Node...');
    const { pipeline, env } = await import('@xenova/transformers');
    
    env.allowLocalModels = false;
    env.useBrowserCache = false;
    env.cacheDir = './.cache';

    console.log('⏳ Initializing ASR model Xenova/whisper-tiny...');
    const transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny', {
        progress_callback: (p) => {
            if (p.status === 'progress') console.log(`   Model download: ${p.file} ${Math.round(p.progress || 0)}%`);
        }
    });

    console.log('✅ Model loaded successfully into native ONNX Runtime!');

    // Test with 5 seconds of silence/sine wave (16kHz float32)
    const sampleRate = 16000;
    const duration = 5;
    const pcm = new Float32Array(sampleRate * duration);
    for (let i = 0; i < pcm.length; i++) {
        pcm[i] = Math.sin(2 * Math.PI * 440 * i / sampleRate) * 0.1;
    }

    console.log('⚡ Running inference on 5s test audio...');
    const startTime = Date.now();
    const result = await transcriber(pcm, { task: 'transcribe', language: 'portuguese' });
    const elapsed = Date.now() - startTime;

    console.log(`🎉 Transcription complete in ${elapsed}ms! Result:`, result);
}

testServerWhisper().catch(err => console.error('❌ Test failed:', err));
