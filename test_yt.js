const https = require('https');

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
            });
        }).on('error', reject);
    });
}

async function testYouTube() {
    const videoId = 'lHf7PEmGJ0Y'; // E o Resto é História episode on YouTube
    const instances = [
        'https://invidious.nerdvpn.de',
        'https://inv.tux.pizza',
        'https://invidious.drgns.space'
    ];

    for (const inst of instances) {
        try {
            console.log(`Trying Invidious instance: ${inst}...`);
            const data = await fetchJson(`${inst}/api/v1/videos/${videoId}`);
            if (data && data.title) {
                console.log('✅ Success! Video Title:', data.title);
                const audioFormats = (data.adaptiveFormats || []).filter(f => f.type && f.type.includes('audio'));
                console.log(`Found ${audioFormats.length} audio streams!`);
                if (audioFormats.length > 0) {
                    console.log('Direct audio stream URL:', audioFormats[0].url.slice(0, 120) + '...');
                    return {
                        title: data.title,
                        show: data.author || 'YouTube Podcast',
                        audioUrl: audioFormats[0].url
                    };
                }
            }
        } catch (err) {
            console.log(`Failed on ${inst}:`, err.message);
        }
    }
    return null;
}

testYouTube().then(console.log).catch(console.error);
