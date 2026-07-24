const https = require('https');

function fetchPage(url) {
    return new Promise((resolve, reject) => {
        https.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9,pt;q=0.8'
            }
        }, res => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

async function resolveYouTubeVideo(videoId) {
    console.log(`Resolving YouTube video ID: ${videoId}...`);
    const pageHtml = await fetchPage(`https://www.youtube.com/watch?v=${videoId}`);
    
    // 1. Title
    const titleMatch = pageHtml.match(/<meta name="title" content="([^"]+)"/i) || pageHtml.match(/<title>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].replace(/ - YouTube$/, '').trim() : 'YouTube Video';

    // 2. Author / Show
    const authorMatch = pageHtml.match(/<link itemprop="name" content="([^"]+)"/i) || pageHtml.match(/"author"\s*:\s*"([^"]+)"/i);
    const show = authorMatch ? authorMatch[1] : 'YouTube Podcast';

    console.log(`Title: "${title}", Channel: "${show}"`);

    // 3. Extract player response JSON safely
    const jsonStart = pageHtml.indexOf('ytInitialPlayerResponse = ');
    if (jsonStart !== -1) {
        try {
            const startIdx = jsonStart + 'ytInitialPlayerResponse = '.length;
            let braceCount = 0;
            let jsonEnd = startIdx;
            for (let i = startIdx; i < pageHtml.length; i++) {
                if (pageHtml[i] === '{') braceCount++;
                else if (pageHtml[i] === '}') {
                    braceCount--;
                    if (braceCount === 0) {
                        jsonEnd = i + 1;
                        break;
                    }
                }
            }
            const jsonStr = pageHtml.slice(startIdx, jsonEnd);
            const playerResponse = JSON.parse(jsonStr);
            const formats = playerResponse?.streamingData?.adaptiveFormats || [];
            const audioFormats = formats.filter(f => f.mimeType && f.mimeType.includes('audio/'));

            console.log(`Found ${audioFormats.length} audio formats!`);
            if (audioFormats.length > 0) {
                audioFormats.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
                const bestAudio = audioFormats[0];
                console.log('bestAudio keys:', Object.keys(bestAudio));
                console.log('bestAudio snippet:', JSON.stringify(bestAudio).slice(0, 300));
                const audioUrl = bestAudio.url || (bestAudio.signatureCipher ? new URLSearchParams(bestAudio.signatureCipher).get('url') : null) || (bestAudio.cipher ? new URLSearchParams(bestAudio.cipher).get('url') : null);
                
                console.log('✅ Direct Audio Stream URL:', audioUrl ? audioUrl.slice(0, 100) + '...' : 'None');
                return { title, show, audioUrl };
            }
        } catch (e) {
            console.error('Failed to parse ytInitialPlayerResponse:', e.message);
        }
    } else {
        console.log('No ytInitialPlayerResponse match found in HTML');
    }

    return { title, show, audioUrl: null };
}

resolveYouTubeVideo('lHf7PEmGJ0Y').then(console.log).catch(console.error);
