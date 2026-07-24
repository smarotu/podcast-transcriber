const https = require('https');

function fetchUrl(url, maxRedirects = 5) {
    return new Promise((resolve, reject) => {
        if (maxRedirects === 0) return reject(new Error('Too many redirects'));
        https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } }, res => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                const nextUrl = new URL(res.headers.location, url).toString();
                return fetchUrl(nextUrl, maxRedirects - 1).then(resolve).catch(reject);
            }
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ status: res.statusCode, data }));
        }).on('error', reject);
    });
}

async function searchPodcastEnhanced(query) {
    console.log(`Searching for podcast: "${query}"...`);

    // 1. Search iTunes episodes
    const epUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=podcastEpisode&limit=10`;
    const epRes = await fetchUrl(epUrl);
    let results = [];
    
    if (epRes.status === 200) {
        const data = JSON.parse(epRes.data);
        results = (data.results || []).map(r => ({
            title: r.trackName,
            show: r.collectionName,
            audioUrl: r.episodeUrl || r.previewUrl,
            artwork: r.artworkUrl100
        })).filter(r => r.audioUrl);
    }

    if (results.length > 0) return results;

    // 2. Fallback: Search iTunes shows
    console.log('No episode enclosures found in iTunes search. Searching podcast shows...');
    const showUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=podcast&limit=5`;
    const showRes = await fetchUrl(showUrl);
    
    if (showRes.status === 200) {
        const data = JSON.parse(showRes.data);
        for (const show of (data.results || [])) {
            console.log(`Checking show: "${show.collectionName}", collectionViewUrl: ${show.collectionViewUrl}`);
            // If show has feedUrl
            if (show.feedUrl) {
                try {
                    const rssRes = await fetchUrl(show.feedUrl);
                    const enclosures = rssRes.data.match(/<enclosure[^>]+url="([^"]+)"/gi) || [];
                    const titles = rssRes.data.match(/<title>([^<]+)<\/title>/gi) || [];
                    console.log(`  Found ${enclosures.length} enclosures in RSS feed!`);

                    enclosures.slice(0, 5).forEach((enc, idx) => {
                        const urlMatch = enc.match(/url="([^"]+)"/i);
                        if (urlMatch) {
                            results.push({
                                title: titles[idx + 1] ? titles[idx + 1].replace(/<\/?title>/g, '') : `${show.collectionName} Episode ${idx + 1}`,
                                show: show.collectionName,
                                audioUrl: urlMatch[1],
                                artwork: show.artworkUrl100
                            });
                        }
                    });
                } catch (e) {}
            }
        }
    }

    return results;
}

searchPodcastEnhanced('E o Resto e historia').then(res => console.log('Final results count:', res.length, res)).catch(console.error);
