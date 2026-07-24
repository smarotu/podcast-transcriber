import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';

env.allowLocalModels = false;
env.useBrowserCache = true;

let transcriberInstance = null;
let currentModel = null;

async function getTranscriber(modelName, onProgress) {
    if (transcriberInstance && currentModel === modelName) return transcriberInstance;
    currentModel = modelName;
    transcriberInstance = null; // clear old instance
    transcriberInstance = await pipeline('automatic-speech-recognition', modelName, {
        progress_callback: onProgress
    });
    return transcriberInstance;
}

self.addEventListener('message', async (event) => {
    let { action, modelName = 'Xenova/whisper-tiny', language = 'auto', audioBuffer } = event.data;
    if (action !== 'transcribe') return;

    try {
        // Always use multilingual model
        if (modelName.endsWith('.en')) modelName = modelName.replace('.en', '');

        self.postMessage({ status: 'init', message: `Loading Whisper model (${modelName.split('/')[1]})...` });

        const transcriber = await getTranscriber(modelName, (p) => {
            if (p.status === 'progress') {
                self.postMessage({ status: 'model-progress', file: p.file, progress: Math.round(p.progress || 0) });
            }
        });

        const SAMPLE_RATE = 16000;
        const CHUNK_SEC = 30;
        const CHUNK_SAMPLES = SAMPLE_RATE * CHUNK_SEC;
        const totalSamples = audioBuffer.length;
        const totalChunks = Math.ceil(totalSamples / CHUNK_SAMPLES);
        const totalDurationSec = Math.round(totalSamples / SAMPLE_RATE);

        self.postMessage({
            status: 'chunk-progress',
            chunkIndex: 0,
            totalChunks,
            progress: 0,
            message: `Model ready. Transcribing ${formatTime(totalDurationSec)} of audio in ${totalChunks} segments...`
        });

        const transcribeOpts = {
            task: 'transcribe',
            // Prevent the "bem bem bem bem..." repetition hallucination
            no_repeat_ngram_size: 5,
            repetition_penalty: 1.3,
            temperature: 0.0,  // greedy decoding — most stable output
        };
        if (language && language !== 'auto') transcribeOpts.language = language;

        let fullText = '';

        for (let i = 0; i < totalChunks; i++) {
            const startSample = i * CHUNK_SAMPLES;
            const endSample = Math.min(startSample + CHUNK_SAMPLES, totalSamples);

            // Create a brand new Float32Array with its own buffer (byteOffset=0) — required by ONNX WASM
            const chunkLen = endSample - startSample;
            const chunk = new Float32Array(chunkLen);
            chunk.set(audioBuffer.subarray(startSample, endSample));

            const startSec = Math.floor(startSample / SAMPLE_RATE);
            const endSec = Math.floor(endSample / SAMPLE_RATE);
            const pct = Math.round(((i + 1) / totalChunks) * 100);

            self.postMessage({
                status: 'chunk-progress',
                chunkIndex: i + 1,
                totalChunks,
                progress: pct,
                message: `Segment ${i + 1}/${totalChunks} — [${formatTime(startSec)} → ${formatTime(endSec)}]`
            });

            let result;
            try {
                result = await transcriber(chunk, transcribeOpts);
            } catch (chunkErr) {
                console.error(`Chunk ${i + 1} failed:`, chunkErr.message);
                continue; // skip failed chunk, keep going
            }

            const chunkText = (result?.text || '').trim();
            if (chunkText) {
                if (fullText) fullText += '\n\n';
                fullText += `[${formatTime(startSec)} - ${formatTime(endSec)}] ${chunkText}`;

                self.postMessage({ status: 'partial', text: fullText, progress: pct });
            }
        }

        self.postMessage({ status: 'complete', text: fullText });

    } catch (err) {
        console.error('Worker fatal error:', err);
        self.postMessage({ status: 'error', error: err.message || String(err) });
    }
});

function formatTime(totalSeconds) {
    const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const s = (totalSeconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}
