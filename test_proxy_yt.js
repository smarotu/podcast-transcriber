const https = require('https');
const ytdl = require('@distube/ytdl-core');

async function testGoogleVideoProxy() {
    const videoUrl = 'https://www.youtube.com/watch?v=XG0MEwvaauo';
    console.log(`Getting ytdl info for ${videoUrl}...`);
    const info = await ytdl.getInfo(videoUrl);
    let audioFormats = ytdl.filterFormats(info.formats, 'audioonly').filter(f => f.url);
    if (!audioFormats || audioFormats.length === 0) {
        audioFormats = (info.formats || []).filter(f => f.url && f.mimeType && f.mimeType.includes('audio'));
    }
    if (!audioFormats || audioFormats.length === 0) {
        audioFormats = (info.formats || []).filter(f => f.url);
    }
    console.log('Found audio formats count:', audioFormats.length);

    if (audioFormats.length === 0) return;
    const streamUrl = audioFormats[0].url;
    console.log('Stream URL:', streamUrl.slice(0, 120) + '...');

    // Test 1: plain get
    https.get(streamUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
    }, res => {
        console.log('Test 1 Plain GET Status:', res.statusCode);
    });

    // Test 2: Range header
    https.get(streamUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Range': 'bytes=0-'
        }
    }, res => {
        console.log('Test 2 Range GET Status:', res.statusCode);
        console.log('Content-Length:', res.headers['content-length']);
    });
}

testGoogleVideoProxy().catch(console.error);
