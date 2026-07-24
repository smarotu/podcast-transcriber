const https = require('https');
const fs = require('fs');

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
    
    // Look for episode URLs
    const matches = page.data.match(/https:\/\/observador\.pt\/podcast\/e-o-resto-e-historia\/[^\s"'<>]+/gi) || [];
    const unique = [...new Set(matches)];
    console.log('Unique episode URLs on page:', unique.slice(0, 10));

    if (unique.length > 0) {
        const epPage = await fetchUrl(unique[0]);
        console.log(`\nFetching episode page: ${unique[0]}`);
        console.log('Episode page status:', epPage.status);
        const audioSrc = epPage.data.match(/https?:\/\/[^\s"'<>]+\.(mp3|m4a|aac)/gi) || epPage.data.match(/audio_url["']?\s*:\s*["']([^"']+)["']/i);
        console.log('Episode audio src:', audioSrc);
    }
}

test();
