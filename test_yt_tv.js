const https = require('https');

function fetchJsonPost(url, payload) {
    return new Promise((resolve, reject) => {
        const dataStr = JSON.stringify(payload);
        const req = https.request(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(dataStr),
                'User-Agent': 'Mozilla/5.0 (SmartHub; SMART-TV; U; Linux/SmartTV) AppleWebKit/537.42'
            }
        }, res => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
            });
        });
        req.on('error', reject);
        req.write(dataStr);
        req.end();
    });
}

async function resolveYouTubeTV(videoId) {
    console.log(`Resolving YouTube video via TVHTML5 API: ${videoId}...`);
    const body = {
        videoId: videoId,
        context: {
            client: {
                clientName: 'TVHTML5',
                clientVersion: '7.20230405.08.01',
                hl: 'en',
                gl: 'US'
            }
        }
    };

    const res = await fetchJsonPost('https://www.youtube.com/youtubei/v1/player', body);
    const title = res?.videoDetails?.title || 'YouTube Video';
    const show = res?.videoDetails?.author || 'YouTube Podcast';
    
    console.log(`Title: "${title}", Channel: "${show}"`);
    
    const formats = res?.streamingData?.adaptiveFormats || [];
    const audioFormats = formats.filter(f => f.mimeType && f.mimeType.includes('audio/'));

    console.log(`Found ${audioFormats.length} audio formats!`);
    if (audioFormats.length > 0) {
        audioFormats.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
        const bestAudio = audioFormats[0];
        console.log('✅ Direct Stream URL:', bestAudio.url ? bestAudio.url.slice(0, 100) + '...' : 'None (has cipher)');
        return {
            title,
            show,
            audioUrl: bestAudio.url
        };
    }

    return null;
}

resolveYouTubeTV('lHf7PEmGJ0Y').then(console.log).catch(console.error);
