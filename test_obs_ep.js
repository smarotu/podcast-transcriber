const https = require('https');

function fetchUrl(url, maxRedirects = 5) {
    return new Promise((resolve, reject) => {
        if (maxRedirects === 0) return reject(new Error('Too many redirects'));
        https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } }, res => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                const nextUrl = new URL(res.headers.location, url).toString();
                return fetchUrl(nextUrl, maxRedirects - 1).then(resolve).catch(reject);
            }
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ status: res.statusCode, data }));
        }).on('error', reject);
    });
}

async function test() {
    const url = 'https://observador.pt/programas/e-o-resto-e-historia/e-o-resto-e-historia-ao-vivo-em-que-e-que-a-democracia-influenciou-a-cultura/';
    console.log(`Fetching episode: ${url}`);
    const page = await fetchUrl(url);
    console.log('Status:', page.status);

    // Look for audio tags, data-audio, iframe, or audio links
    const dataAudio = page.data.match(/data-audio-url="([^"]+)"/i) || page.data.match(/data-src="([^"]+)"/i) || page.data.match(/https?:\/\/[^\s"'<>]+\.(mp3|m4a)/gi);
    console.log('Data audio match:', dataAudio ? dataAudio.slice(0, 5) : 'None');

    // Print any audio player tags
    const playerMatch = page.data.match(/<audio[^>]*>([\s\S]*?)<\/audio>/gi) || page.data.match(/<iframe[^>]*src="([^"]+)"/gi);
    console.log('Player/Iframe match:', playerMatch ? playerMatch.slice(0, 5) : 'None');
}

test();
