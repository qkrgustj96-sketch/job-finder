import axios from 'axios';
import * as cheerio from 'cheerio';

const LOCATION_MAP = {
  seoul: '101000', gyeonggi: '102000', incheon: '103000', busan: '104000',
  gwangju: '105000', daegu: '106000', daejeon: '107000', ulsan: '108000',
  gangwon: '109000', gyeongnam: '110000', gyeongbuk: '111000', jeonnam: '112000',
  jeonbuk: '113000', chungnam: '114000', chungbuk: '115000', jeju: '116000', sejong: '117000',
};
const EMP_MAP = { regular: '1', contract: '2', intern: '3' };
const EDU_MAP = { high: '4', associate: '5', bachelor: '6', master: '7' };

// 사람인 기업형태 코드 (공공기관만 서버 필터 지원)
const COMPANY_TYPE_MAP = {
  public: '6',  // 공기업·공공기관
};

// 다중 선택 콤마 문자열 → 첫 번째 유효값 추출
function first(str) {
  if (!str) return null;
  const vals = str.split(',').map(v => v.trim()).filter(Boolean);
  return vals.length > 0 ? vals[0] : null;
}

async function fetchPage(keyword, filters, page) {
  const params = {
    searchType: 'search', searchword: keyword,
    recruitPage: page, recruitPageCount: 40,
  };

  // 지역 (단일값만 서버 필터 — 다중은 클라이언트 처리)
  const loc = first(filters.location);
  if (loc && loc !== 'all') params.loc_mcd = LOCATION_MAP[loc] || '';

  // 고용형태 (단일값)
  const empType = first(filters.employmentType);
  if (empType && empType !== 'all') params.work_type = EMP_MAP[empType] || '';

  // 경력 (첫 번째 선택값)
  const exp = first(filters.experience);
  if (exp === '0') {
    params.career_type = '1';
  } else if (exp && exp !== 'all') {
    params.career_type = '2';
    params.career_min  = exp;
  }

  // 학력 (첫 번째 선택값)
  const edu = first(filters.education);
  if (edu && edu !== 'all') params.edu_min = EDU_MAP[edu] || '';

  // 기업형태 (첫 번째 선택값)
  const compType = first(filters.companyType);
  if (compType) params.company_type = COMPANY_TYPE_MAP[compType] || '';

  const { data } = await axios.get('https://www.saramin.co.kr/zf_user/search/recruit', {
    params,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'ko-KR,ko;q=0.9',
      Referer: 'https://www.saramin.co.kr',
    },
    timeout: 12000,
  });

  const $ = cheerio.load(data);

  const totalText = $('.cnt_result strong, .total_count strong').first().text().replace(/,/g, '');
  const total = parseInt(totalText) || 0;

  const jobs = [];
  $('.item_recruit').each((_, el) => {
    const titleEl = $(el).find('a[href*="view_type=search"]').first();
    const title   = titleEl.text().trim();
    const href    = titleEl.attr('href') || '';
    const company = $(el).find('.corp_name').text().trim();
    if (!title || !company) return;

    const condition = $(el).find('.job_condition').text().replace(/\s+/g, ' ').trim();
    const location  = condition.split(' ').slice(0, 2).join(' ');
    const typeMatch = condition.match(/(정규직|계약직|인턴직|파견직|아르바이트)/);
    const type      = typeMatch ? typeMatch[1] : '정규직';

    const salaryMatch = condition.match(/([\d,]+)\s*만원/);
    const salary = salaryMatch ? parseInt(salaryMatch[1].replace(/,/g, '')) : null;

    // 업종 정보 (사람인 검색 결과에서 추출 시도)
    const industry = $(el).find('.company_sector, .sector, [class*="sector"]').first().text().trim() || '';

    const url     = href ? `https://www.saramin.co.kr${href.replace(/&amp;/g, '&')}` : '';
    const idMatch = href.match(/rec_idx=(\d+)/);
    const id      = idMatch ? `s${idMatch[1]}` : `s_${page}_${jobs.length}`;

    jobs.push({ id, site: 'saramin', title, company, location, type, salary, industry, url });
  });

  return { jobs, total };
}

export async function* scrapeSaramin(keyword, filters = {}) {
  const PER_PAGE = 40;
  let page  = 1;
  let total = Infinity;

  while ((page - 1) * PER_PAGE < Math.min(total, 600)) {
    const { jobs, total: t } = await fetchPage(keyword, filters, page);
    if (t > 0 && total === Infinity) total = t;
    if (jobs.length === 0) break;
    const seen = new Set();
    yield jobs.filter(j => seen.has(j.id) ? false : seen.add(j.id));
    page++;
  }
}
