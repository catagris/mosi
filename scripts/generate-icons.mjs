/**
 * Generate the PWA icon PNGs without any image dependencies:
 * a violet tile with a white "balloon" circle + amber confetti dot.
 * Run once via `node scripts/generate-icons.mjs` (outputs to static/icons).
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'static', 'icons');

const CRC_TABLE = new Int32Array(256).map((_, n) => {
	let c = n;
	for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
	return c;
});

function crc32(buf) {
	let crc = -1;
	for (const byte of buf) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
	return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
	const len = Buffer.alloc(4);
	len.writeUInt32BE(data.length);
	const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(body));
	return Buffer.concat([len, body, crc]);
}

function makePng(size) {
	const bg = [124, 58, 237]; // violet-600
	const circle = [255, 255, 255];
	const dot = [245, 158, 11]; // amber-500

	const cx = size / 2;
	const cy = size / 2;
	const r = size * 0.3;
	const dotCx = size * 0.72;
	const dotCy = size * 0.26;
	const dotR = size * 0.09;

	const raw = Buffer.alloc(size * (1 + size * 3));
	for (let y = 0; y < size; y++) {
		const rowStart = y * (1 + size * 3);
		raw[rowStart] = 0; // filter: none
		for (let x = 0; x < size; x++) {
			const inCircle = (x - cx) ** 2 + (y - cy) ** 2 <= r ** 2;
			const inDot = (x - dotCx) ** 2 + (y - dotCy) ** 2 <= dotR ** 2;
			const [pr, pg, pb] = inDot ? dot : inCircle ? circle : bg;
			const px = rowStart + 1 + x * 3;
			raw[px] = pr;
			raw[px + 1] = pg;
			raw[px + 2] = pb;
		}
	}

	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(size, 0);
	ihdr.writeUInt32BE(size, 4);
	ihdr[8] = 8; // bit depth
	ihdr[9] = 2; // color type: truecolor
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk('IHDR', ihdr),
		chunk('IDAT', deflateSync(raw, { level: 9 })),
		chunk('IEND', Buffer.alloc(0))
	]);
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, 'icon-192.png'), makePng(192));
writeFileSync(join(OUT_DIR, 'icon-512.png'), makePng(512));
writeFileSync(join(OUT_DIR, 'apple-touch-icon.png'), makePng(180));
console.log('Icons written to static/icons/');
