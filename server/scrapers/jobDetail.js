import axios from 'axios';
import * as cheerio from 'cheerio';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36',
  'Accept-Language': 'ko-KR,ko;q=0.9',
};

function detectSite(url) {
  if (url.includes('wanted.co.kr'))   return 'wanted';
  if (url.includes('saramin.co.kr'))  return 'saramin';
  if (url.includes('jobkorea.co.kr')) return 'jobkorea';
  if (url.includes('incruit.com'))    return 'incruit';
  return 'generic';
}

// ── 원티드 ───────────────────────────────────────────────────
async function parseWanted(url) {
  const idMatch = url.match(/\/wd\/(\d+)/);
  if (!idMatch) throw new Error('원티드 URL 형식이 맞지 않습니다 (/wd/숫자)');
  const { data } = await axios.get(`https://www.wanted.co.kr/api/v4/jobs/${idMatch[1]}`, {
    headers: { ...HEADERS, Accept: 'application/json', 'Wanted-User-Country': 'KR', Referer: 'https://www.wanted.co.kr/' },
    timeout: 10000,
  });
  const j = data.job;
  return {
    title:   j.position || '',
    company: j.company?.name || '',
    text: [j.detail?.intro, j.detail?.main_tasks, j.detail?.requirements, j.detail?.preferred_points]
      .filter(Boolean).join(' '),
  };
}

// ── 사람인 ───────────────────────────────────────────────────
async function parseSaramin(url) {
  const { data } = await axios.get(url, { headers: { ...HEADERS, Referer: 'https://www.saramin.co.kr' }, timeout: 12000 });
  const $ = cheerio.load(data);
  const title   = $('.tit_job, .job_tit h1, h1.tit').first().text().trim();
  const company = $('.name, .corp_name h1').first().text().trim();
  // 공고 본문 — 주요업무/자격요건/우대사항 영역
  const text = [
    $('.cont_duty, .duty, .work_condition').text(),
    $('.cont_qualify, .qualify').text(),
    $('.job_detail, .job_info').text(),
  ].join(' ').replace(/\s+/g, ' ').trim();
  return { title, company, text };
}

// ── 잡코리아 ─────────────────────────────────────────────────
async function parseJobkorea(url) {
  const { data } = await axios.get(url, { headers: { ...HEADERS, Referer: 'https://www.jobkorea.co.kr' }, timeout: 12000 });
  const $ = cheerio.load(data);
  const title   = $('h1.title, .recruit-title h1, .job-title').first().text().trim();
  const company = $('.company-name, .corp-name').first().text().trim();
  const text    = $('.recruit-detail, .job-detail, .content-area').text().replace(/\s+/g, ' ').trim();
  return { title, company, text };
}

// ── 인크루트 ─────────────────────────────────────────────────
async function parseIncruit(url) {
  const { data } = await axios.get(url, { headers: { ...HEADERS, Referer: 'https://incruit.com' }, timeout: 12000 });
  const $ = cheerio.load(data);
  const title   = $('h1, .job_title, .tit_job').first().text().trim();
  const company = $('.company, .corp_name').first().text().trim();
  const text    = $('.job_content, .cont_duty, main').text().replace(/\s+/g, ' ').trim();
  return { title, company, text };
}

// ── 범용 (알 수 없는 사이트) ─────────────────────────────────
async function parseGeneric(url) {
  const { data } = await axios.get(url, { headers: HEADERS, timeout: 12000 });
  const $ = cheerio.load(data);
  $('script, style, nav, footer, header').remove();
  const title = $('h1').first().text().trim() || $('title').text().trim();
  const text  = $('main, article, #content, .content, body').first().text().replace(/\s+/g, ' ').trim().slice(0, 3000);
  return { title, company: '', text };
}

// ── 공통 진입점 ───────────────────────────────────────────────
export async function parseJobDetail(url) {
  const site = detectSite(url);
  let result;
  if      (site === 'wanted')   result = await parseWanted(url);
  else if (site === 'saramin')  result = await parseSaramin(url);
  else if (site === 'jobkorea') result = await parseJobkorea(url);
  else if (site === 'incruit')  result = await parseIncruit(url);
  else                          result = await parseGeneric(url);

  return { ...result, site };
}
