const https = require('https');

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        https.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        }, res => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
            });
        }).on('error', reject);
    });
}

async function testCorsPiped(videoId) {
    const corsProxies = [
        `https://corsproxy.io/?https://api.piped.video/streams/${videoId}`,
        `https://corsproxy.io/?https://pipedapi.kavin.rocks/streams/${videoId}`,
        `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://api.piped.video/streams/${videoId}`)}`
    ];

    for (const proxyUrl of corsProxies) {
        try {
            console.log(`Testing CORS proxy: ${proxyUrl.slice(0, 60)}...`);
            const data = await fetchJson(proxyUrl);
            const title = data.title;
            const audioStreams = (data.audioStreams || []).filter(s => s.url);
            console.log(`   Found ${audioStreams.length} audio streams!`);
            if (audioStreams.length > 0) {
                console.log('✅ Direct CORS Audio Stream URL:', audioStreams[0].url.slice(0, 100) + '...');
                return { title, audioUrl: audioStreams[0].url };
            }
        } catch (e) {
            console.log('   Failed:', e.message);
        }
    }
    return null;
}

testCorsPiped('XG0MEwvaauo').then(console.log).catch(console.error);
