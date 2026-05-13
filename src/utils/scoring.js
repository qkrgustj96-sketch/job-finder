/**
 * 관련도 점수 계산
 *
 * 우선순위:
 *  1. 제목 키워드 일치 (핵심)
 *  2. 사이트 내 노출 순위 보너스 (각 사이트 API 반환 순서 = 자체 인기/최신순)
 *  3. 연봉 수준 보너스 (높을수록 좋은 공고 신호)
 *  4. 동점이면 제목 길이 짧은 순
 */

/**
 * 사이트 내 순위 → 보너스
 * 키워드 매칭(최대 ~130)보다 훨씬 큰 값으로 설정해서
 * 사이트 내 순위가 실제로 최종 순서를 결정하도록 함
 */
function rankBonus(siteRank) {
  if (!siteRank || siteRank <= 0) return 0;
  if (siteRank <= 10)  return 200;
  if (siteRank <= 30)  return 160;
  if (siteRank <= 60)  return 120;
  if (siteRank <= 100) return 80;
  if (siteRank <= 150) return 40;
  if (siteRank <= 200) return 20;
  return 0;
}

/** 연봉 → 보너스 */
function salaryBonus(salary) {
  if (!salary || salary <= 0) return 0;
  if (salary >= 8000) return 15;
  if (salary >= 6000) return 12;
  if (salary >= 5000) return 9;
  if (salary >= 4000) return 6;
  if (salary >= 3000) return 3;
  return 0;
}

export function calcScore(job, keyword) {
  if (!keyword.trim()) return 0;

  const kw    = keyword.trim().toLowerCase();
  const terms = kw.split(/\s+/).filter(Boolean);
  const title = job.title.toLowerCase();
  const company = job.company.toLowerCase();

  let score = 0;

  // ── 1. 제목 전체 완전 일치 ─────────────────────────────────
  if (title === kw) {
    score += 60;
  } else if (title.includes(kw)) {
    score += 45;
    const pos = title.indexOf(kw);
    if (pos / title.length < 0.2) score += 10;
  }

  // ── 2. 제목이 키워드로 시작 (단어 경계 필수 — 뒤에 공백/구분자가 있어야)
  const afterKw = title.slice(kw.length);
  if (title.startsWith(kw) && /^[\s\/\(\[\-_·]/.test(afterKw)) score += 20;

  // ── 3. 개별 단어별 점수 ───────────────────────────────────
  let matchedTerms = 0;
  for (const term of terms) {
    if (title.includes(term)) {
      score += 25;
      matchedTerms++;
      const pos = title.indexOf(term);
      const charAfter = title[pos + term.length] || '';
      const isWordBoundary = !charAfter || /[\s\/\(\[\-_·]/.test(charAfter);
      if (pos === 0 && isWordBoundary)       score += 10;
      else if (pos / title.length < 0.3)     score += 5;
    }
  }

  // ── 4. 모든 단어 포함 보너스 ─────────────────────────────
  if (terms.length > 1 && matchedTerms === terms.length) score += 15;

  // ── 5. 회사명에 키워드 포함 (보조, 최대 8) ───────────────
  let compScore = 0;
  for (const term of terms) {
    if (company.includes(term)) compScore += 4;
  }
  score += Math.min(compScore, 8);

  // ── 6. 사이트 내 노출 순위 보너스 ────────────────────────
  score += rankBonus(job.siteRank);

  // ── 7. 연봉 보너스 ───────────────────────────────────────
  score += salaryBonus(job.salary);

  return Math.round(score);
}

export function sortByScore(jobs, keyword) {
  return [...jobs]
    .map(j => ({ ...j, score: calcScore(j, keyword) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      // 동점: 제목 짧은 순 (더 직접적인 공고)
      return a.title.length - b.title.length;
    });
}
