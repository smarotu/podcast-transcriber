const localtunnel = require('localtunnel');

(async () => {
    try {
        console.log('Connecting to localtunnel server...');
        const tunnel = await localtunnel({ port: 3000 });
        console.log(`\n==================================================`);
        console.log(`🌍  GLOBAL 4G/5G MOBILE URL: ${tunnel.url}`);
        console.log(`==================================================\n`);

        tunnel.on('close', () => {
            console.log('Tunnel closed');
        });
    } catch (e) {
        console.error('Tunnel error:', e.message);
    }
})();
