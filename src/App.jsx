import { useState, useCallback, useRef, useEffect } from 'react';
import SearchBar from './components/SearchBar.jsx';
import JobTable from './components/JobTable.jsx';
import SavedJobs from './components/SavedJobs.jsx';
import RefJobInput from './components/RefJobInput.jsx';
import { SITE_CONFIGS, createJobStream } from './services/jobSites.js';
import { applyExcludes } from './utils/filter.js';
import { sortByScore } from './utils/scoring.js';
import { extractRefSections, sortBySimilarity, calcSimilarityFull, extractSecondaryKeywords } from './utils/similarity.js';
import { fetchJobSections } from './utils/browserEnrich.js';

const STORAGE_KEY = 'job_finder_saved';
const PAGE_SIZE = 100;

const INDUSTRY_PATTERNS = {
  it:           ['IT', '인터넷', '소프트웨어', 'SaaS', '플랫폼', '테크', '앱서비스', '정보통신', '시스템', '솔루션', '클라우드'],
  game:         ['게임'],
  finance:      ['금융', '보험', '핀테크', '투자', '증권', '은행', '자산운용', '캐피탈'],
  media:        ['미디어', '광고', '엔터', '콘텐츠', '출판', '방송', '영상'],
  medical:      ['의료', '제약', '바이오', '헬스케어', '병원', '의약품', '헬스'],
  logistics:    ['유통', '물류', '무역', '이커머스', '쇼핑', '배송', '커머스'],
  manufacture:  ['제조', '화학', '소재', '자동차', '기계', '반도체', '전자', '철강'],
  education:    ['교육', '에듀테크', '학원', '연구'],
  construction: ['건설', '부동산', '건축', '인테리어'],
  service:      ['서비스', '여행', '숙박', '렌탈', '공유', '플리마켓'],
  food:         ['식품', '외식', '음식', 'F&B', '식음료', '농업', '식자재'],
  public_org:   ['공기업', '공공기관', '정부', '기관', '공단', '공사'],
};

// 공공기관 판별 — 회사명 패턴 기반 (정확도 높음)
const PUBLIC_KEYWORDS = [
  '공단', '공사', '재단', '협회', '위원회', '연구원', '연구소',
  '국립', '시립', '도립', '군립', '공기업', '공공기관',
  '국민건강보험', '국민연금', '건강보험', '고용노동', '근로복지',
  '시청', '구청', '도청', '군청', '교육청', '보건소',
];
function isPublicOrg(company) {
  return PUBLIC_KEYWORDS.some(kw => company.includes(kw));
}

const LOCATION_KO = {
  seoul: '서울', gyeonggi: '경기', incheon: '인천', busan: '부산',
  daegu: '대구', gwangju: '광주', daejeon: '대전', ulsan: '울산',
  gangwon: '강원', chungbuk: '충북', chungnam: '충남', jeonbuk: '전북',
  jeonnam: '전남', gyeongbuk: '경북', gyeongnam: '경남', jeju: '제주', sejong: '세종',
};
const EMP_KO = { regular: '정규직', contract: '계약직', intern: '인턴' };

function loadSaved() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}

export default function App() {
  const [jobs, setJobs]           = useState([]);
  const [loading, setLoading]     = useState(false);
  const [keyword, setKeyword]     = useState('');
  const [savedJobs, setSavedJobs] = useState(loadSaved);
  const [siteStatus, setSiteStatus] = useState({});
  const [siteErrors, setSiteErrors] = useState({});
  const [page, setPage]           = useState(1);

  // 기준 공고 (URL 추천 모드)
  const [refJob, setRefJob]       = useState(null);   // { title, company, keywords }
  const [refLoading, setRefLoading] = useState(false);
  const [refError, setRefError]   = useState('');

  const [enrichStatus, setEnrichStatus] = useState({ loading: false, done: 0, total: 0, error: '' });
  const [analyzingMode, setAnalyzingMode] = useState(false); // URL 분석 중 로딩 화면

  const esRef              = useRef(null);
  const jobMap             = useRef(new Map());
  const stateRef           = useRef({});
  const enrichedRef        = useRef(false); // 현재 검색에서 enrich 실행 여부
  const secondaryKwsRef    = useRef([]);    // 2차 검색 키워드
  const secondaryDoneRef   = useRef(0);     // 완료된 2차 검색 수
  const [secondarySearching, setSecondarySearching] = useState(false);

  const savedIds = new Set(savedJobs.map(j => j.id));

  const applyAllFilters = useCallback((allJobs, { excludes, minSalary, locations, empTypes, industries, companyTypes }) => {
    let result = applyExcludes(allJobs, excludes);
    const min = parseInt(minSalary);
    if (min > 0) result = result.filter(j => j.salary === null || j.salary >= min);
    if (locations?.length > 0) {
      const koList = locations.map(l => LOCATION_KO[l]).filter(Boolean);
      if (koList.length > 0) result = result.filter(j => koList.some(ko => (j.location || '').includes(ko)));
    }
    if (empTypes?.length > 0) {
      const koList = empTypes.map(t => EMP_KO[t]).filter(Boolean);
      if (koList.length > 0) result = result.filter(j => koList.some(ko => (j.type || '').includes(ko)));
    }
    if (industries?.length > 0) {
      result = result.filter(j => {
        if (!j.industry) return true;
        return industries.some(cat => (INDUSTRY_PATTERNS[cat] || []).some(pat => j.industry.includes(pat)));
      });
    }
    // 기업형태: 공공기관 / 사기업 클라이언트 필터
    if (companyTypes?.length > 0 && companyTypes.length < 2) {
      const wantPublic  = companyTypes.includes('public');
      const wantPrivate = companyTypes.includes('private');
      result = result.filter(j => {
        const pub = isPublicOrg(j.company);
        if (wantPublic  && !wantPrivate) return pub;
        if (wantPrivate && !wantPublic)  return !pub;
        return true;
      });
    }
    return result;
  }, []);

  // 정렬: 기준 공고 있으면 유사도순, 없으면 추천순(siteRank 기반)
  const sortJobs = useCallback((filtered, kw, currentRefJob) => {
    if (currentRefJob?.refSections) {
      return sortBySimilarity(filtered, currentRefJob.refSections);
    }
    return sortByScore(filtered, kw);
  }, []);

  const handleSearch = useCallback(({
    keyword: kw, excludes, selectedSites,
    locations, empTypes, experiences, educations, companyTypes, industries, minSalary,
  }) => {
    if (esRef.current) { esRef.current.close(); esRef.current = null; }

    setKeyword(kw);
    setJobs([]);
    setSiteErrors({});
    setEnrichStatus({ loading: false, done: 0, total: 0 });
    setPage(1);
    jobMap.current.clear();
    enrichedRef.current = false;
    secondaryKwsRef.current = [];
    secondaryDoneRef.current = 0;
    setSecondarySearching(false);

    const initialStatus = Object.fromEntries(selectedSites.map(s => [s, { status: 'loading', count: 0 }]));
    setSiteStatus(initialStatus);
    setLoading(true);

    stateRef.current = { excludes, minSalary, kw, locations, empTypes, industries, companyTypes, refJob: stateRef.current.refJob };

    const streamParams = {
      location: locations.join(','), employmentType: empTypes.join(','),
      experience: experiences.join(','), education: educations.join(','),
      companyType: companyTypes.join(','), minSalary,
    };

    let retryCount = 0;

    function startStream() {
      const es = createJobStream(kw, selectedSites, streamParams);
      esRef.current = es;

      es.onmessage = (e) => {
        const data = JSON.parse(e.data);
        const { excludes: excl, minSalary: sal, kw: k, locations: locs, empTypes: eTypes, industries: inds, companyTypes: cTypes } = stateRef.current;

        if (data.type === 'jobs') {
          const tagged = data.jobs.map(job => ({
            ...job,
            siteName:  SITE_CONFIGS[job.site]?.name  || job.site,
            siteColor: SITE_CONFIGS[job.site]?.color || '#888',
          }));
          tagged.forEach(j => jobMap.current.set(j.id, j));
          setSiteStatus(prev => ({
            ...prev,
            [data.site]: { status: 'loading', count: (prev[data.site]?.count || 0) + data.jobs.length },
          }));
          const all = [...jobMap.current.values()];
          const filtered = applyAllFilters(all, { excludes: excl, minSalary: sal, locations: locs, empTypes: eTypes, industries: inds, companyTypes: cTypes });
          setJobs(sortJobs(filtered, k, stateRef.current.refJob));

        } else if (data.type === 'done') {
          setSiteStatus(prev => ({ ...prev, [data.site]: { ...prev[data.site], status: 'done' } }));
        } else if (data.type === 'error') {
          if (data.site) {
            setSiteErrors(prev => ({ ...prev, [data.site]: data.message }));
            setSiteStatus(prev => ({ ...prev, [data.site]: { ...prev[data.site], status: 'error' } }));
          }
        } else if (data.type === 'complete') {
          setLoading(false);
          es.close();
          esRef.current = null;
        }
      };

      es.onerror = () => {
        es.close();
        esRef.current = null;
        const hasResults = jobMap.current.size > 0;
        // Railway 콜드스타트 대응: 결과 없으면 최대 2회 자동 재시도
        if (!hasResults && retryCount < 2) {
          retryCount++;
          setSiteErrors(prev => ({ ...prev, _global: `서버 연결 중… (재시도 ${retryCount}/2)` }));
          setTimeout(startStream, 3000);
        } else {
          setLoading(false);
          if (!hasResults) {
            setSiteErrors(prev => ({ ...prev, _global: '서버 연결이 불안정합니다. 다시 검색해주세요.' }));
          }
          // 결과가 있으면 나머지 사이트만 실패 처리 (에러 표시 없음)
        }
      };
    }

    startStream();
  }, [applyAllFilters, sortJobs]);

  useEffect(() => () => { if (esRef.current) esRef.current.close(); }, []);

  // 공고 제목에서 검색 키워드 추출
  const deriveSearchKeyword = (title) => {
    const clean = title
      .replace(/\s*(채용|모집|구인|공고|포지션|담당자|직원|급구|경력직|신입|정규직)\s*.*$/i, '')
      .trim();
    return clean.split(/\s+/).slice(0, 2).join(' ') || title.split(/\s+/)[0];
  };

  // 2차 검색 실행 후 enrich 트리거
  // - 1차 검색(제목 기반) 완료 후 호출
  // - 기준 공고 duties 키워드로 추가 검색 → jobMap에 신규 공고 병합
  // - 모든 2차 검색 완료 시 triggerEnrich 호출
  const runSecondaryThenEnrich = useCallback(() => {
    const keywords = secondaryKwsRef.current;
    if (!keywords || keywords.length === 0) {
      triggerEnrichRef.current?.();
      return;
    }

    setSecondarySearching(true);
    secondaryDoneRef.current = 0;
    const total = keywords.length;

    const handleOneDone = () => {
      secondaryDoneRef.current++;
      if (secondaryDoneRef.current >= total) {
        setSecondarySearching(false);
        triggerEnrichRef.current?.();
      }
    };

    const { locations: locs = [], empTypes: eTypes = [] } = stateRef.current;
    const selectedSites = Object.keys(SITE_CONFIGS);
    const streamParams = {
      location: locs.join(','), employmentType: eTypes.join(','),
      experience: '', education: '', companyType: '', minSalary: '0',
    };

    for (const kw of keywords) {
      const es = createJobStream(kw, selectedSites, streamParams);
      // 20초 타임아웃 (2차 검색은 빠르게)
      const timer = setTimeout(() => { es.close(); handleOneDone(); }, 20000);

      es.onmessage = (e) => {
        const data = JSON.parse(e.data);
        if (data.type === 'jobs') {
          const { excludes: excl = [], minSalary: sal = '0', kw: k = '',
                  locations: l = [], empTypes: et = [], industries: ind = [], companyTypes: ct = [] } = stateRef.current;
          const newJobs = data.jobs
            .filter(j => !jobMap.current.has(j.id)) // 중복 제거
            .map(j => ({
              ...j,
              siteName:  SITE_CONFIGS[j.site]?.name  || j.site,
              siteColor: SITE_CONFIGS[j.site]?.color || '#888',
              _fromSecondary: true,
            }));
          if (newJobs.length > 0) {
            newJobs.forEach(j => jobMap.current.set(j.id, j));
            const all = [...jobMap.current.values()];
            const filtered = applyAllFilters(all, { excludes: excl, minSalary: sal, locations: l, empTypes: et, industries: ind, companyTypes: ct });
            setJobs(sortJobs(filtered, k, stateRef.current.refJob));
          }
        } else if (data.type === 'complete') {
          clearTimeout(timer);
          es.close();
          handleOneDone();
        }
      };

      es.onerror = () => {
        clearTimeout(timer);
        es.close();
        handleOneDone();
      };
    }
  }, [applyAllFilters, sortJobs]);

  // triggerEnrich를 ref로 보관 (runSecondaryThenEnrich에서 호출)
  const triggerEnrichRef = useRef(null);

  // 브라우저에서 직접 공고 상세 페이지 fetch → 업무내용 비교
  // Railway(미국 IP)가 한국 사이트 차단 → Vercel 프록시(/api/proxy)로 우회
  const triggerEnrich = useCallback(async () => {
    const refJob = stateRef.current.refJob;
    if (!refJob?.rawSections) return;
    if (enrichedRef.current) return;
    enrichedRef.current = true;

    const allJobs = [...jobMap.current.values()];
    const top50 = [...allJobs].sort((a, b) => b.score - a.score).slice(0, 70); // 2차 검색 포함 → top70
    if (top50.length === 0) return;

    setEnrichStatus({ loading: true, done: 0, total: top50.length, error: '' });

    const apiBase = import.meta.env.VITE_API_URL || '';
    let doneCount = 0;
    const CONCURRENCY = 8; // 브라우저 병렬 fetch (Vercel 프록시 활용)
    const queue = [...top50];

    const flushJobs = () => {
      const { excludes: excl = [], minSalary: sal = '0', locations: locs = [],
              empTypes: eTypes = [], industries: inds = [], companyTypes: cTypes = [] } = stateRef.current;
      const all = [...jobMap.current.values()];
      const filtered = applyAllFilters(all, { excludes: excl, minSalary: sal, locations: locs, empTypes: eTypes, industries: inds, companyTypes: cTypes });
      setJobs(sortBySimilarity(filtered, refJob.refSections));
    };

    const worker = async () => {
      while (queue.length > 0) {
        const job = queue.shift();
        if (!job) break;
        try {
          const sections = await fetchJobSections(job, apiBase);
          if (sections) {
            const rawScore = calcSimilarityFull(
              refJob.rawSections, sections,
              job.industry, job.title, refJob.title
            );
            const cur = jobMap.current.get(job.id);
            if (cur) jobMap.current.set(job.id, { ...cur, _rawScore: rawScore, enriched: true });
          }
        } catch { /* 개별 실패는 무시 */ }

        doneCount++;
        setEnrichStatus(prev => ({ ...prev, done: doneCount }));
        if (doneCount % 8 === 0 || doneCount === top50.length) flushJobs();
      }
    };

    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    // 점수 정규화: 0~100점 (바닥 5점 제거 — 실제 유사도 반영)
    const enrichedJobs = [...jobMap.current.values()].filter(j => j.enriched);
    if (enrichedJobs.length > 0) {
      const maxRaw = Math.max(...enrichedJobs.map(j => j._rawScore ?? 0), 1);
      for (const job of enrichedJobs) {
        const normalized = Math.round(((job._rawScore ?? 0) / maxRaw) * 100);
        jobMap.current.set(job.id, { ...job, score: normalized });
      }
    }

    flushJobs();
    setEnrichStatus(prev => ({ ...prev, loading: false, error: '' }));
    setAnalyzingMode(false);
  }, [applyAllFilters]);

  // triggerEnrich ref 동기화 (runSecondaryThenEnrich에서 최신 버전 호출)
  useEffect(() => { triggerEnrichRef.current = triggerEnrich; }, [triggerEnrich]);

  // 검색 완료 + 유사도 모드일 때 → 2차 검색 후 상세 비교
  const prevLoadingRef = useRef(false);
  useEffect(() => {
    if (prevLoadingRef.current && !loading && stateRef.current.refJob?.rawSections) {
      runSecondaryThenEnrich();
    }
    prevLoadingRef.current = loading;
  }, [loading, runSecondaryThenEnrich]);

  // 기준 공고 URL 처리 → 파싱 후 자동 검색
  const handleRefUrl = useCallback(async (url) => {
    setRefLoading(true);
    setRefError('');
    try {
      const apiBase = import.meta.env.VITE_API_URL || '';
      const res = await fetch(`${apiBase}/api/job/parse?url=${encodeURIComponent(url)}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || '파싱 실패');

      const refSections = extractRefSections(data);
      const newRefJob = {
        title: data.title,
        company: data.company,
        refSections,
        rawSections: data.sections,
      };

      stateRef.current.refJob = newRefJob;
      setRefJob(newRefJob);
      setAnalyzingMode(true); // 로딩 화면 시작

      const searchKeyword = deriveSearchKeyword(data.title);

      // 2차 검색 키워드: 기준 공고 duties에서 1차 키워드에 없는 특화어 추출
      const secKws = extractSecondaryKeywords(data.sections, searchKeyword);
      secondaryKwsRef.current = secKws;
      console.log('[2차 검색 키워드]', secKws);
      const { excludes: excl = [], minSalary: sal = '0', locations: locs = [], empTypes: eTypes = [], industries: inds = [], companyTypes: cTypes = [] } = stateRef.current;
      handleSearch({
        keyword: searchKeyword,
        excludes: excl,
        selectedSites: Object.keys(SITE_CONFIGS),
        locations: locs,
        empTypes: eTypes,
        experiences: [],
        educations: [],
        companyTypes: cTypes,
        industries: inds,
        minSalary: sal,
      });
    } catch (e) {
      setRefError(e.message);
    } finally {
      setRefLoading(false);
    }
  }, [handleSearch]);

  const clearRefJob = useCallback(() => {
    setRefJob(null);
    stateRef.current.refJob = null;
    setPage(1);
    // 추천순(siteRank 기반)으로 복귀
    const { excludes: excl = [], minSalary: sal = '0', kw: k = '', locations: locs = [], empTypes: eTypes = [], industries: inds = [], companyTypes: cTypes = [] } = stateRef.current;
    const all = [...jobMap.current.values()];
    const filtered = applyAllFilters(all, { excludes: excl, minSalary: sal, locations: locs, empTypes: eTypes, industries: inds, companyTypes: cTypes });
    setJobs(sortByScore(filtered, k));
  }, [applyAllFilters]);

  const toggleSave = useCallback((job) => {
    setSavedJobs(prev => {
      const next = prev.some(j => j.id === job.id) ? prev.filter(j => j.id !== job.id) : [...prev, job];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const removeSaved = useCallback((id) => {
    setSavedJobs(prev => {
      const next = prev.filter(j => j.id !== id);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const totalPages = Math.max(1, Math.ceil(jobs.length / PAGE_SIZE));
  const pagedJobs  = jobs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // 분석 진행률 계산 (0–100)
  // 0~35%: 1차 공고 수집, 35~45%: 2차 키워드 검색, 45~95%: 상세 분석, 95~100%: 완료
  let analyzePct = 5;
  if (analyzingMode) {
    if (loading) {
      const totalSites = Math.max(Object.keys(siteStatus).length, 1);
      const doneSites  = Object.values(siteStatus).filter(s => s.status !== 'loading').length;
      analyzePct = Math.max(5, Math.round((doneSites / totalSites) * 35));
    } else if (secondarySearching) {
      analyzePct = 38; // 2차 검색 중 고정
    } else if (enrichStatus.loading) {
      analyzePct = 45 + Math.round((enrichStatus.done / Math.max(enrichStatus.total, 1)) * 50);
    } else {
      analyzePct = 100;
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title" style={{ cursor: 'pointer' }} onClick={() => setPage(1)}>취준 공고 모아보기</h1>
        <p className="app-subtitle">직무 키워드 하나로 여러 채용 사이트를 한 번에 검색</p>
      </header>

      <main className="app-main">
        <SearchBar onSearch={handleSearch} loading={loading} />

        {Object.keys(siteStatus).length > 0 && (
          <div className="status-bar">
            {Object.entries(siteStatus).map(([site, { status, count }]) => (
              <span key={site} className={`status-chip status-${status}`}>
                {SITE_CONFIGS[site]?.name || site}
                {status === 'loading' && ' ⟳'}
                {status === 'done'    && ` ✓ ${count}개`}
                {status === 'error'   && ' ✗'}
              </span>
            ))}
            {loading && <span className="status-note">수집 중 — 결과가 실시간으로 쌓입니다</span>}
          </div>
        )}

        {Object.keys(siteErrors).length > 0 && (
          <div className="error-bar">
            {siteErrors._global && <span className="error-chip">{siteErrors._global}</span>}
            {Object.entries(siteErrors).filter(([k]) => k !== '_global').map(([site]) => (
              <span key={site} className="error-chip">
                {SITE_CONFIGS[site]?.name || site}: 수집 실패
              </span>
            ))}
          </div>
        )}

        <RefJobInput
          onSubmit={handleRefUrl}
          onClear={clearRefJob}
          refJob={refJob}
          loading={refLoading}
          error={refError}
          enrichStatus={enrichStatus}
        />

        {/* 유사 공고 분석 로딩 화면 */}
        {analyzingMode && refJob && (
          <div className="analyzing-overlay">
            <div className="analyzing-card">
              <div className="analyzing-spinner" />
              <p className="analyzing-title">유사 공고를 분석하고 있어요</p>
              <p className="analyzing-ref">📌 {refJob.title}{refJob.company ? ` · ${refJob.company}` : ''}</p>
              <div className="analyzing-progress-wrap">
                <div className="analyzing-progress-bar" style={{ width: `${analyzePct}%` }} />
              </div>
              <p className="analyzing-pct">{analyzePct}%</p>
              <p className="analyzing-hint">
                {loading            ? '채용 공고 수집 중…'
                  : secondarySearching ? '연관 공고 추가 탐색 중…'
                  : enrichStatus.loading ? '상세 내용 분석 중…'
                  : '분석 완료'}
              </p>
            </div>
          </div>
        )}

        <SavedJobs jobs={savedJobs} onRemove={removeSaved} />
        <JobTable
          jobs={pagedJobs}
          totalJobs={jobs.length}
          savedIds={savedIds}
          onToggleSave={toggleSave}
          keyword={keyword}
          loading={loading}
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          similarityMode={!!refJob}
        />
      </main>
    </div>
  );
}
