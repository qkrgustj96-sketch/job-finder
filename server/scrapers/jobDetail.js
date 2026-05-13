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

/**
 * 전문 텍스트에서 섹션(담당업무/자격요건/우대사항) 추출
 * 줄 단위로 섹션 헤더를 찾아 분류
 */
function extractSections(text) {
  const DUTY_RE  = /담당\s*업무|주요\s*업무|업무\s*내용|하는\s*일|직무\s*내용|주요\s*직무/;
  const REQ_RE   = /자격\s*요건|지원\s*자격|필수\s*사항|필수\s*요건|자격\s*조건|갖춰야\s*할/;
  const PREF_RE  = /우대\s*사항|우대\s*조건|우대\s*요건|이런\s*분을?|우대합니다/;
  const END_RE   = /복리\s*후생|근무\s*환경|혜택|채용\s*절차|지원\s*방법|전형\s*일정/;

  const lines = text.split(/[\n。]/);
  const collected = { duties: [], requirements: [], preferred: [] };
  let cur = null;

  for (const line of lines) {
    const t = line.trim();
    if (!t || t.length < 2) continue;

    if (DUTY_RE.test(t))  { cur = 'duties';       continue; }
    if (REQ_RE.test(t))   { cur = 'requirements';  continue; }
    if (PREF_RE.test(t))  { cur = 'preferred';     continue; }
    if (END_RE.test(t) && cur) { cur = null; continue; }

    if (cur) collected[cur].push(t);
  }

  return {
    duties:       collected.duties.slice(0, 20).join(' ').slice(0, 1000),
    requirements: collected.requirements.slice(0, 15).join(' ').slice(0, 600),
    preferred:    collected.preferred.slice(0, 15).join(' ').slice(0, 600),
    industry:     '',   // 텍스트 파싱으로는 추출 어려움 (Wanted API에서만 제공)
  };
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
  const duties       = j.detail?.main_tasks        || '';
  const requirements = j.detail?.requirements      || '';
  const preferred    = j.detail?.preferred_points  || '';
  const industry     = j.company?.industry_name    || j.company?.industry || '';

  return {
    title:   j.position || '',
    company: j.company?.name || '',
    text: [j.detail?.intro, duties, requirements, preferred].filter(Boolean).join(' '),
    sections: { duties, requirements, preferred, industry },
  };
}

// ── 사람인 ───────────────────────────────────────────────────
async function parseSaramin(url) {
  const { data } = await axios.get(url, { headers: { ...HEADERS, Referer: 'https://www.saramin.co.kr' }, timeout: 12000 });
  const $ = cheerio.load(data);
  const title   = $('.tit_job, .job_tit h1, h1.tit').first().text().trim();
  const company = $('.name, .corp_name h1').first().text().trim();
  const text = [
    $('.cont_duty, .duty, .work_condition').text(),
    $('.cont_qualify, .qualify').text(),
    $('.job_detail, .job_info').text(),
  ].join('\n').replace(/\s+/g, ' ').trim();

  return { title, company, text, sections: extractSections(text) };
}

// ── 잡코리아 ─────────────────────────────────────────────────
async function parseJobkorea(url) {
  const { data } = await axios.get(url, { headers: { ...HEADERS, Referer: 'https://www.jobkorea.co.kr' }, timeout: 12000 });
  const $ = cheerio.load(data);
  const title   = $('h1.title, .recruit-title h1, .job-title').first().text().trim();
  const company = $('.company-name, .corp-name').first().text().trim();
  const text    = $('.recruit-detail, .job-detail, .content-area').text().replace(/\s+/g, ' ').trim();

  return { title, company, text, sections: extractSections(text) };
}

// ── 인크루트 ─────────────────────────────────────────────────
async function parseIncruit(url) {
  const { data } = await axios.get(url, { headers: { ...HEADERS, Referer: 'https://incruit.com' }, timeout: 12000 });
  const $ = cheerio.load(data);
  const title   = $('h1, .job_title, .tit_job').first().text().trim();
  const company = $('.company, .corp_name').first().text().trim();
  const text    = $('.job_content, .cont_duty, main').text().replace(/\s+/g, ' ').trim();

  return { title, company, text, sections: extractSections(text) };
}

// ── 범용 ─────────────────────────────────────────────────────
async function parseGeneric(url) {
  const { data } = await axios.get(url, { headers: HEADERS, timeout: 12000 });
  const $ = cheerio.load(data);
  $('script, style, nav, footer, header').remove();
  const title = $('h1').first().text().trim() || $('title').text().trim();
  const text  = $('main, article, #content, .content, body').first().text().replace(/\s+/g, ' ').trim().slice(0, 3000);

  return { title, company: '', text, sections: extractSections(text) };
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
