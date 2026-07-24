const https = require('https');

function fetch(url, headers = {}) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', ...headers } }, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ status: res.statusCode, data }));
        }).on('error', reject);
    });
}

async function test() {
    const epId = '6KnTA2Qug0ChYoSMZK0rc';
    console.log(`Testing Spotify episode ID: ${epId}...`);

    // 1. Embed page
    const embedRes = await fetch(`https://open.spotify.com/embed/episode/${epId}`);
    console.log('Embed status:', embedRes.status);
    
    // Look for JSON script in embed
    const jsonMatch = embedRes.data.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/);
    if (jsonMatch) {
        try {
            const parsed = JSON.parse(jsonMatch[1]);
            console.log('Embed Next Data:', JSON.stringify(parsed, null, 2).slice(0, 800));
        } catch (e) {
            console.log('Failed to parse embed JSON:', e.message);
        }
    } else {
        console.log('No __NEXT_DATA__ found in embed page');
    }

    // 2. oEmbed
    const oembedRes = await fetch(`https://open.spotify.com/oembed?url=https://open.spotify.com/episode/${epId}`);
    console.log('oEmbed status:', oembedRes.status, 'data:', oembedRes.data);
}

test();
