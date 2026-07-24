// Podcast Transcriber Mobile Application Logic

// Force clear stale Service Worker caches on Android Edge & Mobile Browsers
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(registrations => {
        for (let registration of registrations) {
            registration.unregister();
        }
    });
}
if ('caches' in window) {
    caches.keys().then(names => {
        for (let name of names) caches.delete(name);
    });
}

let worker = null;
let currentAudioBuffer = null;
let currentMetadata = {
    title: 'Podcast Episode',
    show: 'Spotify Podcast',
    audioUrl: '',
    spotifyUrl: ''
};
let isTranscribing = false;
let rawTranscript = '';

// DOM Elements
const spotifyInput = document.getElementById('spotifyUrlInput');
const directUrlInput = document.getElementById('directUrlInput');
const audioFileInput = document.getElementById('audioFileInput');
const fileDropzone = document.getElementById('fileDropzone');
const modelSelect = document.getElementById('modelSelect');
const languageSelect = document.getElementById('languageSelect');
const transcribeBtn = document.getElementById('transcribeBtn');

const tabSpotify = document.getElementById('tabSpotify');
const tabDirect = document.getElementById('tabDirect');
const tabFile = document.getElementById('tabFile');

const inputSectionSpotify = document.getElementById('inputSectionSpotify');
const inputSectionDirect = document.getElementById('inputSectionDirect');
const inputSectionFile = document.getElementById('inputSectionFile');

const progressCard = document.getElementById('progressCard');
const statusTitle = document.getElementById('statusTitle');
const progressBarFill = document.getElementById('progressBarFill');
const progressText = document.getElementById('progressText');

const episodeMetaPreview = document.getElementById('episodeMetaPreview');
const previewTitle = document.getElementById('previewTitle');
const previewShow = document.getElementById('previewShow');
const audioPlayer = document.getElementById('audioPlayer');

const transcriptCard = document.getElementById('transcriptCard');
const transcriptBox = document.getElementById('transcriptBox');
const btnCopy = document.getElementById('btnCopy');
const btnDownloadTxt = document.getElementById('btnDownloadTxt');
const btnDownloadMd = document.getElementById('btnDownloadMd');
const btnShare = document.getElementById('btnShare');
const toast = document.getElementById('toast');

let activeInputType = 'spotify';

// Initialize Web Worker
function initWorker() {
    if (worker) {
        try { worker.terminate(); } catch (e) {}
        worker = null;
    }
    worker = new Worker('worker.js', { type: 'module' });
    
    worker.onmessage = (e) => {
        const data = e.data;
        handleWorkerMessage(data);
    };

    worker.onerror = (err) => {
        console.error('Worker error:', err);
        showToast('Error in WebWorker transcription');
        resetProgressState();
    };
}

// Handle Worker Messages
function handleWorkerMessage(data) {
    switch (data.status) {
        case 'init':
        case 'transcribing-start':
            statusTitle.textContent = data.message;
            break;

        case 'model-progress':
            statusTitle.textContent = `Downloading Multilingual AI Model (${data.progress}%)...`;
            progressBarFill.style.width = `${data.progress}%`;
            progressText.textContent = `Downloading ${data.file || 'model components'} (${data.progress}%)`;
            break;

        case 'model-ready':
            statusTitle.textContent = 'Whisper model loaded! Preparing transcription...';
            progressBarFill.style.width = '100%';
            progressText.textContent = 'Model ready in memory, starting audio processing...';
            break;

        case 'compiling-wasm':
            statusTitle.textContent = 'Starting transcription (this may take a few moments)...';
            progressBarFill.style.width = '100%';
            progressText.textContent = 'Whisper AI is processing your audio. Transcript will appear below shortly...';
            break;

        case 'chunk-progress':
            statusTitle.textContent = data.message || `Transcribing segment ${data.chunkIndex} of ${data.totalChunks}...`;
            progressBarFill.style.width = `${data.progress}%`;
            progressText.textContent = `Segment ${data.chunkIndex} of ${data.totalChunks} (${data.progress}%)`;
            break;

        case 'partial':
            if (data.text) {
                transcriptCard.style.display = 'block';
                transcriptBox.textContent = data.text;
                transcriptBox.scrollTop = transcriptBox.scrollHeight;
                if (data.progress) {
                    progressBarFill.style.width = `${data.progress}%`;
                }
            }
            break;

        case 'complete':
            statusTitle.textContent = 'Transcription Completed!';
            progressBarFill.style.width = '100%';
            progressText.textContent = 'Done! Ready to download or copy for Gemini.';
            transcriptCard.style.display = 'block';
            
            // Format transcript with header metadata
            const finalContent = formatTranscriptForOutput(data.text);
            transcriptBox.textContent = finalContent;
            
            isTranscribing = false;
            transcribeBtn.disabled = false;
            transcribeBtn.innerHTML = '<span>✨ Start Transcribing</span>';
            showToast('Transcription finished successfully!');
            break;

        case 'error':
            statusTitle.textContent = 'Transcription Failed';
            progressText.textContent = data.error || 'An error occurred during transcription.';
            resetProgressState();
            showToast('Error: ' + (data.error || 'Failed'));
            break;
    }
}

async function resolveYouTubeClient(url) {
    let title = 'YouTube Video';
    let show = 'YouTube Channel';

    // 1. Fetch metadata via YouTube oEmbed (CORS supported)
    try {
        const oembedRes = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
        if (oembedRes.ok) {
            const oembed = await oembedRes.json();
            title = oembed.title || title;
            show = oembed.author_name || show;
        }
    } catch (e) {}

    // 2. Try server endpoint (Render cloud or local PC server)
    try {
        const resolveRes = await fetch(`/api/resolve-youtube?url=${encodeURIComponent(url)}`);
        if (resolveRes.ok) {
            const contentType = resolveRes.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
                const data = await resolveRes.json();
                if (data.audioUrl || data.transcript) return { ...data, title: data.title || title, show: data.show || show };
            }
        }
    } catch (e) {}

    return {
        title,
        show,
        audioUrl: null,
        error: `Loaded YouTube video: "${title}" (${show}). YouTube blocks cloud datacenter IPs from direct video downloading. Please use the "🔍 Search Podcast" tab for instant 1-click episode transcription, or "📁 Upload File" tab!`
    };
}

// Toast notification helper
function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 4000);
}

// Format final transcript text for Gemini / Chatbot drop
function formatTranscriptForOutput(rawText) {
    const langLabel = languageSelect.options[languageSelect.selectedIndex].text;
    const header = `PODCAST TRANSCRIPT
Title: ${currentMetadata.title}
Show: ${currentMetadata.show}
Source: ${currentMetadata.spotifyUrl || currentMetadata.audioUrl || 'Local Audio File'}
Language: ${langLabel}
Transcribed via: WebAssembly Whisper Multilingual (${modelSelect.value})

==================================================
`;
    return header + rawText.trim();
}

// Tab Switchers
const tabYoutube = document.getElementById('tabYoutube');
const inputSectionYoutube = document.getElementById('inputSectionYoutube');
const youtubeUrlInput = document.getElementById('youtubeUrlInput');

const tabSearch = document.getElementById('tabSearch');
const inputSectionSearch = document.getElementById('inputSectionSearch');
const podcastSearchInput = document.getElementById('podcastSearchInput');
const btnDoSearch = document.getElementById('btnDoSearch');
const searchResultsList = document.getElementById('searchResultsList');

tabSpotify.addEventListener('click', () => setTab('spotify'));
if (tabYoutube) tabYoutube.addEventListener('click', () => setTab('youtube'));
if (tabSearch) tabSearch.addEventListener('click', () => setTab('search'));
tabDirect.addEventListener('click', () => setTab('direct'));
tabFile.addEventListener('click', () => setTab('file'));

function setTab(tab) {
    activeInputType = tab;
    tabSpotify.classList.toggle('active', tab === 'spotify');
    if (tabYoutube) tabYoutube.classList.toggle('active', tab === 'youtube');
    if (tabSearch) tabSearch.classList.toggle('active', tab === 'search');
    tabDirect.classList.toggle('active', tab === 'direct');
    tabFile.classList.toggle('active', tab === 'file');

    inputSectionSpotify.style.display = tab === 'spotify' ? 'block' : 'none';
    if (inputSectionYoutube) inputSectionYoutube.style.display = tab === 'youtube' ? 'block' : 'none';
    if (inputSectionSearch) inputSectionSearch.style.display = tab === 'search' ? 'block' : 'none';
    inputSectionDirect.style.display = tab === 'direct' ? 'block' : 'none';
    inputSectionFile.style.display = tab === 'file' ? 'block' : 'none';
}

if (btnDoSearch) {
    btnDoSearch.addEventListener('click', performPodcastSearch);
    podcastSearchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') performPodcastSearch();
    });
}

async function performPodcastSearch() {
    const q = podcastSearchInput.value.trim();
    if (!q) return;

    btnDoSearch.disabled = true;
    btnDoSearch.textContent = 'Searching...';
    searchResultsList.innerHTML = '<span style="font-size:0.85rem; color:var(--text-muted);">🔍 Searching podcast feeds...</span>';

    try {
        let results = [];
        
        // 1. Direct iTunes Episode Search (Works 100% on GitHub Pages static mode)
        try {
            const itunesRes = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=podcastEpisode&limit=15`);
            if (itunesRes.ok) {
                const itunesData = await itunesRes.json();
                results = (itunesData.results || []).map(r => ({
                    title: r.trackName,
                    show: r.collectionName,
                    audioUrl: r.episodeUrl || r.previewUrl,
                    artwork: r.artworkUrl100 || r.artworkUrl60
                })).filter(r => r.audioUrl);
            }
        } catch (e) {
            console.error('iTunes direct search error:', e);
        }

        // 2. If episode search is empty, search podcast shows & RSS feeds
        if (results.length === 0) {
            try {
                const showRes = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=podcast&limit=5`);
                if (showRes.ok) {
                    const showData = await showRes.json();
                    if (showData.results && showData.results.length > 0) {
                        const topShow = showData.results[0];
                        if (topShow.feedUrl) {
                            const corsRss = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(topShow.feedUrl)}`);
                            if (corsRss.ok) {
                                const xmlText = await corsRss.text();
                                const parser = new DOMParser();
                                const xmlDoc = parser.parseFromString(xmlText, "text/xml");
                                const items = xmlDoc.querySelectorAll("item");
                                items.forEach(item => {
                                    const epTitle = item.querySelector("title")?.textContent;
                                    const enclosure = item.querySelector("enclosure")?.getAttribute("url");
                                    if (epTitle && enclosure) {
                                        results.push({
                                            title: epTitle,
                                            show: topShow.collectionName || 'Podcast',
                                            audioUrl: enclosure
                                        });
                                    }
                                });
                            }
                        }
                    }
                }
            } catch (e) {}
        }

        if (results.length > 0) {
            searchResultsList.innerHTML = '';
            results.forEach((item) => {
                const div = document.createElement('div');
                div.style.cssText = 'background: rgba(255,255,255,0.05); padding: 10px; border-radius: 8px; display: flex; align-items: center; justify-content: space-between; gap: 10px;';
                div.innerHTML = `
                    <div style="overflow: hidden;">
                        <div style="font-weight: 600; font-size: 0.9rem; color: #fff; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${item.title}</div>
                        <div style="font-size: 0.78rem; color: var(--text-muted);">${item.show || 'Podcast'}</div>
                    </div>
                    <button type="button" style="background: var(--brand); color: #000; border: none; padding: 6px 12px; border-radius: 6px; font-size: 0.8rem; font-weight: 600; cursor: pointer; flex-shrink: 0;">Select & Transcribe</button>
                `;
                const selectBtn = div.querySelector('button');
                selectBtn.addEventListener('click', () => {
                    currentMetadata = {
                        title: item.title,
                        show: item.show || 'Podcast',
                        audioUrl: item.audioUrl,
                        spotifyUrl: item.audioUrl
                    };
                    previewTitle.textContent = currentMetadata.title;
                    previewShow.textContent = currentMetadata.show;
                    episodeMetaPreview.style.display = 'flex';
                    audioPlayer.src = item.audioUrl;
                    audioPlayer.style.display = 'block';
                    showToast(`Selected "${item.title}". Click "Start Transcribing"!`);
                });
                searchResultsList.appendChild(div);
            });
        } else {
            searchResultsList.innerHTML = '<span style="font-size:0.85rem; color:var(--text-muted);">No episode feeds found. Try another search term!</span>';
        }
    } catch (err) {
        console.error('Search error:', err);
        searchResultsList.innerHTML = '<span style="font-size:0.85rem; color:var(--text-muted);">Error searching podcast feeds.</span>';
    } finally {
        btnDoSearch.disabled = false;
        btnDoSearch.textContent = 'Search';
    }
}

// File Dropzone & Selection
fileDropzone.addEventListener('click', () => audioFileInput.click());
fileDropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    fileDropzone.classList.add('dragover');
});
fileDropzone.addEventListener('dragleave', () => fileDropzone.classList.remove('dragover'));
fileDropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    fileDropzone.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleFileSelect(e.dataTransfer.files[0]);
    }
});

audioFileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
        handleFileSelect(e.target.files[0]);
    }
});

function handleFileSelect(file) {
    currentMetadata = {
        title: file.name.replace(/\.[^/.]+$/, ''),
        show: 'Local Audio File',
        audioUrl: URL.createObjectURL(file),
        spotifyUrl: ''
    };
    
    previewTitle.textContent = currentMetadata.title;
    previewShow.textContent = `File Size: ${(file.size / (1024 * 1024)).toFixed(1)} MB`;
    episodeMetaPreview.style.display = 'flex';
    audioPlayer.src = currentMetadata.audioUrl;
    audioPlayer.style.display = 'block';
    
    fileDropzone.querySelector('.drop-text').textContent = `Selected: ${file.name}`;
}

// Resample audio array buffer to 16kHz mono Float32Array
async function decodeAudioTo16kHz(audioArrayBuffer) {
    statusTitle.textContent = 'Decoding audio into 16kHz PCM (takes ~5-10s)...';
    const audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    const decodedBuffer = await audioContext.decodeAudioData(audioArrayBuffer);
    
    const numberOfChannels = decodedBuffer.numberOfChannels;
    const length = decodedBuffer.length;
    const monoSamples = new Float32Array(length);

    if (numberOfChannels === 1) {
        monoSamples.set(decodedBuffer.getChannelData(0));
    } else {
        const left = decodedBuffer.getChannelData(0);
        const right = decodedBuffer.getChannelData(1);
        for (let i = 0; i < length; i++) {
            monoSamples[i] = (left[i] + right[i]) / 2;
        }
    }
    
    audioContext.close();
    return monoSamples;
}

// Start Transcription Process
transcribeBtn.addEventListener('click', async () => {
    if (isTranscribing) return;
    
    initWorker();
    resetProgressState();
    progressCard.style.display = 'block';
    statusTitle.textContent = 'Preparing audio...';
    progressBarFill.style.width = '10%';
    
    let audioUrlToFetch = '';
    
    try {
        if (activeInputType === 'youtube' || (activeInputType === 'spotify' && (spotifyInput.value.includes('youtube.com') || spotifyInput.value.includes('youtu.be')))) {
            const url = (activeInputType === 'youtube' ? youtubeUrlInput.value : spotifyInput.value).trim();
            if (!url) {
                showToast('Please enter a YouTube video URL');
                progressCard.style.display = 'none';
                return;
            }

            const ytMatch = url.match(/(?:v=|\/shorts\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
            const videoId = ytMatch ? ytMatch[1] : null;

            if (videoId) {
                const youtubePlayerContainer = document.getElementById('youtubePlayerContainer');
                const youtubeIframe = document.getElementById('youtubeIframe');
                if (youtubePlayerContainer && youtubeIframe) {
                    youtubeIframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=1&enablejsapi=1`;
                    youtubePlayerContainer.style.display = 'block';
                }
            }

            statusTitle.textContent = 'Resolving YouTube audio metadata & playing video in-app...';
            const resolveData = await resolveYouTubeClient(url);

            currentMetadata = {
                title: resolveData.title || 'YouTube Video',
                show: resolveData.show || 'YouTube Channel',
                audioUrl: resolveData.audioUrl || '',
                spotifyUrl: url
            };

            previewTitle.textContent = currentMetadata.title;
            previewShow.textContent = currentMetadata.show;
            episodeMetaPreview.style.display = 'flex';

            if (resolveData.transcript) {
                rawTranscript = resolveData.transcript;
                outputArea.value = formatTranscriptForOutput(rawTranscript);
                outputCard.style.display = 'block';
                outputCard.scrollIntoView({ behavior: 'smooth' });
                showToast('✨ Instant YouTube Captions Loaded!');
                saveToLibrary(currentMetadata.title, currentMetadata.show, rawTranscript, url);
                progressCard.style.display = 'none';
                return;
            }

            if (resolveData.error || !resolveData.audioUrl) {
                throw new Error(resolveData.error || 'Could not extract audio stream from this YouTube link on static mode. Please upload the audio file or paste direct MP3 link!');
            }

            audioUrlToFetch = currentMetadata.audioUrl.startsWith('/api/') ? currentMetadata.audioUrl : `/api/proxy-audio?url=${encodeURIComponent(currentMetadata.audioUrl)}`;
            audioPlayer.src = audioUrlToFetch;
            audioPlayer.style.display = 'block';

        } else if (activeInputType === 'spotify') {
            const url = spotifyInput.value.trim();
            if (!url) {
                showToast('Please enter a Spotify episode URL');
                progressCard.style.display = 'none';
                return;
            }
            
            statusTitle.textContent = 'Resolving Spotify Podcast metadata...';
            const resolveRes = await fetch(`/api/resolve-spotify?url=${encodeURIComponent(url)}`);
            const resolveData = await resolveRes.json();
            
            if (resolveData.error || !resolveData.audioUrl || !resolveData.resolved) {
                throw new Error('Could not auto-resolve direct MP3 audio feed from this Spotify URL. Please switch to "Audio Link" tab to paste the direct MP3 link, or "Upload File" tab!');
            }
            
            currentMetadata = {
                title: resolveData.title,
                show: resolveData.show,
                audioUrl: resolveData.audioUrl,
                spotifyUrl: url
            };
            
            previewTitle.textContent = currentMetadata.title;
            previewShow.textContent = currentMetadata.show;
            episodeMetaPreview.style.display = 'flex';
            
            audioUrlToFetch = `/api/proxy-audio?url=${encodeURIComponent(currentMetadata.audioUrl)}`;
            audioPlayer.src = audioUrlToFetch;
            audioPlayer.style.display = 'block';

        } else if (activeInputType === 'direct') {
            const url = directUrlInput.value.trim();
            if (!url) {
                showToast('Please enter a direct audio stream URL');
                progressCard.style.display = 'none';
                return;
            }
            currentMetadata = {
                title: 'Podcast Episode Stream',
                show: 'Direct Link',
                audioUrl: url,
                spotifyUrl: ''
            };
            audioUrlToFetch = `/api/proxy-audio?url=${encodeURIComponent(url)}`;
            audioPlayer.src = audioUrlToFetch;
            audioPlayer.style.display = 'block';

        } else if (activeInputType === 'file') {
            if (!audioFileInput.files || !audioFileInput.files[0]) {
                showToast('Please select an audio file from your device');
                progressCard.style.display = 'none';
                return;
            }
            const file = audioFileInput.files[0];
            const arrayBuffer = await file.arrayBuffer();
            const float32Samples = await decodeAudioTo16kHz(arrayBuffer);
            
            startWorkerTranscription(float32Samples);
            return;
        }

        // Fetch remote audio stream via server proxy
        statusTitle.textContent = 'Downloading 1h 23m podcast audio stream...';
        const response = await fetch(audioUrlToFetch);
        if (!response.ok) throw new Error(`HTTP error downloading audio: ${response.status}`);
        
        const arrayBuffer = await response.arrayBuffer();
        progressBarFill.style.width = '30%';
        
        const float32Samples = await decodeAudioTo16kHz(arrayBuffer);
        startServerTranscription(float32Samples);

    } catch (err) {
        console.error('Transcription start error:', err);
        statusTitle.textContent = 'Error Processing Audio';
        progressText.textContent = err.message;
        resetProgressState();
        showToast(err.message);
    }
});

function formatTime(totalSeconds) {
    const m = Math.floor((totalSeconds || 0) / 60).toString().padStart(2, '0');
    const s = Math.floor((totalSeconds || 0) % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

async function startServerTranscription(float32AudioBuffer) {
    isTranscribing = true;
    transcribeBtn.disabled = true;
    transcribeBtn.innerHTML = '<span>⚡ Transcribing (Fast Server AI)...</span>';

    const SAMPLE_RATE = 16000;
    const CHUNK_SEC = 30;
    const CHUNK_SAMPLES = SAMPLE_RATE * CHUNK_SEC;
    const totalSamples = float32AudioBuffer.length;
    const totalChunks = Math.ceil(totalSamples / CHUNK_SAMPLES);
    const totalDurationSec = Math.round(totalSamples / SAMPLE_RATE);

    progressCard.style.display = 'block';
    statusTitle.textContent = `⚡ Fast Server AI Transcribing...`;
    progressText.textContent = `Processing ${formatTime(totalDurationSec)} of audio in ${totalChunks} segments...`;
    progressBarFill.style.width = '0%';
    transcriptBox.textContent = '';
    rawTranscript = '';

    let fullText = '';
    const modelName = modelSelect.value;
    const language = languageSelect.value;

    for (let i = 0; i < totalChunks; i++) {
        if (!isTranscribing) break;

        const startSample = i * CHUNK_SAMPLES;
        const endSample = Math.min(startSample + CHUNK_SAMPLES, totalSamples);
        const chunk = float32AudioBuffer.subarray(startSample, endSample);

        const startSec = Math.floor(startSample / SAMPLE_RATE);
        const endSec = Math.floor(endSample / SAMPLE_RATE);
        const pct = Math.round(((i + 1) / totalChunks) * 100);

        statusTitle.textContent = `⚡ Segment ${i + 1} of ${totalChunks} — [${formatTime(startSec)} → ${formatTime(endSec)}]`;
        progressText.textContent = `Native C++ ONNX engine processing segment ${i + 1}/${totalChunks}... (${pct}%)`;
        progressBarFill.style.width = `${pct}%`;

        try {
            const res = await fetch('/api/transcribe-chunk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    modelName,
                    language,
                    pcm: Array.from(chunk),
                    startSec,
                    endSec,
                    chunkIndex: i,
                    totalChunks
                })
            });

            if (!res.ok) {
                console.warn('Server AI endpoint unavailable. Switching to browser WebAssembly WASM AI...');
                startWorkerTranscription(float32AudioBuffer);
                return;
            }

            const data = await res.json();

            if (data.status === 'success' && data.text) {
                if (fullText) fullText += '\n\n';
                fullText += `[${formatTime(startSec)} - ${formatTime(endSec)}] ${data.text}`;
                
                rawTranscript = fullText;
                transcriptBox.textContent = fullText;
                transcriptBox.scrollTop = transcriptBox.scrollHeight;
                transcriptCard.style.display = 'block';

                // Save progress to library continuously
                saveCurrentToHistory(false);
            }
        } catch (err) {
            console.error(`Chunk ${i + 1} server error:`, err);
        }
    }

    statusTitle.textContent = '🎉 Transcription Complete!';
    progressText.textContent = `Successfully transcribed ${totalChunks} segments of podcast audio.`;
    progressBarFill.style.width = '100%';

    // Mark as finished in history library
    saveCurrentToHistory(true);
    resetProgressState();
}

function resetProgressState() {
    isTranscribing = false;
    transcribeBtn.disabled = false;
    transcribeBtn.innerHTML = '<span>✨ Start Transcribing</span>';
}

// Copy to Clipboard (1-Tap for Gemini)
btnCopy.addEventListener('click', () => {
    const text = transcriptBox.textContent;
    if (!text) return;
    
    navigator.clipboard.writeText(text).then(() => {
        showToast('📋 Transcript copied! Ready to paste into Gemini.');
    }).catch(err => {
        showToast('Failed to copy to clipboard');
    });
});

// Download Plain Text (.txt) file for Gemini / Chatbots
btnDownloadTxt.addEventListener('click', () => {
    const text = transcriptBox.textContent;
    if (!text) return;
    
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const filename = `${currentMetadata.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_transcript.txt`;
    
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
    
    showToast('📄 Downloaded .txt file!');
});

// Download Markdown (.md)
btnDownloadMd.addEventListener('click', () => {
    const text = transcriptBox.textContent;
    if (!text) return;
    
    const mdContent = `# ${currentMetadata.title}\n**Show:** ${currentMetadata.show}\n\n---\n\n${text}`;
    const blob = new Blob([mdContent], { type: 'text/markdown;charset=utf-8' });
    const filename = `${currentMetadata.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_transcript.md`;
    
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
    
    showToast('📝 Downloaded .md file!');
});

// Native Android Web Share API
btnShare.addEventListener('click', async () => {
    const text = transcriptBox.textContent;
    if (!text) return;
    
    if (navigator.share) {
        try {
            await navigator.share({
                title: currentMetadata.title,
                text: text
            });
            showToast('Shared successfully!');
        } catch (err) {
            console.log('Share canceled or failed:', err);
        }
    } else {
        btnCopy.click();
    }
});

// Service Worker disabled — causes network fetch conflicts with WASM worker
// Unregister any previously installed SW
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(regs => {
        for (const reg of regs) reg.unregister();
    });
}

// --- Saved Transcripts History Library Management ---
let savedTranscripts = [];

const historyList = document.getElementById('historyList');
const historyCount = document.getElementById('historyCount');
const btnClearHistory = document.getElementById('btnClearHistory');

if (btnClearHistory) {
    btnClearHistory.addEventListener('click', () => {
        if (confirm('Are you sure you want to delete all saved transcripts?')) {
            savedTranscripts = [];
            localStorage.removeItem('podscribe_history');
            renderHistory();
            showToast('Cleared all saved transcripts.');
        }
    });
}

function loadHistory() {
    try {
        const stored = localStorage.getItem('podscribe_history');
        if (stored) {
            savedTranscripts = JSON.parse(stored);
        }
    } catch (e) {
        savedTranscripts = [];
    }
    renderHistory();
}

function saveCurrentToHistory(isFinished = false) {
    if (!currentMetadata.title || !rawTranscript) return;

    const id = currentMetadata.spotifyUrl || currentMetadata.audioUrl || currentMetadata.title;
    const now = new Date().toLocaleString();
    const wordCount = rawTranscript.split(/\s+/).filter(Boolean).length;

    const existingIdx = savedTranscripts.findIndex(item => item.id === id);

    const record = {
        id,
        title: currentMetadata.title,
        show: currentMetadata.show || 'Podcast',
        date: existingIdx >= 0 ? savedTranscripts[existingIdx].date : now,
        lastUpdated: now,
        text: rawTranscript,
        wordCount,
        isFinished
    };

    if (existingIdx >= 0) {
        savedTranscripts[existingIdx] = record;
    } else {
        savedTranscripts.unshift(record); // newest first
    }

    try {
        localStorage.setItem('podscribe_history', JSON.stringify(savedTranscripts));
    } catch (e) {
        console.error('Failed to save to localStorage:', e);
    }
    renderHistory();
}

function deleteHistoryItem(id) {
    savedTranscripts = savedTranscripts.filter(item => item.id !== id);
    try {
        localStorage.setItem('podscribe_history', JSON.stringify(savedTranscripts));
    } catch (e) {}
    renderHistory();
    showToast('Deleted transcript from library.');
}

function renderHistory() {
    if (!historyList) return;
    if (historyCount) historyCount.textContent = savedTranscripts.length;
    if (btnClearHistory) btnClearHistory.style.display = savedTranscripts.length > 0 ? 'block' : 'none';

    if (savedTranscripts.length === 0) {
        historyList.innerHTML = `
            <div style="font-size: 0.85rem; color: var(--text-muted); text-align: center; padding: 20px 0;">
                No saved transcripts yet. Transcribe an episode and it will be saved here automatically!
            </div>
        `;
        return;
    }

    historyList.innerHTML = '';
    savedTranscripts.forEach(item => {
        const div = document.createElement('div');
        div.style.cssText = 'background: rgba(255, 255, 255, 0.04); border: 1px solid var(--border-color); border-radius: 12px; padding: 14px; display: flex; flex-direction: column; gap: 8px; transition: border-color 0.2s;';
        
        div.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px;">
                <div style="overflow: hidden;">
                    <div style="font-weight: 600; font-size: 0.95rem; color: #fff; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${item.title}</div>
                    <div style="font-size: 0.82rem; color: var(--text-muted); margin-top: 2px;">${item.show} • <span style="color: #a7f3d0;">${item.wordCount} words</span> • ${item.date}</div>
                </div>
                <span style="font-size: 0.72rem; padding: 2px 8px; border-radius: 12px; background: ${item.isFinished ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)'}; color: ${item.isFinished ? '#10b981' : '#f59e0b'}; flex-shrink: 0;">
                    ${item.isFinished ? 'Completed' : 'In Progress'}
                </span>
            </div>
            <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 4px;">
                <button type="button" class="btn-view" style="background: rgba(255,255,255,0.08); color: #fff; border: none; padding: 6px 12px; border-radius: 6px; font-size: 0.78rem; font-weight: 600; cursor: pointer;">📖 View</button>
                <button type="button" class="btn-copy-item" style="background: rgba(255,255,255,0.08); color: #fff; border: none; padding: 6px 12px; border-radius: 6px; font-size: 0.78rem; font-weight: 600; cursor: pointer;">📋 Copy</button>
                <button type="button" class="btn-download-item" style="background: rgba(255,255,255,0.08); color: #fff; border: none; padding: 6px 12px; border-radius: 6px; font-size: 0.78rem; font-weight: 600; cursor: pointer;">📄 Download .txt</button>
                <button type="button" class="btn-delete-item" style="background: rgba(239, 68, 68, 0.15); color: #f87171; border: none; padding: 6px 12px; border-radius: 6px; font-size: 0.78rem; font-weight: 600; cursor: pointer; margin-left: auto;">🗑️ Delete</button>
            </div>
        `;

        div.querySelector('.btn-view').addEventListener('click', () => {
            currentMetadata = { title: item.title, show: item.show, audioUrl: item.id, spotifyUrl: '' };
            rawTranscript = item.text;
            transcriptBox.textContent = item.text;
            transcriptCard.style.display = 'block';
            transcriptCard.scrollIntoView({ behavior: 'smooth' });
            showToast(`Loaded: "${item.title}"`);
        });

        div.querySelector('.btn-copy-item').addEventListener('click', () => {
            navigator.clipboard.writeText(item.text).then(() => {
                showToast(`📋 Copied transcript for "${item.title}"!`);
            });
        });

        div.querySelector('.btn-download-item').addEventListener('click', () => {
            const blob = new Blob([item.text], { type: 'text/plain;charset=utf-8' });
            const filename = `${item.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_transcript.txt`;
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = filename;
            a.click();
            URL.revokeObjectURL(a.href);
            showToast('📄 Downloaded .txt file!');
        });

        div.querySelector('.btn-delete-item').addEventListener('click', () => {
            deleteHistoryItem(item.id);
        });

        historyList.appendChild(div);
    });
}

// Initial load
loadHistory();
