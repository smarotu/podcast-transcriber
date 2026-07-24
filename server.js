const http = require('http');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.ico': 'image/x-icon',
    '.mp3': 'audio/mpeg',
    '.m4a': 'audio/mp4',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.wasm': 'application/wasm'
};

const { execFile } = require('child_process');
const YT_DLP_PATH = process.platform === 'win32'
    ? (fs.existsSync(path.join(__dirname, 'bin', 'yt-dlp.exe')) ? path.join(__dirname, 'bin', 'yt-dlp.exe') : 'yt-dlp')
    : (fs.existsSync('/usr/local/bin/yt-dlp') ? '/usr/local/bin/yt-dlp' : 'yt-dlp');
const CACHE_DIR = path.join(__dirname, '.cache');

if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

function resolveYouTubeUrl(ytUrl) {
    return new Promise((resolve) => {
        const cmd = process.platform === 'win32' ? YT_DLP_PATH : 'python3';
        const args = process.platform === 'win32'
            ? ['--dump-json', '--no-warnings', '--no-playlist', '--extractor-args', 'youtube:player_client=android,web', ytUrl]
            : [YT_DLP_PATH, '--dump-json', '--no-warnings', '--no-playlist', '--extractor-args', 'youtube:player_client=android,web', ytUrl];

        execFile(cmd, args, { maxBuffer: 50 * 1024 * 1024 }, (err, stdout, stderr) => {
            if (err) {
                const errMsg = (stderr || err.message || 'Extract failed').slice(0, 300);
                console.error('yt-dlp JSON error:', errMsg);
                return resolve({ error: 'yt-dlp error: ' + errMsg });
            }
            try {
                const json = JSON.parse(stdout);
                const videoId = json.id || 'yt_' + Date.now();
                const title = json.fulltitle || json.title || 'YouTube Podcast';
                const show = json.uploader || json.channel || 'YouTube';
                
                const cachedFileName = `yt_${videoId}.mp3`;
                const cachedFilePath = path.join(CACHE_DIR, cachedFileName);

                if (fs.existsSync(cachedFilePath) && fs.statSync(cachedFilePath).size > 0) {
                    console.log(`[YouTube AI] Found cached audio for: "${title}"`);
                    return resolve({
                        title,
                        show,
                        audioUrl: `/api/local-audio?file=${cachedFileName}`,
                        youtubeUrl: ytUrl
                    });
                }

                console.log(`[YouTube AI] Downloading audio on server for: "${title}"...`);
                execFile(YT_DLP_PATH, ['-f', 'ba/b', '--no-playlist', '-o', cachedFilePath, ytUrl], { maxBuffer: 50 * 1024 * 1024 }, (dlErr) => {
                    if (dlErr || !fs.existsSync(cachedFilePath)) {
                        console.error('yt-dlp download error:', dlErr?.message);
                        return resolve({ error: 'Failed to download YouTube audio stream on server.' });
                    }

                    console.log(`[YouTube AI] Audio downloaded & ready on server: "${title}"!`);
                    resolve({
                        title,
                        show,
                        audioUrl: `/api/local-audio?file=${cachedFileName}`,
                        youtubeUrl: ytUrl
                    });
                });

            } catch (e) {
                console.error('yt-dlp JSON parse error:', e.message);
                resolve({ error: 'Failed to parse YouTube video information.' });
            }
        });
    });
}

// Global Server AI Pipeline Cache
let transformersLib = null;
const modelInstances = {};

async function getTranscriberServer(modelName) {
    if (!transformersLib) {
        transformersLib = await import('@xenova/transformers');
        transformersLib.env.allowLocalModels = false;
        transformersLib.env.useBrowserCache = false;
        transformersLib.env.cacheDir = path.join(__dirname, '.cache');
    }
    if (modelInstances[modelName]) return modelInstances[modelName];

    console.log(`\n[Server AI] Loading Whisper model (${modelName}) in native C++ ONNX Runtime...`);
    const transcriber = await transformersLib.pipeline('automatic-speech-recognition', modelName);
    modelInstances[modelName] = transcriber;
    console.log(`[Server AI] ✅ Model (${modelName}) ready on server!\n`);
    return transcriber;
}

// Helper: HTTP request returning promise
function fetchUrl(url, headers = {}, maxRedirects = 5) {
    return new Promise((resolve, reject) => {
        if (maxRedirects === 0) return reject(new Error('Too many redirects'));
        
        try {
            const parsedUrl = new URL(url);
            const lib = parsedUrl.protocol === 'https:' ? https : http;
            const defaultHeaders = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                ...headers
            };
            
            const req = lib.get(url, { headers: defaultHeaders }, (res) => {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    const nextUrl = new URL(res.headers.location, url).toString();
                    return fetchUrl(nextUrl, headers, maxRedirects - 1).then(resolve).catch(reject);
                }
                
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, data }));
            });
            req.on('error', reject);
            req.end();
        } catch (e) {
            reject(e);
        }
    });
}

// Extract Spotify Episode ID from URL
function parseSpotifyUrl(inputUrl) {
    try {
        const url = new URL(inputUrl);
        if (url.hostname.includes('spotify.com')) {
            const match = url.pathname.match(/\/episode\/([a-zA-Z0-9]+)/);
            if (match) return match[1];
        }
    } catch (e) {}
    return null;
}

// Resolve Spotify episode link
async function resolveSpotifyEpisode(spotifyUrl) {
    const episodeId = parseSpotifyUrl(spotifyUrl);
    let episodeTitle = '';
    let showName = '';
    
    // Attempt 1: Fetch Spotify oEmbed endpoint
    try {
        const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(spotifyUrl)}`;
        const oembedRes = await fetchUrl(oembedUrl);
        if (oembedRes.statusCode === 200) {
            const json = JSON.parse(oembedRes.data);
            if (json.title) episodeTitle = json.title;
        }
    } catch (e) {}

    // Attempt 2: Scrape web page with Facebookbot and Googlebot user agents
    if (!episodeTitle) {
        for (const ua of ['facebookexternalhit/1.1', 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)']) {
            try {
                const pageRes = await fetchUrl(spotifyUrl, { 'User-Agent': ua });
                if (pageRes.statusCode === 200) {
                    const html = pageRes.data;
                    const ogTitleMatch = html.match(/<meta property="og:title" content="([^"]+)"/i) || html.match(/<title>([^<]+)<\/title>/i);
                    const ogDescMatch = html.match(/<meta property="og:description" content="([^"]+)"/i);
                    
                    if (ogTitleMatch && !ogTitleMatch[1].includes('Spotify - Web Player') && !ogTitleMatch[1].includes('Page not available')) {
                        episodeTitle = ogTitleMatch[1].replace(/ \| Spotify$/, '').replace(/ \| Podcast on Spotify$/, '').trim();
                    }
                    if (ogDescMatch) {
                        showName = ogDescMatch[1].trim();
                    }
                    if (episodeTitle) break;
                }
            } catch (e) {}
        }
    }

    // Search public iTunes API for direct stream
    if (episodeTitle) {
        const cleanTitle = episodeTitle.replace(/[^\w\s]/gi, ' ').slice(0, 40).trim();
        const searchUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(cleanTitle)}&entity=podcastEpisode&limit=5`;
        try {
            const searchRes = await fetchUrl(searchUrl);
            if (searchRes.statusCode === 200) {
                const data = JSON.parse(searchRes.data);
                if (data.results && data.results.length > 0) {
                    const match = data.results.find(item => item.episodeUrl || item.previewUrl) || data.results[0];
                    const audioUrl = match.episodeUrl || match.previewUrl;
                    if (audioUrl) {
                        return {
                            title: episodeTitle,
                            show: showName || match.collectionName || 'Spotify Podcast',
                            audioUrl: audioUrl,
                            spotifyUrl: spotifyUrl
                        };
                    }
                }
            }
        } catch (e) {}
    }

    return {
        title: episodeTitle || 'Spotify Podcast Episode',
        show: showName || 'Spotify Podcast',
        audioUrl: null,
        spotifyUrl: spotifyUrl,
        error: 'Direct audio stream is protected by Spotify DRM. Please download audio using an external downloader or paste the direct MP3/M4A RSS link below, or upload the file.'
    };
}

const server = http.createServer(async (req, res) => {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;

    // API: Search Podcast Episodes by Title or Show Name
    if (pathname === '/api/search-podcast') {
        const query = parsedUrl.searchParams.get('q');
        if (!query) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing search query' }));
            return;
        }

        try {
            // Stage 1: Episode search
            const epUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=podcastEpisode&limit=10`;
            const epRes = await fetchUrl(epUrl);
            let results = [];

            if (epRes.statusCode === 200) {
                const data = JSON.parse(epRes.data);
                results = (data.results || []).map(r => ({
                    title: r.trackName,
                    show: r.collectionName,
                    audioUrl: r.episodeUrl || r.previewUrl,
                    artwork: r.artworkUrl100 || r.artworkUrl60
                })).filter(r => r.audioUrl);
            }

            // Stage 2: Show RSS Feed search fallback if no direct episode enclosures
            if (results.length === 0) {
                const showUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=podcast&limit=5`;
                const showRes = await fetchUrl(showUrl);
                if (showRes.statusCode === 200) {
                    const showData = JSON.parse(showRes.data);
                    for (const show of (showData.results || [])) {
                        if (show.feedUrl) {
                            try {
                                const rssRes = await fetchUrl(show.feedUrl);
                                const enclosures = rssRes.data.match(/<enclosure[^>]+url="([^"]+)"/gi) || [];
                                const titles = rssRes.data.match(/<title>([^<]+)<\/title>/gi) || [];

                                enclosures.slice(0, 10).forEach((enc, idx) => {
                                    const urlMatch = enc.match(/url="([^"]+)"/i);
                                    if (urlMatch) {
                                        const cleanTitle = titles[idx + 1] ? titles[idx + 1].replace(/<\/?title>/g, '').replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim() : `${show.collectionName} Episode ${idx + 1}`;
                                        results.push({
                                            title: cleanTitle,
                                            show: show.collectionName,
                                            audioUrl: urlMatch[1],
                                            artwork: show.artworkUrl100
                                        });
                                    }
                                });
                            } catch (rssErr) {}
                        }
                    }
                }
            }

            res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ results }));

        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    // API: Resolve YouTube URL
    if (pathname === '/api/resolve-youtube') {
        const ytUrl = parsedUrl.searchParams.get('url');
        if (!ytUrl) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing YouTube URL parameter' }));
            return;
        }

        try {
            const metadata = await resolveYouTubeUrl(ytUrl);
            res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify(metadata));
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to resolve YouTube link: ' + err.message }));
        }
        return;
    }

    // API: Resolve Spotify URL
    if (pathname === '/api/resolve-spotify') {
        const spotifyUrl = parsedUrl.searchParams.get('url');
        if (!spotifyUrl) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing Spotify URL parameter' }));
            return;
        }

        try {
            const metadata = await resolveSpotifyEpisode(spotifyUrl);
            res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify(metadata));
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to resolve Spotify link: ' + err.message }));
        }
        return;
    }

    // API: Fast Server-Side Whisper AI Transcription
    if (pathname === '/api/transcribe-chunk' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const data = JSON.parse(body);
                let { modelName = 'Xenova/whisper-tiny', language = 'auto', pcm, startSec, endSec, chunkIndex, totalChunks } = data;
                
                if (modelName.endsWith('.en')) modelName = modelName.replace('.en', '');
                const transcriber = await getTranscriberServer(modelName);

                const pcmArray = new Float32Array(pcm);
                const opts = {
                    task: 'transcribe',
                    no_repeat_ngram_size: 5,
                    repetition_penalty: 1.3,
                    temperature: 0.0
                };
                if (language && language !== 'auto') opts.language = language;

                const startTime = Date.now();
                const result = await transcriber(pcmArray, opts);
                const elapsedMs = Date.now() - startTime;
                const text = (result?.text || '').trim();

                console.log(`[Server AI] Segment ${chunkIndex}/${totalChunks} transcribed in ${elapsedMs}ms: "${text.slice(0, 40)}..."`);

                res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                res.end(JSON.stringify({ status: 'success', text, chunkIndex, startSec, endSec, elapsedMs }));

            } catch (err) {
                console.error('[Server AI Error]', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'error', error: err.message || String(err) }));
            }
        });
        return;
    }

    // API: Serve cached local audio files
    if (pathname === '/api/local-audio') {
        const fileName = parsedUrl.searchParams.get('file');
        if (!fileName || fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid file parameter' }));
            return;
        }

        const filePath = path.join(CACHE_DIR, fileName);
        fs.stat(filePath, (err, stats) => {
            if (err || !stats.isFile()) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Audio file not found' }));
                return;
            }

            const range = req.headers.range;
            const fileSize = stats.size;

            if (range) {
                const parts = range.replace(/bytes=/, "").split("-");
                const start = parseInt(parts[0], 10);
                const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
                const chunksize = (end - start) + 1;

                const fileStream = fs.createReadStream(filePath, { start, end });
                res.writeHead(206, {
                    'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                    'Accept-Ranges': 'bytes',
                    'Content-Length': chunksize,
                    'Content-Type': 'audio/mpeg',
                    'Access-Control-Allow-Origin': '*'
                });
                fileStream.pipe(res);
            } else {
                res.writeHead(200, {
                    'Content-Length': fileSize,
                    'Content-Type': 'audio/mpeg',
                    'Access-Control-Allow-Origin': '*'
                });
                fs.createReadStream(filePath).pipe(res);
            }
        });
        return;
    }

    // API: Audio Proxy
    if (pathname === '/api/proxy-audio') {
        const audioUrl = parsedUrl.searchParams.get('url');
        if (!audioUrl) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing audio URL parameter' }));
            return;
        }

        try {
            const targetUrl = new URL(audioUrl);
            const lib = targetUrl.protocol === 'https:' ? https : http;
            
            const reqHeaders = {
                'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': '*/*'
            };
            if (req.headers.range) {
                reqHeaders['Range'] = req.headers.range;
            }

            const proxyReq = lib.get(audioUrl, { headers: reqHeaders }, (proxyRes) => {
                if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
                    res.writeHead(302, { 'Location': `/api/proxy-audio?url=${encodeURIComponent(proxyRes.headers.location)}` });
                    res.end();
                    return;
                }

                const resHeaders = {
                    'Content-Type': proxyRes.headers['content-type'] || 'audio/mpeg',
                    'Access-Control-Allow-Origin': '*',
                    'Accept-Ranges': 'bytes'
                };
                if (proxyRes.headers['content-length']) resHeaders['Content-Length'] = proxyRes.headers['content-length'];
                if (proxyRes.headers['content-range']) resHeaders['Content-Range'] = proxyRes.headers['content-range'];

                res.writeHead(proxyRes.statusCode, resHeaders);
                proxyRes.pipe(res);
            });

            proxyReq.on('error', (err) => {
                console.error('Audio proxy error:', err.message);
                if (!res.headersSent) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Failed to proxy audio stream' }));
                }
            });
            proxyReq.end();
        } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid audio URL' }));
        }
        return;
    }

    // Static File Serving
    let reqPath = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');
    let filePath = path.join(PUBLIC_DIR, reqPath);

    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        filePath = path.join(__dirname, reqPath);
    }
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        filePath = fs.existsSync(path.join(PUBLIC_DIR, 'index.html'))
            ? path.join(PUBLIC_DIR, 'index.html')
            : path.join(__dirname, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (readErr, content) => {
        if (readErr) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Internal Server Error');
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content);
        }
    });
});

const os = require('os');
function getLocalIp() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const net of interfaces[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                return net.address;
            }
        }
    }
    return 'localhost';
}

const { spawn } = require('child_process');
const CLOUDFLARED_PATH = path.join(__dirname, 'bin', 'cloudflared.exe');

function startCloudflareTunnel() {
    if (!fs.existsSync(CLOUDFLARED_PATH)) return;
    const cfProc = spawn(CLOUDFLARED_PATH, ['tunnel', '--url', `http://localhost:${PORT}`]);
    
    let logged = false;
    cfProc.stderr.on('data', data => {
        if (logged) return;
        const str = data.toString();
        const match = str.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
        if (match) {
            logged = true;
            console.log(`🌍  GLOBAL 4G/5G MOBILE URL: ${match[0]}`);
            console.log(`📌  (Cloudflare Tunnel: Fast, Secure & Zero Bad Gateway!)`);
            console.log(`==================================================\n`);
        }
    });
}

server.listen(PORT, '0.0.0.0', () => {
    const localIp = getLocalIp();
    console.log(`\n==================================================`);
    console.log(`🎙️  Spotify & YouTube Podcast Transcriber Active`);
    console.log(`⚡  Native C++ Server AI Transcription Ready`);
    console.log(`💻  Desktop PC URL: http://localhost:${PORT}`);
    console.log(`🏠  Home Wi-Fi URL: http://${localIp}:${PORT}`);
    startCloudflareTunnel();
});
