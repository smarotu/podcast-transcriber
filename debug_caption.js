const https = require('https');

function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        https.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        }, res => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => resolve({ status: res.statusCode, data }));
        }).on('error', reject);
    });
}

async function debug() {
    const page = await fetchUrl('https://www.youtube.com/watch?v=XG0MEwvaauo');
    const match = page.data.match(/"captionTracks":\s*(\[.*?\])/);
    if (match) {
        const tracks = JSON.parse(match[1]);
        const url = tracks[0].baseUrl.replace(/\\u0026/g, '&');
        console.log('Fetching:', url);
        const res = await fetchUrl(url);
        console.log('Response status:', res.status);
        console.log('Response snippet:', res.data.slice(0, 500));
    }
}

debug();
