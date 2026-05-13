export const DEFAULT_EXCLUDES = ['개발자', '백엔드', '프론트엔드', '디자이너', '고객센터'];

export function applyExcludes(jobs, excludeList) {
  if (!excludeList?.length) return jobs;
  return jobs.filter((job) => {
    const text = `${job.title} ${job.company}`.toLowerCase();
    return !excludeList.some((kw) => text.includes(kw.toLowerCase()));
  });
}

export function applyKeywordFilter(jobs, keyword) {
  if (!keyword.trim()) return jobs;
  const terms = keyword.trim().toLowerCase().split(/\s+/);
  return jobs.filter((job) => {
    const text = `${job.title} ${job.company}`.toLowerCase();
    return terms.some((t) => text.includes(t));
  });
}
