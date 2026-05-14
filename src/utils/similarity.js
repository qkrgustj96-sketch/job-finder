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
  // 유니그램: 1개도 부분 점수 (제목은 짧아 키워드가 적게 나옴)
  if (unigramHit >= 3) return 0.7;
  if (unigramHit === 2) return 0.4;
  if (unigramHit === 1) return 0.15;
  return 0;
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
 * rough 유사도 (상세 fetch 전 임시 점수) — 100점 만점
 * 핵심 원칙: 업계 무관, 실제 하는 일이 비슷한지가 기준.
 *   업무내용(65) + 우대사항(20) + 자격요건(10) + 산업군(5, 보조)
 */
export function calcSimilarity(job, refSections) {
  if (!refSections) return 0;

  const hay = job.title.toLowerCase();

  // 1. 업무내용 키워드 → 공고 제목에서 확인 (65점)
  const dutiesPts = matchScore(hay, refSections.dutiesKeywords) * 65;

  // 2. 우대사항 키워드 (20점)
  const preferPts = matchScore(hay, refSections.preferKeywords) * 20;

  // 3. 자격요건 키워드 (10점)
  const requirePts = matchScore(hay, refSections.requireKeywords) * 10;

  // 4. 산업군 (5점) — 같은 업계면 소폭 가산
  let industryPts = 0;
  if (refSections.industry && job.industry) {
    const refInd = refSections.industry.toLowerCase();
    const jobInd = job.industry.toLowerCase();
    const refSlice = refInd.slice(0, 4);
    if (refSlice.length >= 2 && (jobInd.includes(refSlice) || refInd.includes(jobInd.slice(0, 4)))) {
      industryPts = 5;
    }
  }

  return Math.min(100, Math.round(dutiesPts + preferPts + requirePts + industryPts));
}

/**
 * 기준 공고 기준으로 jobs 재정렬 (score 100점 만점)
 * 이미 enriched(상세 비교 완료) 표시된 공고는 기존 score 유지
 */
export function sortBySimilarity(jobs, refSections) {
  return [...jobs]
    .map(j => ({
      ...j,
      score: j.enriched ? j.score : calcSimilarity(j, refSections),
    }))
    .sort((a, b) => {
      // 점수 기준 정렬: enriched든 아니든 높은 점수가 위
      // 단, enriched 점수와 rough 점수는 스케일이 다르므로
      // enriched 점수 ≥ 20이면 확실히 유사 → 비-enriched 앞으로
      const aStrong = a.enriched && a.score >= 20;
      const bStrong = b.enriched && b.score >= 20;
      if (aStrong && !bStrong) return -1;
      if (!aStrong && bStrong) return 1;
      return b.score - a.score;
    });
}

// ── 상세 비교 (업무내용 ↔ 업무내용 직접 텍스트 비교) ────────────

/**
 * 두 텍스트 사이의 키워드 겹침 비율 (Jaccard similarity, 0~1)
 */
function textOverlap(textA, textB) {
  const setA = new Set(tokenize(textA || ''));
  const setB = new Set(tokenize(textB || ''));
  if (setA.size === 0 || setB.size === 0) return 0;
  let overlap = 0;
  for (const t of setA) if (setB.has(t)) overlap++;
  const union = new Set([...setA, ...setB]).size;
  return union > 0 ? overlap / union : 0;
}

/**
 * 상세 내용 기반 100점 만점 유사도 — 업무내용끼리 직접 비교
 *
 * 핵심 원칙: 업계가 달라도 실제 하는 일(업무내용)이 비슷하면 높은 점수.
 * 산업군은 동점일 때 약간의 가산점 역할만 함.
 *
 *   업무내용(65) + 우대사항(20) + 자격요건(10) + 산업군(5)
 *
 * @param {object} refRaw      - 기준 공고 원본 섹션 { duties, requirements, preferred, industry }
 * @param {object} jobSections - 스크래핑 공고 파싱 섹션 { duties, requirements, preferred }
 * @param {string} jobIndustry - 스크래핑 공고의 산업군 (listing에서 가져온 값)
 * @param {string} jobTitle    - 스크래핑 공고 제목 (미사용, 서명 호환)
 * @param {string} refTitle    - 기준 공고 제목 (미사용, 서명 호환)
 */
export function calcSimilarityFull(refRaw, jobSections, jobIndustry, jobTitle = '', refTitle = '') {
  const { duties: rDuties = '', requirements: rReq = '', preferred: rPref = '', industry: rInd = '' } = refRaw || {};
  const { duties: jDuties = '', requirements: jReq = '', preferred: jPref = '' } = jobSections || {};

  // 1. 업무내용 직접 비교 (65점) — 핵심: 업계 무관하게 실제 하는 일이 비슷한지
  const dutiesScore = textOverlap(rDuties, jDuties) * 65;

  // 2. 우대사항 직접 비교 (20점) — 요구 역량이 비슷한지
  const preferScore = textOverlap(rPref, jPref) * 20;

  // 3. 자격요건 직접 비교 (10점)
  const requireScore = textOverlap(rReq, jReq) * 10;

  // 4. 산업군 (5점) — 같은 업계면 소폭 가산, 달라도 감점 없음
  let industryScore = 0;
  const rIndLow = rInd.toLowerCase();
  const jIndLow = (jobIndustry || '').toLowerCase();
  if (rIndLow && jIndLow) {
    const slice = rIndLow.slice(0, 4);
    if (slice.length >= 2 && (jIndLow.includes(slice) || rIndLow.includes(jIndLow.slice(0, 4)))) {
      industryScore = 5;
    }
  }

  return Math.min(100, Math.round(dutiesScore + preferScore + requireScore + industryScore));
}

// ── 하위 호환성 ──────────────────────────────────────────────────
export function extractKeywords(title, descText) {
  const freq = new Map();
  for (const { token } of topKeywords(title, 10))    freq.set(token, (freq.get(token) || 0) + 2);
  for (const { token } of topKeywords(descText, 30)) freq.set(token, (freq.get(token) || 0) + 1);
  return [...freq.entries()].map(([token, weight]) => ({ token, weight }));
}
