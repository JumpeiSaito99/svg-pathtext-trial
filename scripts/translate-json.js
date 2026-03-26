import fs from 'fs';
import { translate } from '@vitalets/google-translate-api';

const rawData = fs.readFileSync('./public/textdata.json', 'utf8');
const data = JSON.parse(rawData);

function coalesceContents() {
  let result = '';
  const layers = data.layers;
  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i];
    for (let j = 0; j < layer.objects.length; j++) {
      const object = layer.objects[j];
      if (object.type === 'text') {
        result += object.content;
        result += '\n';
      }
    }
  }
  fs.writeFileSync('./public/textdata_coalesced.txt', result);
  return result;
}

function saveTranslatedJson() {
  const texts = fs.readFileSync('./public/textdata_coalesced_en.txt', 'utf8').split('\n').map(line => line.trim());
  const layers = data.layers;
  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i];
    for (let j = 0; j < layer.objects.length; j++) {
      const object = layer.objects[j];
      if (object.type === 'text') {
        object.content = texts.shift();
      }
    }
  }
  fs.writeFileSync('./public/textdata_en.json', JSON.stringify(data, null, 2));
}

async function translateText(text) {
  const res = await translate(text, { to: 'en' });
  return res.text;
} 

async function translateJson() {
  const text = coalesceContents();
  const translatedText = await translateText(text);
  console.log(translatedText);
}

// translateJson();
// textオブジェクトのcontentを１つのファイルに連結
coalesceContents();

// Spreadsheetのシートにtextdata_coalesced.txtを貼り付け

// Spreadsheetのシートで=GOOGLETRANSLATEを使用して英訳

// 英訳した結果をtextdata_coalesced_en.txtに保存

//textdata_coalesced_en.txtをJSONファイルに変換
saveTranslatedJson();