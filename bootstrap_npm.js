/**
 * Bootstrap npm using only Node.js built-in modules.
 * Downloads npm from the registry, extracts it, then installs project dependencies.
 */
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { spawnSync } = require('child_process');

const NODE_EXE = process.execPath;
const INSTALL_DIR = path.join(__dirname, '.npm-bootstrap');
const NPM_CLI = path.join(INSTALL_DIR, 'package', 'bin', 'npm-cli.js');

function get(url, redirects = 0) {
    return new Promise((resolve, reject) => {
        if (redirects > 5) return reject(new Error('Too many redirects'));
        const mod = url.startsWith('https') ? https : http;
        mod.get(url, res => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                return get(res.headers.location, redirects + 1).then(resolve).catch(reject);
            }
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => resolve(Buffer.concat(chunks)));
            res.on('error', reject);
        }).on('error', reject);
    });
}

async function downloadAndExtract(tarUrl, destDir) {
    console.log(`📥 Downloading npm from registry...`);
    const tarGz = await get(tarUrl);
    fs.mkdirSync(destDir, { recursive: true });

    await new Promise((resolve, reject) => {
        const gunzip = zlib.createGunzip();
        let pos = 0;
        const buf = gunzip.pipe;

        // Pipe gunzip manually
        gunzip.on('error', reject);

        const decompressed = zlib.gunzipSync(tarGz);
        // Parse TAR manually (512-byte blocks)
        let offset = 0;
        while (offset < decompressed.length) {
            const header = decompressed.slice(offset, offset + 512);
            if (header.every(b => b === 0)) break; // end of archive

            const nameRaw = header.slice(0, 100).toString('utf8').replace(/\0/g, '');
            const sizeRaw = header.slice(124, 136).toString('utf8').replace(/\0/g, '').trim();
            const typeFlag = header[156];

            const fileSize = parseInt(sizeRaw, 8) || 0;
            offset += 512;

            if (typeFlag === 48 || typeFlag === 0) { // regular file
                const filePath = path.join(destDir, nameRaw);
                fs.mkdirSync(path.dirname(filePath), { recursive: true });
                fs.writeFileSync(filePath, decompressed.slice(offset, offset + fileSize));
            } else if (typeFlag === 53 || nameRaw.endsWith('/')) { // directory
                const dirPath = path.join(destDir, nameRaw);
                fs.mkdirSync(dirPath, { recursive: true });
            }

            offset += Math.ceil(fileSize / 512) * 512;
        }
        resolve();
    });
    console.log('✅ npm extracted successfully.');
}

async function run() {
    try {
        if (!fs.existsSync(NPM_CLI)) {
            // Get npm 10.x — compatible with Node.js 24.11.1
            console.log('🔍 Fetching npm@10 metadata...');
            const metaRaw = await get('https://registry.npmjs.org/npm/10.9.2');
            const meta = JSON.parse(metaRaw.toString());
            const tarUrl = meta.dist.tarball;
            console.log(`📦 npm version: ${meta.version}, tarball: ${tarUrl}`);
            await downloadAndExtract(tarUrl, INSTALL_DIR);
        } else {
            console.log('✅ npm already bootstrapped, skipping download.');
        }

        // Now use npm to install project dependencies
        console.log('\n📦 Installing @xenova/transformers and onnxruntime-node...');
        console.log('    (This may take a few minutes on first run)\n');

        const result = spawnSync(NODE_EXE, [
            NPM_CLI, 'install',
            '@xenova/transformers@2.17.2',
            'onnxruntime-node',
            '--save',
            '--omit=optional',     // skip sharp and other optional native addons
            '--ignore-scripts',    // skip native build scripts (onnxruntime-node uses prebuilt binaries)
            '--prefer-offline'
        ], {
            cwd: __dirname,
            stdio: 'inherit',
            env: {
                ...process.env,
                // Add node.exe to PATH so npm's child processes can find it
                PATH: `${path.dirname(NODE_EXE)};${process.env.PATH || ''}`,
                npm_config_cache: path.join(__dirname, '.npm-bootstrap', 'cache')
            }
        });

        if (result.status === 0) {
            console.log('\n🎉 Dependencies installed! You can now run: node transcribe_server.js');
        } else {
            console.error('\n❌ npm install failed with code:', result.status);
            process.exit(1);
        }
    } catch (err) {
        console.error('❌ Bootstrap error:', err.message);
        process.exit(1);
    }
}

run();
