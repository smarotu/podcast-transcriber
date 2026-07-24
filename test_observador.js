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
    console.log('Fetching Observador podcast page...');
    const page = await fetchUrl('https://observador.pt/podcast/e-o-resto-e-historia/');
    console.log('Status:', page.status, 'Length:', page.data.length);

    // Look for audio tags or MP3 urls or RSS feed links
    const mp3Match = page.data.match(/https?:\/\/[^\s"'<>]+\.(mp3|m4a|aac)/gi);
    console.log('Found audio URLs:', mp3Match ? mp3Match.slice(0, 5) : 'None');

    const rssMatch = page.data.match(/https?:\/\/[^\s"'<>]+\.(xml|rss)/gi) || page.data.match(/https?:\/\/[^\s"'<>]*feed[^\s"'<>]*/gi);
    console.log('Found Feed URLs:', rssMatch ? rssMatch.slice(0, 5) : 'None');
}

test();
