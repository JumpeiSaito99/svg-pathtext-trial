/**
 * textdata.json のテキストを静的辞書＋用語置換で英語化し、textdata_en.json を保存する。
 * 使用: node scripts/translate-with-dictionary.mjs
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const inputPath = join(root, 'public', 'textdata.json');
const outputPath = join(root, 'public', 'textdata_en.json');
const dictPath = join(__dirname, 'ja-en-dictionary.json');

// 用語置換（長い順に適用するため length 降順で並べる）
const SEGMENT_RULES = [
  ['都道府県庁', 'Prefectural office'],
  ['県庁所在地', 'Prefectural capital'],
  ['振興局所在都市', 'Development bureau city'],
  ['都道府県界', 'Prefecture boundary'],
  ['振興局境界', 'Development bureau boundary'],
  ['振興局名', 'Development bureau name'],
  ['地域名', 'Region name'],
  ['都道府県', 'Prefecture'],
  ['振興局', 'Development bureau'],
  ['用水路・運河', 'Canal'],
  ['湖沼の標高と水深', 'Lake elevation and depth'],
  ['海溝最深部', 'Trench deepest point'],
  ['JR・私鉄・地下鉄駅', 'JR/private railway/subway station'],
  ['JR・私鉄駅', 'JR/private railway station'],
  ['JR・私鉄', 'JR/private railway'],
  ['鉄道トンネル', 'Railway tunnel'],
  ['道路トンネル', 'Road tunnel'],
  ['新幹線駅', 'Shinkansen station'],
  ['火山頂', 'Volcanic summit'],
  ['自然名称', 'Natural feature name'],
  ['産物絵記号', 'Product pictogram'],
  ['貴重な動植物', 'Rare flora and fauna'],
  ['天然記念物', 'Natural monument'],
  ['農林水産業', 'Agriculture, forestry and fisheries'],
  ['土地利用', 'Land use'],
  ['等高段彩塗り', 'Contour coloring'],
  ['等深段彩', 'Bathymetric coloring'],
  ['一条河川', 'First-class river'],
  ['都市文字', 'city text'],
  ['都市ルビ', 'city ruby'],
  ['(文字)', '(text)'],
  ['(ルビ)', '(ruby)'],
  ['(下線)', '(underline)'],
  ['(枠)', '(frame)'],
  ['(標高数字)', '(elevation)'],
  ['(太文字)', '(bold)'],
  ['山頂', 'Summit'],
  ['半島', 'Peninsula'],
  ['諸島', 'Archipelago'],
  ['海岸', 'Coast'],
  ['海岸線', 'Coastline'],
  ['海水系', 'Marine system'],
  ['堆(バンク)', 'Bank'],
  ['峠', 'Pass'],
  ['湖', 'Lake'],
  ['河川', 'River'],
  ['滝', 'Waterfall'],
  ['ダム', 'Dam'],
  ['堰', 'Weir'],
  ['新幹線', 'Shinkansen'],
  ['高速道路', 'Highway'],
  ['国道', 'National route'],
  ['私鉄', 'Private railway'],
  ['橋', 'Bridge'],
  ['島', 'Island'],
  ['岬', 'Cape'],
  ['浜', 'Beach'],
  ['市', 'City'],
  ['町', 'Town'],
  ['村', 'Village'],
  ['字', 'District'],
  ['地域', 'Region'],
  ['地形', 'Terrain'],
  ['水系', 'Water system'],
  ['鉄道', 'Railway'],
  ['道路', 'Road'],
  ['海上交通', 'Maritime traffic'],
  ['空港', 'Airport'],
  ['温泉', 'Hot spring'],
  ['文化', 'Culture'],
  ['工業・エネルギー', 'Industry & energy'],
  ['自然保護区域', 'Nature reserve'],
  ['自然保護対象物', 'Protected natural feature'],
  ['旧国名', 'Old province name'],
  ['国立公園', 'National park'],
  ['国定公園', 'Quasi-national park'],
  ['ジオパーク', 'Geopark'],
  ['緯経線', 'Latitude/longitude'],
  ['県界', 'Prefecture boundary'],
  ['国境', 'National border'],
  ['市街地', 'Urban area'],
  ['等高線', 'Contour line'],
  ['レリーフ', 'Relief'],
  ['海塗り', 'Sea coloring'],
  ['湖沼', 'Lake'],
  ['用水路', 'Canal'],
  ['湿地', 'Wetland'],
  ['サンゴ礁', 'Coral reef'],
  ['航路', 'Shipping route'],
  ['商港', 'Commercial port'],
  ['漁港', 'Fishing port'],
  ['灯台', 'Lighthouse'],
  ['神社', 'Shrine'],
  ['寺院', 'Temple'],
  ['世界遺産', 'World Heritage site'],
  ['史跡', 'Historic site'],
  ['城跡', 'Castle ruins'],
  ['名勝', 'Scenic spot'],
  ['古戦場', 'Historic battlefield'],
  ['鉱山', 'Mine'],
  ['原子力発電所', 'Nuclear power plant'],
  ['火力発電所', 'Thermal power plant'],
  ['水力発電所', 'Hydroelectric power plant'],
  ['地熱発電所', 'Geothermal power plant'],
  ['太陽光発電所', 'Solar power plant'],
  ['風力発電所', 'Wind power plant'],
  ['石油備蓄基地', 'Oil storage base'],
  ['ラムサール条約', 'Ramsar site'],
  ['その他', 'Other'],
  ['ルビ', 'ruby'],
  ['文字', 'text'],
].sort((a, b) => b[0].length - a[0].length);

function needsTranslation(str) {
  if (typeof str !== 'string' || str.trim() === '') return false;
  return /[^\x00-\x7F]/.test(str);
}

function translateWithSegments(str, fullDict) {
  if (fullDict[str]) return fullDict[str];
  let out = str;
  for (const [ja, en] of SEGMENT_RULES) {
    out = out.split(ja).join(en);
  }
  return out === str ? null : out;
}

function translateString(str, fullDict) {
  if (!needsTranslation(str)) return str;
  return fullDict[str] ?? translateWithSegments(str, fullDict) ?? str;
}

function applyTranslations(data, fullDict) {
  return {
    document: translateString(data.document, fullDict),
    width: data.width,
    height: data.height,
    layers: (data.layers || []).map((layer) => ({
      name: translateString(layer.name, fullDict),
      objects: (layer.objects || []).map((obj) => {
        if (obj.type === 'text') {
          return { ...obj, content: translateString(obj.content, fullDict) };
        }
        return obj;
      }),
    })),
  };
}

function main() {
  console.log('Reading', inputPath);
  const data = JSON.parse(readFileSync(inputPath, 'utf8'));
  console.log('Reading dictionary', dictPath);
  const fullDict = JSON.parse(readFileSync(dictPath, 'utf8'));

  const out = applyTranslations(data, fullDict);
  writeFileSync(outputPath, JSON.stringify(out, null, 2), 'utf8');
  console.log('Written', outputPath);
}

main();
