const https = require('https');

function fetchCobalt(youtubeUrl) {
    return new Promise((resolve, reject) => {
        const bodyStr = JSON.stringify({
            url: youtubeUrl,
            downloadMode: 'audio',
            audioFormat: 'mp3'
        });

        const req = https.request('https://api.cobalt.tools/', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        }, res => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); } catch (e) { resolve({ error: data }); }
            });
        });

        req.on('error', reject);
        req.write(bodyStr);
        req.end();
    });
}

async function test() {
    const videoUrl = 'https://www.youtube.com/watch?v=XG0MEwvaauo';
    console.log(`Testing Cobalt API for ${videoUrl}...`);
    const res = await fetchCobalt(videoUrl);
    console.log('Cobalt Response:', res);
}

test().catch(console.error);
