import axios from 'axios';
import iconv from 'iconv-lite';
import { load } from 'cheerio';

const LOCATION_MAP = {
  seoul: '1', gyeonggi: '2', incheon: '3', busan: '4', daegu: '5',
  gwangju: '6', daejeon: '7', ulsan: '8', gangwon: '9', chungbuk: '10',
  chungnam: '11', jeonbuk: '12', jeonnam: '13', gyeongbuk: '14', gyeongnam: '15',
  jeju: '16', sejong: '17',
};
const EXP_MAP = { all: '0', '0': '1', experienced: '2' };

function encodeEucKr(text) {
  const buf = iconv.encode(text, 'euc-kr');
  return [...buf].map(b => '%' + b.toString(16).toUpperCase().padStart(2, '0')).join('');
}

async function fetchPage(keyword, filters, page) {
  const kwEncoded = encodeEucKr(keyword);
  const locFirst = (filters.location || '').split(',')[0]?.trim();
  const expFirst = (filters.experience || '').split(',')[0]?.trim();
  const extra = [];
  if (locFirst && locFirst !== 'all') extra.push(`lo=${LOCATION_MAP[locFirst] || ''}`);
  if (expFirst === '0') {
    extra.push('ct=1');
  } else if (expFirst && expFirst !== 'all') {
    extra.push('ct=2', `cm=${expFirst}`);
  }
  const extraStr = extra.length ? '&' + extra.join('&') : '';

  const url = `https://search.incruit.com/list/search.asp?col=job&Page_No=${page}&kw=${kwEncoded}${extraStr}`;

  const { data } = await axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36',
      Accept: 'text/html',
      'Accept-Language': 'ko-KR,ko;q=0.9',
      Referer: 'https://www.incruit.com',
    },
    responseType: 'arraybuffer',
    maxRedirects: 5,
    timeout: 12000,
  });

  const decoded = iconv.decode(Buffer.from(data), 'euc-kr');
  const $ = load(decoded);

  // 총 결과 수 파싱
  const totalText = decoded.match(/총\s*<[^>]*>([\d,]+)</)?.[1]?.replace(/,/g, '') || '0';
  const total = parseInt(totalText) || 0;

  const jobs = [];
  $('li.c_col').each((_, el) => {
    const titleEl = $(el).find('a[href*="job.incruit.com/jobdb_info/jobpost"]').first();
    const companyEl = $(el).find('a[href*="incruit.com/company"]').first();
    const title = titleEl.text().trim();
    const company = companyEl.text().trim();
    let href = titleEl.attr('href') || '';
    if (!title || !company) return;

    href = href.split('&src=')[0];
    const text = $(el).text().replace(/\s+/g, ' ');
    const locationMatch = text.match(/(서울|경기|인천|부산|대구|광주|대전|울산|강원|충북|충남|전북|전남|경북|경남|제주|세종)/);
    const location = locationMatch ? locationMatch[0] : '';
    const typeMatch = text.match(/(정규직|계약직|인턴직|아르바이트)/);
    const type = typeMatch ? typeMatch[1] : '정규직';

    const idMatch = href.match(/job=(\d+)/);
    const id = idMatch ? `i${idMatch[1]}` : `i_${page}_${jobs.length}`;

    jobs.push({ id, site: 'incruit', title, company, location, type, salary: null, url: href });
  });

  return { jobs, total };
}

export async function* scrapeIncruit(keyword, filters = {}) {
  let page = 1;
  let total = Infinity;
  let emptyStreak = 0;

  while ((page - 1) * 30 < Math.min(total, 400)) {
    const result = await fetchPage(keyword, filters, page).catch(() => ({ jobs: [], total: 0 }));
    if (result.total > 0 && total === Infinity) total = result.total;
    if (result.jobs.length === 0) { if (++emptyStreak >= 2) break; page++; continue; }
    emptyStreak = 0;
    yield result.jobs;
    page++;
  }
}
