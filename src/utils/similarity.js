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

/** 텍스트 → 빈도 상위 N개 토큰 배열 */
function topKeywords(text, n = 15) {
  const tokens = tokenize(text);
  const freq = new Map();
  for (const t of tokens) freq.set(t, (freq.get(t) || 0) + 1);
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([token, weight]) => ({ token, weight }));
}

/**
 * haystack(공고 제목)에 keywords 중 몇 개가 매칭되는지 → 0~1
 * - 1개 매칭: 0.33, 2개: 0.67, 3개 이상: 1.0
 */
function matchScore(haystack, keywords) {
  if (!keywords || keywords.length === 0) return 0;
  const hay = haystack.toLowerCase();
  let count = 0;
  for (const { token } of keywords) {
    if (hay.includes(token)) count++;
  }
  return Math.min(1, count / Math.max(1, Math.min(3, keywords.length)));
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
 *   제목(40) + 업무내용(30) + 산업군(15) + 우대사항(10) + 자격요건(5)
 *
 * @param {object} job - 스크래핑된 공고 { title, industry, ... }
 * @param {object} refSections - extractRefSections() 반환값
 */
export function calcSimilarity(job, refSections) {
  if (!refSections) return 0;

  const hay = job.title.toLowerCase();

  // 1. 제목 유사도 (40점)
  const titlePts = matchScore(hay, refSections.titleKeywords) * 40;

  // 2. 업무내용 키워드가 공고 제목에 포함되는 정도 (30점)
  const dutiesPts = matchScore(hay, refSections.dutiesKeywords) * 30;

  // 3. 산업군 일치 (15점) — 스크래핑 공고의 industry 필드와 비교
  let industryPts = 0;
  if (refSections.industry && job.industry) {
    const refInd = refSections.industry.toLowerCase();
    const jobInd = job.industry.toLowerCase();
    // 앞 3글자 이상 공통 부분이 있으면 동일 산업군으로 판단
    const refSlice = refInd.slice(0, 4);
    if (refSlice.length >= 2 && jobInd.includes(refSlice)) industryPts = 15;
    else if (jobInd.slice(0, 4).length >= 2 && refInd.includes(jobInd.slice(0, 4))) industryPts = 15;
  }

  // 4. 우대사항 키워드 (10점)
  const preferPts = matchScore(hay, refSections.preferKeywords) * 10;

  // 5. 자격요건 키워드 (5점)
  const requirePts = matchScore(hay, refSections.requireKeywords) * 5;

  return Math.min(100, Math.round(titlePts + dutiesPts + industryPts + preferPts + requirePts));
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
