import axios from 'axios';

const EXP_MAP = {
  all: -1, '0': 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5,
  '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
};

function firstVal(str) {
  if (!str) return null;
  const vals = str.split(',').map(v => v.trim()).filter(Boolean);
  return vals.length > 0 ? vals[0] : null;
}

async function fetchPage(keyword, filters, offset) {
  const expFirst = firstVal(filters.experience);
  const { data } = await axios.get('https://www.wanted.co.kr/api/v4/jobs', {
    params: {
      limit: 20, offset,
      job_sort: 'job.latest_order',
      years: EXP_MAP[expFirst] ?? -1,
      keyword, country: 'kr',
    },
    headers: {
      Accept: 'application/json',
      'Wanted-User-Country': 'KR',
      'Wanted-User-Language': 'ko',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36',
      Referer: 'https://www.wanted.co.kr/',
    },
    timeout: 10000,
  });

  const jobs = (data.data || []).map(job => ({
    id: `w${job.id}`,
    site: 'wanted',
    title: job.position || '',
    company: job.company?.name || '',
    location: job.address?.location || '',
    type: '정규직',
    salary: null,
    industry: job.company?.industry_name || '',
    url: `https://www.wanted.co.kr/wd/${job.id}`,
  }));

  return { jobs, total: data.total || 0 };
}

export async function* scrapeWanted(keyword, filters = {}) {
  let offset = 0;
  let total = Infinity;

  while (offset < Math.min(total, 500)) {
    const { jobs, total: t } = await fetchPage(keyword, filters, offset);
    if (t > 0) total = t;
    if (jobs.length === 0) break;
    yield jobs;
    offset += 20;
  }
}
