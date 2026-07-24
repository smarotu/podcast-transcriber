const ytdl = require('@distube/ytdl-core');

async function testAgent() {
    const videoUrl = 'https://www.youtube.com/watch?v=XG0MEwvaauo';
    console.log('Testing ytdl with Android/iOS clients...');

    // Try getBasicInfo with different clients
    try {
        const info = await ytdl.getBasicInfo(videoUrl);
        console.log('Title:', info.videoDetails.title);
        console.log('Author:', info.videoDetails.author.name);
    } catch (e) {
        console.error('Error:', e.message);
    }
}

testAgent();
