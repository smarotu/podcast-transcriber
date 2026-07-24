const https = require('https');

function postJson(url, payload) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify(payload);
        const req = https.request(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
                'User-Agent': 'com.google.android.youtube/19.02.39 (Linux; U; Android 13; gzip)'
            }
        }, res => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
            });
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        https.get(url, {
            headers: {
                'User-Agent': 'com.google.android.youtube/19.02.39 (Linux; U; Android 13; gzip)'
            }
        }, res => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

async function testAndroid(videoId) {
    console.log(`Testing Android InnerTube API for video: ${videoId}...`);
    const playerRes = await postJson('https://www.youtube.com/youtubei/v1/player', {
        videoId: videoId,
        context: {
            client: {
                clientName: 'ANDROID',
                clientVersion: '19.02.39',
                androidSdkVersion: 33
            }
        }
    });

    const captionTracks = playerRes.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
    console.log(`Found ${captionTracks.length} caption tracks!`);

    if (captionTracks.length > 0) {
        const track = captionTracks[0];
        console.log('Target Track:', track.name?.runs?.[0]?.text || track.name?.simpleText, track.languageCode, track.baseUrl);
        const captionXml = await fetchUrl(track.baseUrl);
        console.log('Caption XML Length:', captionXml.length);
        console.log('Snippet:', captionXml.slice(0, 300));
        
        const matches = [...captionXml.matchAll(/<text start="([\d.]+)"[^>]*>(.*?)<\/text>/g)];
        console.log(`✅ Extracted ${matches.length} caption lines!`);
        if (matches.length > 0) {
            console.log('Sample transcript line:', matches[0][2]);
        }
    }
}

testAndroid('XG0MEwvaauo').catch(console.error);
