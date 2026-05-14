/**
 * 브라우저에서 직접 공고 상세 페이지를 가져와 섹션을 추출
 *
 * - 원티드: Railway /api/job/parse (Wanted API, 기존 동작 확인)
 * - 사람인/잡코리아/인크루트: Vercel /api/proxy → 브라우저 DOMParser 파싱
 *   (Railway는 한국 사이트 IP 차단, Vercel 엣지는 차단 없음)
 */

function detectSite(url) {
  if (url.includes('wanted.co.kr'))   return 'wanted';
  if (url.includes('saramin.co.kr'))  return 'saramin';
  if (url.includes('jobkorea.co.kr')) return 'jobkorea';
  if (url.includes('incruit.com'))    return 'incruit';
  return 'generic';
}

/** DOM에서 공고 본문 텍스트 추출 (사이트별 셀렉터) */
function extractRawText(doc, site) {
  // 노이즈 제거
  doc.querySelectorAll('script, style, noscript, svg, iframe, nav, footer, header').forEach(el => el.remove());

  const pick = (...sels) => {
    for (const sel of sels) {
      const el = doc.querySelector(sel);
      if (el?.textContent?.trim()) return el.textContent;
    }
    return '';
  };

  switch (site) {
    case 'saramin':
      return [
        pick('.cont_duty', '.duty', '.work_condition', '[class*="duty"]'),
        pick('.cont_qualify', '.qualify', '[class*="qualify"]'),
        pick('.job_detail', '.job_info', '[class*="job_info"]'),
      ].join('\n');

    case 'jobkorea':
      return pick(
        '.recruit-detail', '.job-detail', '.content-area',
        '[class*="recruit"]', '[class*="content"]',
        'main', 'article',
      ) || doc.body?.textContent || '';

    case 'incruit':
      return pick(
        '.job_content', '.cont_duty', '[class*="job_content"]',
        'main', 'article',
      ) || doc.body?.textContent || '';

    default:
      return pick('main', 'article', '#content', '.content') || doc.body?.textContent || '';
  }
}

/** 텍스트 → 담당업무/자격요건/우대사항 섹션 분리 */
function extractSections(text) {
  const DUTY_RE  = /담당\s*업무|주요\s*업무|업무\s*내용|하는\s*일|직무\s*내용|주요\s*직무/;
  const REQ_RE   = /자격\s*요건|지원\s*자격|필수\s*사항|필수\s*요건|자격\s*조건|갖춰야\s*할/;
  const PREF_RE  = /우대\s*사항|우대\s*조건|우대\s*요건|이런\s*분을?|우대합니다/;
  const END_RE   = /복리\s*후생|근무\s*환경|혜택|채용\s*절차|지원\s*방법|전형\s*일정/;

  const lines = text.split(/[\n。]+/);
  const col = { duties: [], requirements: [], preferred: [] };
  let cur = null;

  for (const line of lines) {
    const t = line.trim();
    if (!t || t.length < 2) continue;
    if (DUTY_RE.test(t))       { cur = 'duties';       continue; }
    if (REQ_RE.test(t))        { cur = 'requirements'; continue; }
    if (PREF_RE.test(t))       { cur = 'preferred';    continue; }
    if (END_RE.test(t) && cur) { cur = null;           continue; }
    if (cur) col[cur].push(t);
  }

  return {
    duties:       col.duties.slice(0, 20).join(' ').slice(0, 1000),
    requirements: col.requirements.slice(0, 15).join(' ').slice(0, 600),
    preferred:    col.preferred.slice(0, 15).join(' ').slice(0, 600),
    industry:     '',
  };
}

/**
 * 단일 공고 상세 페이지 → 섹션 반환 (null = 실패)
 * @param {{ id, url }} job
 * @param {string} apiBase  Railway API 베이스 URL
 */
export async function fetchJobSections(job, apiBase) {
  const site = detectSite(job.url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);

  try {
    if (site === 'wanted') {
      // 원티드: Railway /api/job/parse (Wanted 공개 API — 잘 됨)
      const res = await fetch(`${apiBase}/api/job/parse?url=${encodeURIComponent(job.url)}`, {
        signal: controller.signal,
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.ok && data.sections ? data.sections : null;
    }

    // 나머지: Vercel 엣지 프록시 → DOMParser 파싱
    const res = await fetch(`/api/proxy?url=${encodeURIComponent(job.url)}`, {
      signal: controller.signal,
    });
    if (!res.ok) return null;

    const html = await res.text();
    if (!html || html.length < 200) return null;

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const rawText = extractRawText(doc, site).replace(/\s+/g, ' ').trim();
    if (rawText.length < 50) return null;

    const sections = extractSections(rawText);
    if (!sections.duties && !sections.requirements && !sections.preferred) return null;
    return sections;

  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
