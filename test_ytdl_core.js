const ytdl = require('@distube/ytdl-core');

async function testYtdl() {
    const videoUrl = 'https://www.youtube.com/watch?v=lHf7PEmGJ0Y';
    console.log(`Resolving YouTube URL via @distube/ytdl-core: ${videoUrl}...`);
    
    try {
        const info = await ytdl.getInfo(videoUrl);
        const title = info.videoDetails.title;
        const show = info.videoDetails.author.name;
        
        console.log('✅ Title:', title);
        console.log('✅ Channel:', show);
        
        const audioFormats = ytdl.filterFormats(info.formats, 'audioonly');
        console.log(`Found ${audioFormats.length} audioonly formats!`);
        
        if (audioFormats.length > 0) {
            console.log('✅ Direct Audio Stream URL:', audioFormats[0].url.slice(0, 120) + '...');
            return { title, show, audioUrl: audioFormats[0].url };
        }
    } catch (err) {
        console.error('ytdl error:', err.message);
    }
    return null;
}

testYtdl().then(console.log).catch(console.error);
