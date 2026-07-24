const ytdl = require('@distube/ytdl-core');
const fs = require('fs');

async function testYtdlStream() {
    const videoUrl = 'https://www.youtube.com/watch?v=XG0MEwvaauo';
    console.log(`Streaming audio via ytdl for ${videoUrl}...`);

    let totalBytes = 0;
    const stream = ytdl(videoUrl, { filter: 'audioonly', quality: 'highestaudio' });

    stream.on('data', chunk => {
        totalBytes += chunk.length;
        if (totalBytes < 100000) {
            console.log(`   Received chunk: ${chunk.length} bytes (Total: ${totalBytes})`);
        }
    });

    stream.on('end', () => {
        console.log(`✅ Finished! Total audio downloaded: ${(totalBytes / (1024 * 1024)).toFixed(2)} MB`);
    });

    stream.on('error', err => {
        console.error('❌ Stream error:', err.message);
    });
}

testYtdlStream();
