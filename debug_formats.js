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

async function debugFormats() {
    const page = await fetchUrl('https://www.youtube.com/watch?v=XG0MEwvaauo');
    const match = page.data.match(/"captionTracks":\s*(\[.*?\])/);
    if (match) {
        const tracks = JSON.parse(match[1]);
        const baseUrl = tracks[0].baseUrl.replace(/\\u0026/g, '&');

        const fmts = ['&fmt=json3', '&fmt=srv3', '&fmt=vtt', '&fmt=srv1', '&fmt=srv2'];
        for (const f of fmts) {
            const res = await fetchUrl(baseUrl + f);
            console.log(`Format ${f}: length ${res.data.length}, snippet:`, res.data.slice(0, 100).replace(/\n/g, ' '));
        }
    }
}

debugFormats();
