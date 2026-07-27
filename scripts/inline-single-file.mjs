import { readFile, writeFile } from 'node:fs/promises';

const outputPath = new URL('../dist/index.html', import.meta.url);
let html = await readFile(outputPath, 'utf8');

const assets = [
  ['welcome.gif', 'image/gif'],
  ['donate-qr.jpg', 'image/jpeg'],
];

for (const [fileName, mimeType] of assets) {
  const assetPath = new URL(`../public/${fileName}`, import.meta.url);
  const data = await readFile(assetPath);
  const dataUri = `data:${mimeType};base64,${data.toString('base64')}`;
  html = html.split(`./${fileName}`).join(dataUri);
}

// A standalone file does not need a manifest request. The deployed PWA keeps
// the manifest in dist/ through the normal Pages workflow.
html = html.replace(/\s*<link rel="manifest" href="\.\/manifest\.webmanifest"\s*\/>/, '');

await writeFile(outputPath, html, 'utf8');
console.log(`Inlined standalone media into ${outputPath.pathname}`);
