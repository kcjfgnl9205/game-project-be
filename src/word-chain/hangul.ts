// 두음법칙: 직전 단어의 끝 글자로 시작해야 하지만, 한자음 첫소리 ㄹ/ㄴ은 변환을 허용한다.
// 예) 락 → 락 또는 낙,  녀 → 녀 또는 여,  력 → 력 또는 역.
// 끝 글자(lastChar)를 받아 "다음 단어가 시작할 수 있는 글자 후보"를 돌려준다.

const BASE = 0xac00;
const LAST = 0xd7a3;
// 중성 인덱스: ㅑ(2) ㅕ(6) ㅖ(7) ㅛ(12) ㅠ(17) ㅣ(20) — 이 경우 ㄹ/ㄴ → ㅇ
const YOTIZED = new Set([2, 6, 7, 12, 17, 20]);
const CHO_R = 5; // ㄹ
const CHO_N = 2; // ㄴ
const CHO_O = 11; // ㅇ

function compose(cho: number, jung: number, jong: number): string {
  return String.fromCharCode(BASE + (cho * 21 + jung) * 28 + jong);
}

/** 끝 글자로 시작 가능한 글자 후보(원래 글자 + 두음 변환). 한글이 아니면 그 글자만. */
export function allowedStarts(lastChar: string): string[] {
  const code = lastChar.charCodeAt(0);
  if (code < BASE || code > LAST) return [lastChar];
  const offset = code - BASE;
  const cho = Math.floor(offset / (21 * 28));
  const jung = Math.floor((offset % (21 * 28)) / 28);
  const jong = offset % 28;

  const set = new Set<string>([lastChar]);
  if (cho === CHO_R) {
    set.add(compose(YOTIZED.has(jung) ? CHO_O : CHO_N, jung, jong)); // 락→낙, 력→역
  } else if (cho === CHO_N && YOTIZED.has(jung)) {
    set.add(compose(CHO_O, jung, jong)); // 녀→여, 뇨→요
  }
  return [...set];
}

/** 한글 음절 2글자 이상인지 (제출 단어 기본 형식 검사). */
export function isValidHangulWord(word: string): boolean {
  return /^[가-힣]{2,}$/.test(word);
}
