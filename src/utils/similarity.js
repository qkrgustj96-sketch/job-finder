// 불용어 (변별력 없는 공통 단어)
const STOP = new Set([
  '및', '등', '의', '를', '을', '이', '가', '은', '는', '에', '에서', '으로', '로', '와', '과',
  '이며', '이고', '하며', '하고', '또는', '또한', '위해', '위한', '통한', '대한', '관한',
  '담당', '담당자', '업무', '관련', '경험', '경력', '신입', '채용', '모집', '지원', '우대',
  '자격', '요건', '혜택', '복리', '후생', '환경', '팀', '부서', '기업', '회사', '포함',
  '이상', '이하', '가능', '필요', '보유', '우수', '적극', '처우', '협의', '연봉', '급여',
  '입사', '근무', '재직', '성과', '분야', '역할', '기준', '해당', '아래', '다음', '전형',
  '방식', '형태', '기간', '시간', '근무지', '위치', '수행', '진행', '활용', '중심',
  '있는', '있으신', '하시는', '하신', '하실', '있으면', '하면', '하여', '하는', '하기',
  '지원자', '채용공고', '공고', '모집공고', '인재', '인원', '명',
  '주요', '세부', '상세', '기본', '필수', '우대사항', '자격요건', '주요업무',
]);

function tokenize(text) {
  return (text || '')
    .split(/[\s\n,·\/\-\(\)\[\]\{\}「」『』<>《》""''。、！？!?:;·•◆◇▶▷►✓✔★☆]+/)
    .map(t => t.trim().toLowerCase())
    .filter(t => t.length >= 2 && !STOP.has(t) && !/^\d+$/.test(t));
}

/**
 * 단어 쌍(bigram) 생성 — 연속한 두 토큰을 하나의 구로 묶음
 * "콘텐츠 기획"처럼 구 단위로 비교해야 "R&D 기획"과 구분 가능
 */
function makeBigrams(tokens) {
  const result = [];
  for (let i = 0; i < tokens.length - 1; i++) {
    result.push(`${tokens[i]} ${tokens[i + 1]}`);
  }
  return result;
}

/**
 * 텍스트 → 유니그램 + 바이그램 혼합 키워드 배열
 * 바이그램은 weight×3 (구체적이어서 변별력이 훨씬 높음)
 */
function topKeywords(text, n = 20) {
  const tokens = tokenize(text);
  const freq = new Map();
  for (const t of tokens)            freq.set(t, (freq.get(t) || 0) + 1);
  for (const bg of makeBigrams(tokens)) freq.set(bg, (freq.get(bg) || 0) + 3);

  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([token, weight]) => ({ token, weight }));
}

/**
 * haystack(공고 제목)에 keywords 중 몇 개가 매칭되는지 → 0~1
 *
 * 바이그램(구)이 1개라도 맞으면 0.5, 2개 이상 맞으면 1.0
 * 유니그램만 맞을 경우: 2개 이상 필요 (단어 하나만 맞는 건 노이즈 취급)
 */
function matchScore(haystack, keywords) {
  if (!keywords || keywords.length === 0) return 0;
  const hay = haystack.toLowerCase();

  let bigramHit = 0;
  let unigramHit = 0;

  for (const { token } of keywords) {
    if (!hay.includes(token)) continue;
    if (token.includes(' ')) bigramHit++;   // 구(2단어 이상)
    else                     unigramHit++;
  }

  // 구 매칭 우선: 구 1개 = 0.5, 2개 이상 = 1.0
  if (bigramHit >= 2) return 1.0;
  if (bigramHit === 1) return 0.5;
  // 유니그램만: 2개 이상이어야 의미 있음
  if (unigramHit >= 3) return 0.7;
  if (unigramHit === 2) return 0.35;
  return 0;  // 단어 1개만 매칭 = 점수 없음
}

/**
 * 기준 공고(parsedJob)의 섹션별 키워드 추출
 * parsedJob: { title, sections: { duties, requirements, preferred, industry } }
 * 반환: { titleKeywords, dutiesKeywords, requireKeywords, preferKeywords, industry, refTitle }
 */
export function extractRefSections(parsedJob) {
  const { title = '', sections = {} } = parsedJob;
  const { duties = '', requirements = '', preferred = '', industry = '' } = sections;

  return {
    titleKeywords:   topKeywords(title, 10),
    dutiesKeywords:  topKeywords(duties, 20),
    requireKeywords: topKeywords(requirements, 15),
    preferKeywords:  topKeywords(preferred, 15),
    industry,
    refTitle: title,
  };
}

/**
 * 100점 만점 유사도 스코어링
 *   업무내용(40) + 산업군(30) + 우대사항(15) + 자격요건(10) + 제목(5)
 *
 * 제목은 검색 풀을 모으는 데 이미 활용되었으므로 보조 점수만 부여.
 * 핵심은 실제로 하는 일(업무내용)과 같은 업계(산업군)의 일치 여부.
 *
 * @param {object} job - 스크래핑된 공고 { title, industry, ... }
 * @param {object} refSections - extractRefSections() 반환값
 */
export function calcSimilarity(job, refSections) {
  if (!refSections) return 0;

  const hay = job.title.toLowerCase();

  // 1. 업무내용 키워드가 공고 제목에 포함되는 정도 (40점)
  const dutiesPts = matchScore(hay, refSections.dutiesKeywords) * 40;

  // 2. 산업군 일치 (30점) — 스크래핑 공고의 industry 필드와 비교
  let industryPts = 0;
  if (refSections.industry && job.industry) {
    const refInd = refSections.industry.toLowerCase();
    const jobInd = job.industry.toLowerCase();
    const refSlice = refInd.slice(0, 4);
    const jobSlice = jobInd.slice(0, 4);
    if (refSlice.length >= 2 && jobInd.includes(refSlice)) industryPts = 30;
    else if (jobSlice.length >= 2 && refInd.includes(jobSlice)) industryPts = 30;
  }

  // 3. 우대사항 키워드 (15점)
  const preferPts = matchScore(hay, refSections.preferKeywords) * 15;

  // 4. 자격요건 키워드 (10점)
  const requirePts = matchScore(hay, refSections.requireKeywords) * 10;

  // 5. 제목 유사도 (5점) — 보조
  const titlePts = matchScore(hay, refSections.titleKeywords) * 5;

  return Math.min(100, Math.round(dutiesPts + industryPts + preferPts + requirePts + titlePts));
}

/**
 * 기준 공고 기준으로 jobs 재정렬 (score 100점 만점)
 */
export function sortBySimilarity(jobs, refSections) {
  return [...jobs]
    .map(j => ({ ...j, score: calcSimilarity(j, refSections) }))
    .sort((a, b) => b.score - a.score);
}

// ── 하위 호환성 ──────────────────────────────────────────────────
export function extractKeywords(title, descText) {
  const freq = new Map();
  for (const { token } of topKeywords(title, 10))    freq.set(token, (freq.get(token) || 0) + 2);
  for (const { token } of topKeywords(descText, 30)) freq.set(token, (freq.get(token) || 0) + 1);
  return [...freq.entries()].map(([token, weight]) => ({ token, weight }));
}
