import { mkdir, cp, copyFile } from 'node:fs/promises';
await mkdir('dist', { recursive: true });
await copyFile('index.html', 'dist/index.html');
await cp('assets', 'dist/assets', { recursive: true });
await cp('data', 'dist/data', { recursive: true });
await copyFile('.nojekyll', 'dist/.nojekyll').catch(async () => {});
console.log('built dist/');
