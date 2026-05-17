/**
 * 브라우저 기반 잡코리아 목록 스크레이퍼
 *
 * Railway(미국 IP)가 잡코리아 목록 페이지도 차단 → 상세 분석과 동일한
 * Vercel 엣지 프록시(/api/proxy)를 통해 브라우저에서 직접 수집
 */

const LOC_RE = /^(서울|경기|인천|부산|대구|광주|대전|울산|강원|충북|충남|전북|전남|경북|경남|제주|세종)/;
const SAL_RE = /연봉\s*([\d,]+)[~\-–]([\d,]+)\s*만원/;

const KO_LOC = {
  seoul: '서울', gyeonggi: '경기', incheon: '인천', busan: '부산',
  daegu: '대구', gwangju: '광주', daejeon: '대전', ulsan: '울산',
  gangwon: '강원', chungbuk: '충북', chungnam: '충남', jeonbuk: '전북',
  jeonnam: '전남', gyeongbuk: '경북', gyeongnam: '경남', jeju: '제주', sejong: '세종',
};
const KO_TYPE = { regular: '정규직', contract: '계약직', intern: '인턴' };

async function fetchPage(keyword, page) {
  const url = `https://www.jobkorea.co.kr/Search/?stext=${encodeURIComponent(keyword)}&tabType=recruit&Page_No=${page}`;
  const res = await fetch(`/api/proxy?url=${encodeURIComponent(url)}`, {
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  if (!html || html.length < 500) throw new Error('empty response');

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const jobs = [];

  for (const card of doc.querySelectorAll('div.shadow-list')) {
    if (!(card.getAttribute('class') || '').includes('hover:bg-blue54')) continue;

    let titleEl = null, companyEl = null;
    for (const a of card.querySelectorAll('a[href*="GI_Read"]')) {
      const pc = a.parentElement?.getAttribute('class') || '';
      if (pc.includes('mb-0.5')) titleEl = a;
      if (pc.includes('mb-5'))   companyEl = a;
    }
    if (!titleEl || !companyEl) continue;

    const title   = titleEl.textContent.trim();
    const company = companyEl.textContent.trim();
    const href    = titleEl.getAttribute('href') || '';
    if (!title || !company) continue;

    const jobUrl  = href.startsWith('http') ? href : `https://www.jobkorea.co.kr${href}`;
    const allText = card.textContent.replace(/\s+/g, ' ');
    const spans   = [...card.querySelectorAll('span')].map(el => el.textContent.trim()).filter(Boolean);

    const location = spans.find(s => LOC_RE.test(s)) || '';
    const typeRaw  = spans.find(s => /(정규직|계약직|인턴직|인턴|파견직)/.test(s)) || '';
    const typeM    = typeRaw.match(/(정규직|계약직|인턴직|인턴|파견직)/);
    const type     = typeM ? typeM[1] : '정규직';
    const salM     = allText.match(SAL_RE);
    const salary   = salM ? parseInt(salM[1].replace(/,/g, '')) : null;
    const idM      = href.match(/GI_Read\/(\d+)/);
    const id       = idM ? `j${idM[1]}` : `jb_${page}_${jobs.length}`;

    jobs.push({ id, site: 'jobkorea', title, company, location, type, salary, url: jobUrl });
  }

  return jobs;
}

/**
 * 잡코리아 브라우저 스크레이퍼
 * @param {string}   keyword
 * @param {object}   filters  - location, employmentType 등
 * @param {function} onJobs   - 페이지 단위로 공고 배열 콜백
 * @param {AbortSignal} signal
 */
export async function scrapeJobkoreaBrowser(keyword, filters = {}, onJobs, signal) {
  const locList  = (filters.location       || '').split(',').map(v => v.trim()).filter(Boolean).map(l => KO_LOC[l]).filter(Boolean);
  const typeList = (filters.employmentType || '').split(',').map(v => v.trim()).filter(Boolean).map(t => KO_TYPE[t]).filter(Boolean);

  let emptyStreak = 0;

  for (let page = 1; page <= 15; page++) {
    if (signal?.aborted) break;

    try {
      let jobs = await fetchPage(keyword, page);

      if (jobs.length === 0) {
        if (++emptyStreak >= 2) break;
        continue;
      }
      emptyStreak = 0;

      if (locList.length  > 0) jobs = jobs.filter(j => locList.some(ko => (j.location || '').includes(ko)));
      if (typeList.length > 0) jobs = jobs.filter(j => typeList.some(ko => (j.type     || '').includes(ko)));

      if (jobs.length > 0) onJobs(jobs);

    } catch {
      if (++emptyStreak >= 2) break;
    }
  }
}
