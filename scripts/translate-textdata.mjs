/**
 * textdata.json のテキスト（document, layer.name, object.content）を英語に翻訳し、
 * textdata_en.json として保存する。
 * 使用: node scripts/translate-textdata.mjs
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { translate } from '@vitalets/google-translate-api';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const inputPath = join(root, 'public', 'textdata.json');
const outputPath = join(root, 'public', 'textdata_en.json');

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

/** 翻訳が必要な文字列か（日本語など非ASCIIを含むか） */
function needsTranslation(str) {
  if (typeof str !== 'string' || str.trim() === '') return false;
  return /[^\x00-\x7F]/.test(str);
}

/** ユニークな文字列を収集 */
function collectStrings(data, set) {
  if (data.document) set.add(data.document);
  for (const layer of data.layers || []) {
    if (layer.name) set.add(layer.name);
    for (const obj of layer.objects || []) {
      if (obj.type === 'text' && obj.content != null) set.add(obj.content);
    }
  }
}

/** 翻訳キャッシュを適用して新しいオブジェクトを構築 */
function applyTranslations(data, cache) {
  const tr = (s) => (s != null && cache.has(s) ? cache.get(s) : s);
  return {
    document: tr(data.document),
    width: data.width,
    height: data.height,
    layers: (data.layers || []).map((layer) => ({
      name: tr(layer.name),
      objects: (layer.objects || []).map((obj) => {
        if (obj.type === 'text') {
          return { ...obj, content: tr(obj.content) };
        }
        return obj;
      }),
    })),
  };
}

async function main() {
  console.log('Reading', inputPath);
  const data = JSON.parse(readFileSync(inputPath, 'utf8'));

  const unique = new Set();
  collectStrings(data, unique);
  const toTranslate = [...unique].filter(needsTranslation);
  console.log(`Unique strings to translate: ${toTranslate.length}`);

  const cache = new Map();
  const delayMs = 200;

  for (let i = 0; i < toTranslate.length; i++) {
    const str = toTranslate[i];
    try {
      const { text } = await translate(str, { to: 'en' });
      cache.set(str, text);
      if ((i + 1) % 50 === 0) console.log(`Translated ${i + 1}/${toTranslate.length}`);
    } catch (err) {
      console.warn(`Skip translation for "${str.slice(0, 40)}...":`, err.message);
      cache.set(str, str);
    }
    await delay(delayMs);
  }

  const out = applyTranslations(data, cache);
  writeFileSync(outputPath, JSON.stringify(out, null, 2), 'utf8');
  console.log('Written', outputPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
