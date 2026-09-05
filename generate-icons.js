const fs = require('fs');
const path = require('path');
const sharp = require('./node_modules/sharp');

/**
 * Generates the Money Ledger brand icon SVG with exact brand colors & vectors.
 * For mobile app icons (Android adaptive maskable, standard launcher, and iOS),
 * the background gradient is full-bleed edge-to-edge so the operating system launcher
 * (Samsung One UI, Google Pixel, iOS) applies its native squircle/rounded mask cleanly
 * without any dark edges or double-corner artifacts.
 *
 * @param {number} size - Output pixel dimension
 * @param {boolean} maskable - If true, scales the central symbol into the 60% safe zone
 */
function createSvg(size, maskable = false) {
    // For maskable / mobile launcher icons, safe zone scale is ~50% of the canvas
    const scaleFactor = maskable ? 0.50 : 0.52;
    const scale = (size / 24) * scaleFactor;
    const strokeWidth = (2.5 / 24) * size;
    const center = size / 2;

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#2563eb"/>
      <stop offset="100%" style="stop-color:#7c3aed"/>
    </linearGradient>
  </defs>
  <!-- Edge-to-edge full-bleed gradient: OS launcher masks the squircle cleanly -->
  <rect width="${size}" height="${size}" fill="url(#bg)"/>
  <!-- Centered Dollar sign vector within safe zone -->
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
