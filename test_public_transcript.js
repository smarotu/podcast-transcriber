const https = require('https');

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        https.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        }, res => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, json: JSON.parse(data) }); } catch (e) { resolve({ status: res.statusCode, text: data }); }
            });
        }).on('error', reject);
    });
}

async function testPublicTranscript(videoId) {
    const endpoints = [
        `https://yt.lemnoslife.com/noKey/captions?videoId=${videoId}`,
        `https://corsproxy.io/?https://yt.lemnoslife.com/noKey/captions?videoId=${videoId}`
    ];

    for (const url of endpoints) {
        console.log(`Testing endpoint: ${url.slice(0, 60)}...`);
        const res = await fetchJson(url);
        console.log('Status:', res.status);
        if (res.json) {
            console.log('Keys:', Object.keys(res.json));
            if (res.json.subtitles) {
                console.log('Found subtitles:', res.json.subtitles.length);
            }
        }
    }
}

testPublicTranscript('XG0MEwvaauo').catch(console.error);
