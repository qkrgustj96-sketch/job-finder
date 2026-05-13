import { useState } from 'react';
import { SITE_CONFIGS } from '../services/jobSites.js';

const LOCATIONS = [
  { value: 'seoul', label: '서울' }, { value: 'gyeonggi', label: '경기' },
  { value: 'incheon', label: '인천' }, { value: 'busan', label: '부산' },
  { value: 'daegu', label: '대구' }, { value: 'gwangju', label: '광주' },
  { value: 'daejeon', label: '대전' }, { value: 'ulsan', label: '울산' },
  { value: 'gangwon', label: '강원' }, { value: 'chungbuk', label: '충북' },
  { value: 'chungnam', label: '충남' }, { value: 'jeonbuk', label: '전북' },
  { value: 'jeonnam', label: '전남' }, { value: 'gyeongbuk', label: '경북' },
  { value: 'gyeongnam', label: '경남' }, { value: 'jeju', label: '제주' },
  { value: 'sejong', label: '세종' },
];

const EMP_TYPES = [
  { value: 'regular', label: '정규직' },
  { value: 'contract', label: '계약직' },
  { value: 'intern', label: '인턴' },
];

const EXPERIENCE_OPTIONS = [
  { value: '0', label: '신입' },
  ...Array.from({ length: 10 }, (_, i) => ({ value: String(i + 1), label: `${i + 1}년↑` })),
];

const SALARY_OPTIONS = [
  { value: '0', label: '연봉 무관' },
  { value: '2400', label: '2,400만~' },
  { value: '3000', label: '3,000만~' },
  { value: '3600', label: '3,600만~' },
  { value: '4000', label: '4,000만~' },
  { value: '4500', label: '4,500만~' },
  { value: '5000', label: '5,000만~' },
  { value: '6000', label: '6,000만~' },
  { value: '7000', label: '7,000만~' },
  { value: '8000', label: '8,000만~' },
];

const EDUCATION_OPTIONS = [
  { value: 'high', label: '고졸이상' },
  { value: 'associate', label: '전문대졸이상' },
  { value: 'bachelor', label: '대졸이상' },
  { value: 'master', label: '석사이상' },
];

const COMPANY_TYPES = [
  { value: 'public', label: '공공기관' },
  { value: 'private', label: '사기업' },
];

// 원티드 기준 업계 카테고리
const INDUSTRIES = [
  { value: 'it',           label: 'IT/인터넷' },
  { value: 'game',         label: '게임' },
  { value: 'finance',      label: '금융/핀테크' },
  { value: 'media',        label: '광고/미디어' },
  { value: 'medical',      label: '의료/바이오' },
  { value: 'logistics',    label: '유통/물류' },
  { value: 'manufacture',  label: '제조/화학' },
  { value: 'education',    label: '교육' },
  { value: 'construction', label: '건설/부동산' },
  { value: 'service',      label: '서비스' },
  { value: 'food',         label: '식품/외식' },
  { value: 'public_org',   label: '공공/기관' },
];

export default function SearchBar({ onSearch, loading }) {
  const [keyword, setKeyword] = useState('');
  const [excludeInput, setExcludeInput] = useState('');
  const [excludes, setExcludes] = useState(['개발자', '백엔드', '프론트엔드', '디자이너', '고객센터']);
  const [selectedSites, setSelectedSites] = useState(Object.keys(SITE_CONFIGS));
  const [showFilter, setShowFilter] = useState(false);

  // 다중 선택 필터 ([] = 전체/무관)
  const [locations, setLocations]       = useState([]);
  const [empTypes, setEmpTypes]         = useState([]);
  const [experiences, setExperiences]   = useState([]);
  const [educations, setEducations]     = useState([]);
  const [companyTypes, setCompanyTypes] = useState([]);
  const [industries, setIndustries]     = useState([]);
  const [minSalary, setMinSalary] = useState('0');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!keyword.trim()) return;
    onSearch({
      keyword: keyword.trim(), excludes, selectedSites,
      locations, empTypes, experiences, educations, companyTypes, industries, minSalary,
    });
  };

  const addExclude = () => {
    const val = excludeInput.trim();
    if (val && !excludes.includes(val)) setExcludes([...excludes, val]);
    setExcludeInput('');
  };

  const toggleSite = (site) =>
    setSelectedSites(prev => prev.includes(site) ? prev.filter(s => s !== site) : [...prev, site]);

  const toggle = (setArr) => (val) =>
    setArr(prev => prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]);

  const hasActiveFilter =
    locations.length > 0 || empTypes.length > 0 || experiences.length > 0 ||
    educations.length > 0 || companyTypes.length > 0 || industries.length > 0 || minSalary !== '0';

  const activeCount =
    [locations, empTypes, experiences, educations, companyTypes, industries].filter(a => a.length > 0).length +
    (minSalary !== '0' ? 1 : 0);

  const resetFilters = () => {
    setLocations([]); setEmpTypes([]); setExperiences([]);
    setEducations([]); setCompanyTypes([]); setIndustries([]); setMinSalary('0');
  };

  return (
    <form className="search-bar" onSubmit={handleSubmit}>
      <div className="search-row">
        <input
          className="keyword-input" type="text"
          placeholder="직무 키워드 입력 (예: 마케팅, 기획, 영업)"
          value={keyword} onChange={e => setKeyword(e.target.value)}
        />
        <button className="btn-primary" type="submit" disabled={loading}>
          {loading ? '수집 중...' : '공고 검색'}
        </button>
      </div>

      <div className="filter-row">
        <div className="filter-group">
          <span className="filter-label">사이트</span>
          <div className="site-toggles">
            {Object.entries(SITE_CONFIGS).map(([key, cfg]) => (
              <label key={key} className={`site-toggle ${selectedSites.includes(key) ? 'active' : ''}`} style={{ '--site-color': cfg.color }}>
                <input type="checkbox" checked={selectedSites.includes(key)} onChange={() => toggleSite(key)} />
                {cfg.name}
              </label>
            ))}
          </div>
        </div>

        <div className="filter-group">
          <span className="filter-label">제외 키워드</span>
          <div className="exclude-tags">
            {excludes.map(kw => (
              <span key={kw} className="tag tag-exclude">
                {kw}<button type="button" onClick={() => setExcludes(excludes.filter(e => e !== kw))}>×</button>
              </span>
            ))}
            <div className="exclude-input-row">
              <input type="text" placeholder="추가..." value={excludeInput}
                onChange={e => setExcludeInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addExclude())}
              />
              <button type="button" className="btn-ghost" onClick={addExclude}>+</button>
            </div>
          </div>
        </div>
      </div>

      <div className="detail-filter-toggle-row">
        <button type="button"
          className={`detail-filter-toggle ${showFilter ? 'open' : ''} ${hasActiveFilter ? 'has-active' : ''}`}
          onClick={() => setShowFilter(v => !v)}
        >
          {hasActiveFilter ? `● 상세 필터 (${activeCount}개 적용)` : `상세 필터`} {showFilter ? '▲' : '▼'}
        </button>
        {hasActiveFilter && (
          <button type="button" className="btn-ghost reset-btn" onClick={resetFilters}>초기화</button>
        )}
      </div>

      {showFilter && (
        <div className="detail-filters">

          {/* 지역 */}
          <div className="detail-filter-group full-width">
            <span className="filter-label">
              지역{locations.length > 0 && <span className="chip-count">{locations.length}</span>}
            </span>
            <div className="multi-chips location-chips">
              {LOCATIONS.map(l => (
                <button key={l.value} type="button"
                  className={`chip ${locations.includes(l.value) ? 'active' : ''}`}
                  onClick={() => toggle(setLocations)(l.value)}>
                  {l.label}
                </button>
              ))}
            </div>
          </div>

          {/* 고용형태 */}
          <div className="detail-filter-group">
            <span className="filter-label">
              고용형태{empTypes.length > 0 && <span className="chip-count">{empTypes.length}</span>}
            </span>
            <div className="multi-chips">
              {EMP_TYPES.map(t => (
                <button key={t.value} type="button"
                  className={`chip ${empTypes.includes(t.value) ? 'active' : ''}`}
                  onClick={() => toggle(setEmpTypes)(t.value)}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* 기업형태 */}
          <div className="detail-filter-group">
            <span className="filter-label">
              기업형태{companyTypes.length > 0 && <span className="chip-count">{companyTypes.length}</span>}
            </span>
            <div className="multi-chips">
              {COMPANY_TYPES.map(t => (
                <button key={t.value} type="button"
                  className={`chip ${companyTypes.includes(t.value) ? 'active' : ''}`}
                  onClick={() => toggle(setCompanyTypes)(t.value)}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* 업계 */}
          <div className="detail-filter-group full-width">
            <span className="filter-label">
              업계{industries.length > 0 && <span className="chip-count">{industries.length}</span>}
            </span>
            <div className="multi-chips">
              {INDUSTRIES.map(t => (
                <button key={t.value} type="button"
                  className={`chip ${industries.includes(t.value) ? 'active' : ''}`}
                  onClick={() => toggle(setIndustries)(t.value)}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* 경력 */}
          <div className="detail-filter-group full-width">
            <span className="filter-label">
              경력{experiences.length > 0 && <span className="chip-count">{experiences.length}</span>}
            </span>
            <div className="multi-chips">
              {EXPERIENCE_OPTIONS.map(o => (
                <button key={o.value} type="button"
                  className={`chip ${experiences.includes(o.value) ? 'active' : ''}`}
                  onClick={() => toggle(setExperiences)(o.value)}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {/* 학력 */}
          <div className="detail-filter-group">
            <span className="filter-label">
              학력{educations.length > 0 && <span className="chip-count">{educations.length}</span>}
            </span>
            <div className="multi-chips">
              {EDUCATION_OPTIONS.map(o => (
                <button key={o.value} type="button"
                  className={`chip ${educations.includes(o.value) ? 'active' : ''}`}
                  onClick={() => toggle(setEducations)(o.value)}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {/* 연봉 최소 (단일값 — 최소 기준) */}
          <div className="detail-filter-group">
            <span className="filter-label">연봉 최소</span>
            <select className="filter-select" value={minSalary} onChange={e => setMinSalary(e.target.value)}>
              {SALARY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

        </div>
      )}
    </form>
  );
}
