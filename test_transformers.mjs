// Quick test: can @xenova/transformers decode audio in Node.js?
async function test() {
    try {
        const { pipeline, env } = await import('@xenova/transformers');
        env.allowLocalModels = false;
        console.log('✅ @xenova/transformers imported');
        console.log('   Backend:', env.backends?.onnx ? 'onnx configured' : 'unknown');
        
        // Check audio processing capabilities
        const { read_audio } = await import('@xenova/transformers/src/utils/audio.js').catch(() => null) || {};
        console.log('   read_audio available:', !!read_audio);
        
        // List what's exported
        const mod = await import('@xenova/transformers');
        const keys = Object.keys(mod).filter(k => k.toLowerCase().includes('audio'));
        console.log('   Audio-related exports:', keys.join(', ') || 'none');
        
    } catch(e) {
        console.error('❌ Error:', e.message);
    }
}
test();
