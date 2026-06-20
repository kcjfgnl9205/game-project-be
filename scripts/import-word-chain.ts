/**
 * 우리말샘 JSON → WordChainWord 대량 import.
 *
 * 실행 예:
 *   DATABASE_URL="mysql://nest:비번@127.0.0.1:3306/game_project" \
 *     npx tsx scripts/import-word-chain.ts ./data
 *
 * - 폴더(기본 ./data) 안의 *.json 전부를 처리한다.
 * - 파일이 커서(각 수십 MB) 통째로 안 읽고 stream-json으로 흘려보내며 처리한다.
 * - 필터: 명사 + 일반어 + 어휘 단위 + 한글 2글자 이상.
 * - 단어 단위 1행(중복은 메모리 Set + DB skipDuplicates로 제거).
 *
 * 사전 준비: 대상 DB에 WordChainWord 테이블이 있어야 함 (npx prisma db push 또는 migrate deploy).
 * 의존성: stream-json, stream-chain (devDependency)
 */
import 'dotenv/config'; // .env의 DATABASE_URL 자동 로드 (인라인으로 주면 그게 우선)
import { PrismaClient, type Prisma } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { createReadStream } from 'node:fs';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { chain } from 'stream-chain';
import { parser } from 'stream-json';
import { pick } from 'stream-json/filters/pick.js';
import { streamArray } from 'stream-json/streamers/stream-array.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error(
    'DATABASE_URL이 설정되지 않았습니다.\n' +
      '예) DATABASE_URL="mysql://nest:비번@127.0.0.1:3306/game_project" npx tsx scripts/import-word-chain.ts ./data',
  );
  process.exit(1);
}

// Prisma 7: 드라이버 어댑터로 URL 주입 (앱의 PrismaService와 동일 방식)
const prisma = new PrismaClient({ adapter: new PrismaMariaDb(databaseUrl) });

const DATA_DIR = path.resolve(process.argv[2] ?? './data');
const BATCH = 2000;
const HANGUL_2PLUS = /^[가-힣]{2,}$/; // 한글 음절만, 2글자 이상

interface Item {
  wordinfo?: { word?: string; word_unit?: string; word_type?: string };
  senseinfo?: {
    pos?: string;
    type?: string;
    definition?: string;
    example_info?: { example?: string }[];
  };
}

const seen = new Set<string>();
let scanned = 0;
let inserted = 0;
let batch: Prisma.WordChainWordCreateManyInput[] = [];

async function flush(): Promise<void> {
  if (!batch.length) return;
  const data = batch;
  batch = [];
  const res = await prisma.wordChainWord.createMany({
    data,
    skipDuplicates: true,
  });
  inserted += res.count;
}

function transform(item: Item): Prisma.WordChainWordCreateManyInput | null {
  const w = item.wordinfo;
  const s = item.senseinfo;
  if (!w?.word || !s) return null;
  if (s.pos !== '명사') return null; // 명사만
  if (s.type !== '일반어') return null; // 옛말/방언/북한어 등 제외
  if (w.word_unit !== '어휘') return null; // 속담/관용구 제외

  const word = w.word.trim();
  if (!HANGUL_2PLUS.test(word)) return null; // 자모/한자/기호/공백/한글자 제외
  if (seen.has(word)) return null; // 같은 단어 첫 뜻만
  seen.add(word);

  return {
    word,
    firstChar: word[0]!,
    lastChar: word[word.length - 1]!,
    length: word.length,
    pos: '명사',
    wordType: w.word_type ?? null,
    definition: s.definition ?? '',
    example: s.example_info?.[0]?.example ?? null,
  };
}

function processFile(file: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const pipeline = chain([
      createReadStream(file),
      parser(),
      pick({ filter: 'channel.item' }), // channel.item[] 만 흘려보냄
      streamArray(),
    ]);
    pipeline.on('data', ({ value }: { value: Item }) => {
      scanned++;
      const row = transform(value);
      if (!row) return;
      batch.push(row);
      if (batch.length >= BATCH) {
        pipeline.pause();
        flush()
          .then(() => pipeline.resume())
          .catch(reject);
      }
    });
    pipeline.on('end', () => resolve());
    pipeline.on('error', reject);
  });
}

async function main(): Promise<void> {
  const files = (await readdir(DATA_DIR))
    .filter((f) => f.endsWith('.json'))
    .sort();
  console.log(`데이터 폴더: ${DATA_DIR}`);
  console.log(`JSON 파일: ${files.length}개\n`);
  if (!files.length)
    throw new Error('JSON 파일이 없습니다. 폴더 경로를 확인하세요.');

  for (const f of files) {
    const before = inserted;
    await processFile(path.join(DATA_DIR, f));
    await flush();
    console.log(
      `  ✓ ${f} — 누적 검사 ${scanned} / 저장 ${inserted} (+${inserted - before})`,
    );
  }

  console.log(`\n완료 ✅ 검사 ${scanned}개 → 저장 ${inserted}개 (중복 제외)`);
}

main()
  .catch((e) => {
    console.error('\nimport 실패:', e);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
