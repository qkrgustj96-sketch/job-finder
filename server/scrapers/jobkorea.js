import axios from 'axios';
import * as cheerio from 'cheerio';

// 지역명 정규식 (span에서 추출용)
const LOC_RE = /^(서울|경기|인천|부산|대구|광주|대전|울산|강원|충북|충남|전북|전남|경북|경남|제주|세종)/;
// 연봉 정규식
const SAL_RE = /연봉\s*([\d,]+)[~\-–]([\d,]+)\s*만원/;

async function fetchPage(keyword, filters, page) {
  const { data } = await axios.get('https://www.jobkorea.co.kr/Search/', {
    params: { stext: keyword, tabType: 'recruit', Page_No: page },
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'ko-KR,ko;q=0.9',
      Referer: 'https://www.jobkorea.co.kr',
    },
    timeout: 12000,
  });

  const $ = cheerio.load(data);

  // 총 결과 수 파싱
  const totalText = $('.recruit_total strong, .listCount strong, .dev_tot_cnt').first().text().replace(/[^\d]/g, '');
  const total = parseInt(totalText) || 0;

  const jobs = [];

  // 실제 공고 카드만 선택 (hover:bg-blue54 포함 — 헤더/광고 제외)
  $('div.shadow-list').each((_, card) => {
    const cls = $(card).attr('class') || '';
    if (!cls.includes('hover:bg-blue54')) return; // 실제 공고 카드가 아니면 스킵

    // 제목
    const titleEl = $(card).find('a[href*="GI_Read"]').filter((_, a) =>
      ($(a).parent().attr('class') || '').includes('mb-0.5')
    ).first();

    // 회사명
    const companyEl = $(card).find('a[href*="GI_Read"]').filter((_, a) =>
      ($(a).parent().attr('class') || '').includes('mb-5')
    ).first();

    const title = titleEl.text().trim();
    const company = companyEl.text().trim();
    const href = titleEl.attr('href') || '';
    if (!title || !company) return;

    const url = href.includes('http') ? href : `https://www.jobkorea.co.kr${href}`;

    // span 전체 텍스트 수집
    const allText = $(card).text().replace(/\s+/g, ' ');
    const spans = $(card).find('span').map((_, el) => $(el).text().trim()).get().filter(t => t.length > 0);

    // 지역: 한국 광역시/도로 시작하는 span 찾기
    const locSpan = spans.find(s => LOC_RE.test(s));
    const location = locSpan || '';

    // 고용형태
    const typeSpan = spans.find(s => /(정규직|계약직|인턴직|인턴|파견직)/.test(s));
    const typeMatch = typeSpan ? /(정규직|계약직|인턴직|인턴|파견직)/.exec(typeSpan) : null;
    const type = typeMatch ? typeMatch[1] : '정규직';

    // 연봉 (연봉 X,XXX~X,XXX만원 패턴)
    const salMatch = allText.match(SAL_RE);
    const salary = salMatch ? parseInt(salMatch[1].replace(/,/g, '')) : null;

    const idMatch = href.match(/GI_Read\/(\d+)/);
    const id = idMatch ? `j${idMatch[1]}` : `j_${page}_${jobs.length}`;

    jobs.push({ id, site: 'jobkorea', title, company, location, type, salary, url });
  });

  return { jobs, total };
}

export async function* scrapeJobkorea(keyword, filters = {}) {
  let page = 1;
  let emptyStreak = 0;

  while (page <= 15) {
    const { jobs } = await fetchPage(keyword, filters, page);
    if (jobs.length === 0) { if (++emptyStreak >= 2) break; page++; continue; }
    emptyStreak = 0;

    // 지역 필터 (다중 선택 — OR)
    let result = jobs;
    if (filters.location && filters.location !== 'all') {
      const locs = filters.location.split(',').map(v => v.trim()).filter(Boolean);
      const koLocs = locs.map(l => ({
        seoul: '서울', gyeonggi: '경기', incheon: '인천', busan: '부산',
        daegu: '대구', gwangju: '광주', daejeon: '대전', ulsan: '울산',
        gangwon: '강원', chungbuk: '충북', chungnam: '충남', jeonbuk: '전북',
        jeonnam: '전남', gyeongbuk: '경북', gyeongnam: '경남', jeju: '제주', sejong: '세종',
      }[l])).filter(Boolean);
      if (koLocs.length > 0) result = result.filter(j => koLocs.some(ko => (j.location || '').includes(ko)));
    }

    // 고용형태 필터 (다중 — OR)
    if (filters.employmentType && filters.employmentType !== 'all') {
      const types = filters.employmentType.split(',').map(v => v.trim()).filter(Boolean);
      const koTypes = types.map(t => ({ regular: '정규직', contract: '계약직', intern: '인턴' }[t])).filter(Boolean);
      if (koTypes.length > 0) result = result.filter(j => koTypes.some(ko => (j.type || '').includes(ko)));
    }

    if (result.length > 0) yield result;
    page++;
  }
}
