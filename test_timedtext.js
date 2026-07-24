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

async function extractYouTubeSubtitles(videoId) {
    console.log(`Extracting captions for YouTube Video: ${videoId}...`);
    
    const page = await fetchUrl(`https://www.youtube.com/watch?v=${videoId}`);
    const html = page.data;

    const match = html.match(/"captionTracks":\s*(\[.*?\])/);
    if (!match) return null;

    try {
        const tracks = JSON.parse(match[1]);
        let targetTrack = tracks.find(t => t.languageCode === 'pt' || t.languageCode?.startsWith('pt')) || tracks[0];
        if (!targetTrack || !targetTrack.baseUrl) return null;

        // Clean JSON u0026 escape sequences in URL
        let captionUrl = targetTrack.baseUrl.replace(/\\u0026/g, '&');
        if (!captionUrl.includes('fmt=')) captionUrl += '&fmt=json3';

        console.log('Clean Caption URL:', captionUrl.slice(0, 120) + '...');
        const captionRes = await fetchUrl(captionUrl);
        const dataStr = captionRes.data;

        let transcriptLines = [];

        // Check if json3 or xml
        if (dataStr.startsWith('{')) {
            const json = JSON.parse(dataStr);
            const events = json.events || [];
            events.forEach(e => {
                if (e.segs && e.tStartMs !== undefined) {
                    const text = e.segs.map(s => s.utf8).join('').trim();
                    if (text && text !== '\n') {
                        const startSec = Math.floor(e.tStartMs / 1000);
                        const mins = Math.floor(startSec / 60);
                        const secs = (startSec % 60).toString().padStart(2, '0');
                        transcriptLines.push(`[${mins}:${secs}] ${text}`);
                    }
                }
            });
        } else {
            const matches = [...dataStr.matchAll(/<text start="([\d.]+)"[^>]*>(.*?)<\/text>/g)];
            transcriptLines = matches.map(m => {
                const startSec = parseFloat(m[1]);
                const text = m[2].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
                const mins = Math.floor(startSec / 60);
                const secs = Math.floor(startSec % 60).toString().padStart(2, '0');
                return `[${mins}:${secs}] ${text}`;
            });
        }

        return {
            language: targetTrack.languageCode,
            transcript: transcriptLines.join('\n'),
            lineCount: transcriptLines.length
        };
    } catch (e) {
        console.error('Caption parsing error:', e.message);
        return null;
    }
}

extractYouTubeSubtitles('XG0MEwvaauo').then(res => {
    if (res) {
        console.log(`\n✅ SUCCESSFULLY EXTRACTED ${res.lineCount} LINES OF CAPTIONS (${res.language}):`);
        console.log(res.transcript.slice(0, 500) + '...');
    } else {
        console.log('❌ Could not extract captions.');
    }
}).catch(console.error);
