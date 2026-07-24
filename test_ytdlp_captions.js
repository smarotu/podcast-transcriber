const { execFile } = require('child_process');
const https = require('https');
const path = require('path');

const YT_DLP_PATH = path.join(__dirname, 'bin', 'yt-dlp.exe');

function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        https.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        }, res => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

function getYtDlpCaptions(ytUrl) {
    return new Promise((resolve, reject) => {
        execFile(YT_DLP_PATH, ['--dump-json', '--no-warnings', '--no-playlist', ytUrl], { maxBuffer: 50 * 1024 * 1024 }, async (err, stdout) => {
            if (err) return reject(err);
            const json = JSON.parse(stdout);
            const autoCaps = json.automatic_captions || {};
            const subs = json.subtitles || {};

            // Prefer Portuguese ('pt') or English ('en')
            const ptCap = (subs.pt || autoCaps.pt || subs.en || autoCaps.en || [])[0];
            if (!ptCap || !ptCap.url) {
                return resolve(null);
            }

            console.log(`Found caption track format: ${ptCap.ext} URL:`, ptCap.url.slice(0, 100) + '...');
            const rawCap = await fetchUrl(ptCap.url);
            
            let lines = [];
            if (rawCap.startsWith('{')) {
                const capJson = JSON.parse(rawCap);
                (capJson.events || []).forEach(e => {
                    if (e.segs && e.tStartMs !== undefined) {
                        const text = e.segs.map(s => s.utf8).join('').trim();
                        if (text && text !== '\n') {
                            const secs = Math.floor(e.tStartMs / 1000);
                            const mins = Math.floor(secs / 60);
                            const remSecs = (secs % 60).toString().padStart(2, '0');
                            lines.push(`[${mins}:${remSecs}] ${text}`);
                        }
                    }
                });
            }

            resolve({
                title: json.fulltitle || json.title,
                show: json.uploader || json.channel,
                transcript: lines.join('\n'),
                lineCount: lines.length
            });
        });
    });
}

getYtDlpCaptions('https://www.youtube.com/watch?v=XG0MEwvaauo').then(res => {
    if (res) {
        console.log(`\n✅ INSTANTLY EXTRACTED ${res.lineCount} CAPTION LINES FOR: "${res.title}"!`);
        console.log(res.transcript.slice(0, 600) + '...');
    } else {
        console.log('No captions found.');
    }
}).catch(console.error);
