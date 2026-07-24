const https = require('https');

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, res => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
            });
        }).on('error', reject);
    });
}

async function testPiped() {
    const videoId = 'lHf7PEmGJ0Y';
    const pipedInstances = [
        'https://pipedapi.kavin.rocks',
        'https://api.piped.video',
        'https://pipedapi.drgns.space'
    ];

    for (const inst of pipedInstances) {
        try {
            console.log(`Trying Piped instance: ${inst}...`);
            const data = await fetchJson(`${inst}/streams/${videoId}`);
            if (data && data.title) {
                console.log('✅ Piped Success! Title:', data.title);
                console.log('Uploader:', data.uploader);
                const audioStreams = data.audioStreams || [];
                console.log(`Found ${audioStreams.length} audio streams!`);
                if (audioStreams.length > 0) {
                    console.log('Audio URL:', audioStreams[0].url.slice(0, 100));
                    return {
                        title: data.title,
                        show: data.uploader || 'YouTube Podcast',
                        audioUrl: audioStreams[0].url
                    };
                }
            }
        } catch (e) {
            console.log(`Failed on ${inst}:`, e.message);
        }
    }

    // Fallback: YouTube oEmbed
    console.log('Trying YouTube oEmbed...');
    try {
        const oembed = await fetchJson(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
        console.log('oEmbed Title:', oembed.title, '| Author:', oembed.author_name);
    } catch (e) {
        console.log('oEmbed failed:', e.message);
    }

    return null;
}

testPiped().then(console.log).catch(console.error);
