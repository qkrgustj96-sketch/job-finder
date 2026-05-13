export const SITE_CONFIGS = {
  wanted:   { name: '원티드',   color: '#3366FF' },
  saramin:  { name: '사람인',   color: '#FF6600' },
  jobkorea: { name: '잡코리아', color: '#0033AA' },
  incruit:  { name: '인크루트', color: '#009900' },
};

export function createJobStream(keyword, selectedSites, filters = {}) {
  const params = new URLSearchParams({
    keyword,
    sites:          selectedSites.join(','),
    location:       filters.location       || '',
    employmentType: filters.employmentType || '',
    experience:     filters.experience     || '',
    education:      filters.education      || '',
    companyType:    filters.companyType    || '',
    minSalary:      filters.minSalary      || '0',
  });
  const base = import.meta.env.VITE_API_URL || '';
  return new EventSource(`${base}/api/jobs/stream?${params.toString()}`);
}
