// Copies non-TS assets into dist/ after tsc.
// tsc only emits .js; the schema DDL and anything like it must be copied so
// the compiled apply-schema.ts can read it from dist/database/schema.sql.
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const src = path.join(root, 'src', 'database', 'schema.sql');
const destDir = path.join(root, 'dist', 'database');
const dest = path.join(destDir, 'schema.sql');

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, dest);
// eslint-disable-next-line no-console
console.log(`copied schema.sql -> ${path.relative(root, dest)}`);
