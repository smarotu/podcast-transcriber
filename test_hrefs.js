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
    const page = await fetchUrl('https://observador.pt/podcast/e-o-resto-e-historia/');
    
    // Look for all links
    const matches = page.data.match(/href="([^"]+)"/gi) || [];
    const hrefs = matches.map(m => m.replace(/^href="/i, '').replace(/"$/, ''));
    console.log('Sample hrefs:', hrefs.filter(h => h.includes('podcast') || h.includes('programas')).slice(0, 15));

    // Look for mp3 or audio stream URL in page scripts
    const mp3s = page.data.match(/https?:\/\/[^\s"'<>]+\.mp3/gi) || [];
    console.log('Direct MP3s in HTML:', mp3s.slice(0, 5));
}

test();
