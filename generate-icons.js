const fs = require('fs');
const path = require('path');
const sharp = require('./node_modules/sharp');

/**
 * Generates the Money Ledger brand icon SVG with exact brand colors & vectors
 * @param {number} size - Output pixel dimension
 * @param {boolean} maskable - If true, adds 18% safe padding for Android adaptive maskable icons
 */
function createSvg(size, maskable = false) {
    if (maskable) {
        // Android maskable icons require the graphic to be inside the central 80% circle
        const pad = Math.round(size * 0.12);
        const innerSize = size - pad * 2;
        const radius = Math.round(innerSize * 0.25);
        const scale = (innerSize / 24) * 0.58;
        const strokeWidth = (2.5 / 24) * innerSize;
        const center = size / 2;

        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <defs>
    <linearGradient id="bgMask" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#2563eb"/>
      <stop offset="100%" style="stop-color:#7c3aed"/>
    </linearGradient>
  </defs>
  <!-- Full background for adaptive mask trimming -->
  <rect width="${size}" height="${size}" fill="#0f172a"/>
  <!-- Rounded gradient badge within safe zone -->
  <rect x="${pad}" y="${pad}" width="${innerSize}" height="${innerSize}" rx="${radius}" ry="${radius}" fill="url(#bgMask)"/>
  <!-- Dollar sign SVG path centered -->
  <g transform="translate(${center},${center}) scale(${scale}) translate(-12,-12)">
    <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"
          fill="none"
          stroke="#ffffff"
          stroke-width="${strokeWidth / scale}"
          stroke-linecap="round"
          stroke-linejoin="round"/>
  </g>
</svg>`;
    } else {
        const radius = Math.round(size * 0.25);
        const scale = (size / 24) * 0.58;
        const strokeWidth = (2.5 / 24) * size;
        const center = size / 2;

        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#2563eb"/>
      <stop offset="100%" style="stop-color:#7c3aed"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="url(#bg)"/>
  <g transform="translate(${center},${center}) scale(${scale}) translate(-12,-12)">
    <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"
          fill="none"
          stroke="#ffffff"
          stroke-width="${strokeWidth / scale}"
          stroke-linecap="round"
          stroke-linejoin="round"/>
  </g>
</svg>`;
    }
}

async function buildIcons() {
    const assetsDir = path.join(__dirname, 'assets');
    if (!fs.existsSync(assetsDir)) {
        fs.mkdirSync(assetsDir, { recursive: true });
    }

    console.log('Generating crisp high-resolution icons...');

    // 1. Android Standard 192x192
    const svg192 = Buffer.from(createSvg(192));
    await sharp(svg192).png({ quality: 100, compressionLevel: 9 }).toFile(path.join(assetsDir, 'icon-192.png'));
    console.log('  -> assets/icon-192.png');

    // 2. Android Splash / Installation 512x512
    const svg512 = Buffer.from(createSvg(512));
    await sharp(svg512).png({ quality: 100, compressionLevel: 9 }).toFile(path.join(assetsDir, 'icon-512.png'));
    console.log('  -> assets/icon-512.png');

    // 3. Android Adaptive Maskable 512x512
    const svgMask512 = Buffer.from(createSvg(512, true));
    await sharp(svgMask512).png({ quality: 100, compressionLevel: 9 }).toFile(path.join(assetsDir, 'icon-maskable-512.png'));
    console.log('  -> assets/icon-maskable-512.png');

    // 4. Apple Touch Icon 180x180
    const svg180 = Buffer.from(createSvg(180));
    await sharp(svg180).png({ quality: 100, compressionLevel: 9 }).toFile(path.join(assetsDir, 'apple-touch-icon.png'));
    console.log('  -> assets/apple-touch-icon.png');

    console.log('All high-resolution icons generated successfully!');
}

buildIcons().catch(err => {
    console.error('Error generating icons:', err);
    process.exit(1);
});
