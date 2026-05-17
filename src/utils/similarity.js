/**
 * 유사도 계산 모듈
 *
 * 핵심 문제였던 점:
 * 1. "기획", "운영", "관리", "전략", "분석" 같은 한국어 비즈니스 범용어가
 *    모든 공고에 나와서 Jaccard 유사도를 오염시킴
 * 2. 상대적 정규화(rawScore/maxRaw*100)가 최악의 매치도 100점으로 뻥튀김
 *
 * 수정:
 * 1. STOP에 한국어 비즈니스 범용어 대폭 추가
 * 2. 절대 스케일 사용 (rawScore * 1.5, 최대 100) → 진짜 유사도만 높은 점수
 * 3. 업무내용 겹침 < 5%이면 전체 점수 크게 감점 (무관한 직군 차단)
 */

// 2차 검색 키워드 추출용 — 문법 불용어만 제거, 비즈니스 단어는 살림
const STOP_LIGHT = new Set([
  '및', '등', '의', '를', '을', '이', '가', '은', '는', '에', '에서', '으로', '로', '와', '과',
  '이며', '이고', '하며', '하고', '또는', '또한', '위해', '위한', '통한', '대한', '관한',
  '담당', '경험', '경력', '신입', '채용', '모집', '지원', '우대', '자격', '요건',
  '이상', '이하', '가능', '필요', '보유', '수행', '진행', '활용',
  '있는', '있으신', '하시는', '하신', '하실', '있으면', '하면', '하여', '하는', '하기',
  '지원자', '채용공고', '공고', '인재', '인원', '명',
  '주요', '세부', '상세', '기본', '필수',
]);

// 불용어: 변별력 없는 공통 단어 + 한국어 비즈니스 범용어
const STOP = new Set([
  // 조사/접속사
  '및', '등', '의', '를', '을', '이', '가', '은', '는', '에', '에서', '으로', '로', '와', '과',
  '이며', '이고', '하며', '하고', '또는', '또한', '위해', '위한', '통한', '대한', '관한',
  // 채용 관련 일반어
  '담당', '담당자', '업무', '관련', '경험', '경력', '신입', '채용', '모집', '지원', '우대',
  '자격', '요건', '혜택', '복리', '후생', '환경', '팀', '부서', '기업', '회사', '포함',
  '이상', '이하', '가능', '필요', '보유', '우수', '적극', '처우', '협의', '연봉', '급여',
  '입사', '근무', '재직', '성과', '분야', '역할', '기준', '해당', '아래', '다음', '전형',
  '방식', '형태', '기간', '시간', '근무지', '위치', '수행', '진행', '활용', '중심',
  '있는', '있으신', '하시는', '하신', '하실', '있으면', '하면', '하여', '하는', '하기',
  '지원자', '채용공고', '공고', '모집공고', '인재', '인원', '명',
  '주요', '세부', '상세', '기본', '필수', '우대사항', '자격요건', '주요업무',
  // ─────────────────────────────────────────────────────────
  // 핵심 추가: 한국어 비즈니스 범용어 (모든 공고에 나와서 유사도 오염)
  // 이 단어들이 없으면 퍼포먼스 마케터·정보보안·HR 모두 높은 유사도를 받게 됨
  '기획', '운영', '관리', '전략', '분석', '실행', '추진', '수립', '구축', '개선',
  '최적화', '제안', '협력', '협업', '목표', '결과', '방안', '프로세스', '시스템',
  '리포팅', '보고', '데이터', '지표', '트렌드', '인사이트',
  '커뮤니케이션', '미팅', '회의', '일정', '조율',
  '서비스', '제품', '고객', '시장', '브랜드',
  '파트너', '파트너십', '계약',
  '채널', '캠페인', '광고',
  // ─────────────────────────────────────────────────────────
  // 추가: 직군을 가리지 않고 모든 공고에 나오는 범용어
  // "개발" → 소프트웨어 개발/비즈니스 개발 양쪽에 등장 → 변별력 없음
  // "기술" → IT 기술/의료 기술/영업 기술 등 모든 분야
  '개발', '기술', '솔루션', '성장', '사업',
  '역량', '전문', '전문성', '경쟁력', '품질', '효율',
  '리드', '매니저', '담당', '팀장', '직군', '포지션',
  '지원하다', '향상', '확보', '확장', '도출', '강화',
]);

// 2차 검색어 추출용 (비즈니스 단어 살림)
function tokenizeLight(text) {
  return (text || '')
    .split(/[\s\n,·\/\-\(\)\[\]\{\}「」『』<>《》""''。、！？!?:;·•◆◇▶▷►✓✔★☆]+/)
    .map(t => t.trim().toLowerCase())
    .filter(t => t.length >= 2 && !STOP_LIGHT.has(t) && !/^\d+$/.test(t));
}

function tokenize(text) {
  return (text || '')
    .split(/[\s\n,·\/\-\(\)\[\]\{\}「」『』<>《》""''。、！？!?:;·•◆◇▶▷►✓✔★☆]+/)
    .map(t => t.trim().toLowerCase())
    .filter(t => t.length >= 2 && !STOP.has(t) && !/^\d+$/.test(t));
}

/**
 * 단어 쌍(bigram) — 연속한 두 토큰을 하나의 구로 묶음
 * STOP 제거 후 남은 특수 토큰들로만 구성 → 높은 변별력
 */
function makeBigrams(tokens) {
  const result = [];
  for (let i = 0; i < tokens.length - 1; i++) {
    result.push(`${tokens[i]} ${tokens[i + 1]}`);
  }
  return result;
}

function topKeywords(text, n = 20) {
  const tokens = tokenize(text);
  const freq = new Map();
  for (const t of tokens)               freq.set(t, (freq.get(t) || 0) + 1);
  for (const bg of makeBigrams(tokens)) freq.set(bg, (freq.get(bg) || 0) + 3);

  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([token, weight]) => ({ token, weight }));
}

/**
 * haystack(공고 제목)에 keywords 중 몇 개가 매칭되는지 → 0~1
 */
function matchScore(haystack, keywords) {
  if (!keywords || keywords.length === 0) return 0;
  const hay = haystack.toLowerCase();

  let bigramHit = 0;
  let unigramHit = 0;

  for (const { token } of keywords) {
    if (!hay.includes(token)) continue;
    if (token.includes(' ')) bigramHit++;
    else                     unigramHit++;
  }

  if (bigramHit >= 2) return 1.0;
  if (bigramHit === 1) return 0.6;
  if (unigramHit >= 3) return 0.7;
  if (unigramHit === 2) return 0.4;
  if (unigramHit === 1) return 0.15;
  return 0;
}

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
 * 후보 공고 제목 토큰 ↔ 기준 키워드 역방향 매칭
 * - 기준 공고 키워드에 없는 단어가 제목에 있어도 반대 방향 확인
 * - 저점수 구간 세분화용 보조 점수 (최대 10점)
 */
function partialTitleScore(jobTitle, refSections) {
  const titleTokens = new Set(tokenize(jobTitle));
  if (titleTokens.size === 0) return 0;

  const allRefTokens = new Set([
    ...(refSections.dutiesKeywords  || []).map(k => k.token),
    ...(refSections.requireKeywords || []).map(k => k.token),
    ...(refSections.preferKeywords  || []).map(k => k.token),
  ].filter(t => !t.includes(' '))); // 유니그램만

  let hits = 0;
  for (const t of titleTokens) if (allRefTokens.has(t)) hits++;

  // 토큰 1개 = 3점, 2개 = 6점, 3개 이상 = 10점
  if (hits >= 3) return 10;
  if (hits === 2) return 6;
  if (hits === 1) return 3;
  return 0;
}

/**
 * rough 유사도 (상세 fetch 전 임시 점수) — 공고 제목 키워드 매칭
 */
export function calcSimilarity(job, refSections) {
  if (!refSections) return 0;

  const hay = job.title.toLowerCase();

  const dutiesPts  = matchScore(hay, refSections.dutiesKeywords)  * 65;
  const preferPts  = matchScore(hay, refSections.preferKeywords)  * 20;
  const requirePts = matchScore(hay, refSections.requireKeywords) * 10;

  // 역방향 가산점 (저점수 공고 세분화 — 최대 10점)
  const partialPts = partialTitleScore(job.title, refSections);

  let industryPts = 0;
  if (refSections.industry && job.industry) {
    const refInd = refSections.industry.toLowerCase();
    const jobInd = job.industry.toLowerCase();
    const refSlice = refInd.slice(0, 4);
    if (refSlice.length >= 2 && (jobInd.includes(refSlice) || refInd.includes(jobInd.slice(0, 4)))) {
      industryPts = 5;
    }
  }

  return Math.min(100, Math.round(dutiesPts + preferPts + requirePts + industryPts + partialPts));
}

/**
 * 기준 공고 기준으로 jobs 재정렬
 * enriched 점수와 rough 점수 모두 절대 스케일 → 점수 기준 순수 정렬
 */
export function sortBySimilarity(jobs, refSections) {
  return [...jobs]
    .map(j => ({
      ...j,
      score: j.enriched ? j.score : calcSimilarity(j, refSections),
    }))
    .sort((a, b) => b.score - a.score);
}

// ── 상세 비교 ────────────────────────────────────────────────────

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
 * 상세 내용 기반 유사도 — 업무내용끼리 직접 비교
 *
 * 반환 값: 0~100 절대 점수 (정규화 없음)
 *   - 업무내용 겹침 < 5% → 무관한 직군으로 판단, 크게 감점
 *   - 절대 스케일: 진짜 유사한 공고만 높은 점수
 */
export function calcSimilarityFull(refRaw, jobSections, jobIndustry, jobTitle = '', refTitle = '') {
  const { duties: rDuties = '', requirements: rReq = '', preferred: rPref = '', industry: rInd = '' } = refRaw || {};
  const { duties: jDuties = '', requirements: jReq = '', preferred: jPref = '' } = jobSections || {};

  const dutiesOvlp  = textOverlap(rDuties, jDuties);
  const preferOvlp  = textOverlap(rPref,   jPref);
  const requireOvlp = textOverlap(rReq,    jReq);

  // 업무내용 겹침이 5% 미만 = 실질적으로 다른 직군 → 전체 점수 대폭 감점
  const dutiesPenalty = dutiesOvlp < 0.05 ? 0.3 : 1.0;

  const dutiesScore  = dutiesOvlp  * 65;
  const preferScore  = preferOvlp  * 20;
  const requireScore = requireOvlp * 10;

  let industryScore = 0;
  const rIndLow = rInd.toLowerCase();
  const jIndLow = (jobIndustry || '').toLowerCase();
  if (rIndLow && jIndLow) {
    const slice = rIndLow.slice(0, 4);
    if (slice.length >= 2 && (jIndLow.includes(slice) || rIndLow.includes(jIndLow.slice(0, 4)))) {
      industryScore = 5;
    }
  }

  const raw = (dutiesScore + preferScore + requireScore + industryScore) * dutiesPenalty;
  return Math.min(100, Math.round(raw));
}

/**
 * 기준 공고에서 2차 검색 키워드 추출
 *
 * - 1차 검색어(제목 기반)에 없는 특화 단어들을 duties/requirements에서 뽑음
 * - STOP_LIGHT (문법 불용어만) 사용 → "채널", "파트너십", "MCN" 등 살림
 * - 2개씩 묶어서 구체적인 검색어 생성
 *
 * 예) 기준: "크리에이터 콘텐츠 비즈니스 기획"
 *   1차 검색: "크리에이터 콘텐츠"
 *   2차 추출: ["IP 사업화", "유튜브 MCN"] → 추가 검색
 */
export function extractSecondaryKeywords(sections, primaryKeyword, n = 2) {
  if (!sections) return [];

  const primaryTokens = new Set(tokenizeLight(primaryKeyword));

  // duties + requirements 에서 빈도 기반 키워드 추출 (STOP_LIGHT 적용)
  const allText = [sections.duties || '', sections.requirements || ''].join(' ');
  const freq = new Map();
  for (const t of tokenizeLight(allText)) {
    if (!primaryTokens.has(t)) freq.set(t, (freq.get(t) || 0) + 1);
  }

  // 빈도순 정렬, 유니그램만 (공백 없음)
  const candidates = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([t]) => t)
    .filter(t => !t.includes(' ') && t.length >= 2)
    .slice(0, 8); // 최대 8개 후보

  // 2개씩 짝지어 검색어 생성
  const queries = [];
  for (let i = 0; i + 1 < candidates.length && queries.length < n; i += 2) {
    queries.push(`${candidates[i]} ${candidates[i + 1]}`);
  }
  return queries;
}

// ── 하위 호환성 ──────────────────────────────────────────────────
export function extractKeywords(title, descText) {
  const freq = new Map();
  for (const { token } of topKeywords(title, 10))    freq.set(token, (freq.get(token) || 0) + 2);
  for (const { token } of topKeywords(descText, 30)) freq.set(token, (freq.get(token) || 0) + 1);
  return [...freq.entries()].map(([token, weight]) => ({ token, weight }));
}
