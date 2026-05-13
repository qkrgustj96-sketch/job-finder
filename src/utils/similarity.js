// 채용공고 텍스트에서 의미 있는 키워드 추출
const STOP = new Set([
  // 조사/접속사
  '및', '등', '의', '를', '을', '이', '가', '은', '는', '에', '에서', '으로', '로', '와', '과',
  '이며', '이고', '하며', '하고', '또는', '또한', '위해', '위한', '통한', '대한', '관한',
  // 채용공고 공통 단어 (변별력 없음)
  '담당', '담당자', '업무', '관련', '경험', '경력', '신입', '채용', '모집', '지원', '우대',
  '자격', '요건', '혜택', '복리', '후생', '환경', '팀', '부서', '기업', '회사', '포함',
  '이상', '이하', '가능', '필요', '보유', '우수', '적극', '처우', '협의', '연봉', '급여',
  '입사', '근무', '재직', '성과', '분야', '역할', '기준', '해당', '아래', '다음', '전형',
  '방식', '형태', '기간', '시간', '근무지', '위치', '수행', '진행', '활용', '중심',
  '있는', '있으신', '하시는', '하신', '하실', '있으면', '하면', '하여', '하는', '하기',
  '지원자', '채용공고', '공고', '모집공고', '인재', '인원', '명', '아래와', '같습니다',
  '주요', '세부', '상세', '기본', '필수', '우대사항', '자격요건', '주요업무',
]);

/**
 * 텍스트에서 의미 있는 한국어/영어 토큰 추출
 * title 출처 토큰은 weight=2, description 출처는 weight=1
 */
export function extractKeywords(title, descriptionText) {
  const tokenize = (text) =>
    text
      .split(/[\s\n,·\/\-\(\)\[\]\{\}「」『』<>《》""''。、！？!?:;]+/)
      .map(t => t.trim().toLowerCase())
      .filter(t => t.length >= 2 && !STOP.has(t) && !/^\d+$/.test(t));

  const titleTokens = tokenize(title);
  const descTokens  = tokenize(descriptionText || '');

  // 빈도 계산 (title 토큰은 2배 가중)
  const freq = new Map();
  for (const t of titleTokens) freq.set(t, (freq.get(t) || 0) + 2);
  for (const t of descTokens)  freq.set(t, (freq.get(t) || 0) + 1);

  // 빈도 높은 상위 60개 반환 (너무 많으면 노이즈)
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 60)
    .map(([token, weight]) => ({ token, weight }));
}

/**
 * 기준 공고 키워드 vs 결과 공고 제목 간 유사도 점수 (0~100)
 */
export function calcSimilarity(job, referenceKeywords) {
  if (!referenceKeywords || referenceKeywords.length === 0) return 0;

  const haystack = `${job.title} ${job.company}`.toLowerCase();
  let matched = 0;
  let total   = 0;

  for (const { token, weight } of referenceKeywords) {
    total += weight;
    if (haystack.includes(token)) matched += weight;
  }

  return total > 0 ? Math.round((matched / total) * 100) : 0;
}

/**
 * 기준 공고 기준으로 jobs 재정렬
 */
export function sortBySimilarity(jobs, referenceKeywords) {
  return [...jobs]
    .map(j => ({ ...j, score: calcSimilarity(j, referenceKeywords) }))
    .sort((a, b) => b.score - a.score);
}
