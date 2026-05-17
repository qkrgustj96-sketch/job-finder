/**
 * 점핏(Jumpit) 브라우저 스크레이퍼
 *
 * 점핏은 jumpit-api.saramin.co.kr JSON API를 사용
 * → HTML 파싱 없이 JSON 직접 호출 (Vercel 프록시 경유)
 *
 * API: GET https://jumpit-api.saramin.co.kr/api/positions
 *   ?keyword=콘텐츠&sort=relation&page=1
 * 응답: { result: { totalCount, positions: [{id, title, companyName, locations, ...}] } }
 */

const API_BASE = 'https://jumpit-api.saramin.co.kr/api/positions';
const PAGE_SIZE = 20; // 점핏 기본 페이지 크기

const KO_LOC = {
  seoul: '서울', gyeonggi: '경기', incheon: '인천', busan: '부산',
  daegu: '대구', gwangju: '광주', daejeon: '대전', ulsan: '울산',
  gangwon: '강원', chungbuk: '충북', chungnam: '충남', jeonbuk: '전북',
  jeonnam: '전남', gyeongbuk: '경북', gyeongnam: '경남', jeju: '제주', sejong: '세종',
};

async function fetchPage(keyword, page) {
  const apiUrl = `${API_BASE}?keyword=${encodeURIComponent(keyword)}&sort=relation&page=${page}`;
  const res = await fetch(`/api/proxy?url=${encodeURIComponent(apiUrl)}`, {
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('JSON parse failed');
  }

  const positions = data?.result?.positions;
  if (!Array.isArray(positions)) return { jobs: [], hasMore: false };

  const jobs = positions.map(p => {
    // locations: ["서울 강남구", "경기 성남시"] 형태
    const location = (p.locations || []).join(', ');

    return {
      id:       `jp${p.id}`,
      site:     'jumpit',
      title:    p.title    || '',
      company:  p.companyName || '',
      location,
      type:     '정규직',   // 점핏은 대부분 정규직
      salary:   null,       // 상세 API 별도 필요
      url:      `https://www.jumpit.co.kr/position/${p.id}`,
    };
  });

  // 한 페이지가 PAGE_SIZE보다 적으면 마지막 페이지
  return { jobs, hasMore: positions.length >= PAGE_SIZE };
}

/**
 * 점핏 브라우저 스크레이퍼
 * @param {string}   keyword
 * @param {object}   filters  - location, employmentType 등
 * @param {function} onJobs   - 페이지 단위로 공고 배열 콜백
 * @param {AbortSignal} signal
 */
export async function scrapeJumpitBrowser(keyword, filters = {}, onJobs, signal) {
  const locList = (filters.location || '')
    .split(',').map(v => v.trim()).filter(Boolean)
    .map(l => KO_LOC[l]).filter(Boolean);

  let emptyStreak = 0;

  for (let page = 1; page <= 15; page++) {
    if (signal?.aborted) break;

    try {
      const { jobs, hasMore } = await fetchPage(keyword, page);

      if (jobs.length === 0) {
        if (++emptyStreak >= 2) break;
        continue;
      }
      emptyStreak = 0;

      // 지역 필터
      let result = jobs;
      if (locList.length > 0) {
        result = jobs.filter(j =>
          locList.some(ko => (j.location || '').includes(ko))
        );
      }

      if (result.length > 0) onJobs(result);
      if (!hasMore) break; // 마지막 페이지면 종료

    } catch {
      if (++emptyStreak >= 2) break;
    }
  }
}
