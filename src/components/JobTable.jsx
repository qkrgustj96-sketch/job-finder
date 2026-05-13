export default function JobTable({ jobs, totalJobs, savedIds, onToggleSave, keyword, loading, page, totalPages, onPageChange, similarityMode }) {
  if (!keyword && !loading) return null;

  if (loading && totalJobs === 0) {
    return (
      <div className="empty-state">
        <div className="spinner" />
        <p>여러 사이트에서 공고를 수집 중입니다...</p>
      </div>
    );
  }

  if (!loading && totalJobs === 0 && keyword) {
    return (
      <div className="empty-state">
        <p>검색 결과가 없습니다.</p>
        <p className="empty-hint">키워드를 변경하거나 제외 키워드·필터를 조정해보세요.</p>
      </div>
    );
  }

  const startIdx = (page - 1) * 100 + 1;
  const endIdx   = Math.min(page * 100, totalJobs);

  return (
    <div className="table-wrap">
      <div className="table-header-row">
        <span className="result-count">
          {loading
            ? `수집 중… 현재 ${totalJobs}건`
            : `총 ${totalJobs}건`}
          {totalJobs > 0 && ` (${startIdx}–${endIdx} 표시)`}
        </span>
        {totalPages > 1 && (
          <Pagination page={page} totalPages={totalPages} onChange={onPageChange} />
        )}
      </div>

      <table className="job-table">
        <thead>
          <tr>
            <th>공고 제목</th>
            <th>회사명</th>
            <th>지역</th>
            <th>고용형태</th>
            <th>연봉</th>
            <th>출처</th>
            <th>{similarityMode ? '유사도' : '추천순'}</th>
            <th>저장</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <tr key={job.id} className={savedIds.has(job.id) ? 'saved-row' : ''}>
              <td>
                <a href={job.url} target="_blank" rel="noopener noreferrer" className="job-link">
                  {job.title}
                </a>
              </td>
              <td>{job.company}</td>
              <td className="meta">{job.location || '-'}</td>
              <td>
                <span className={`badge badge-type badge-${job.type}`}>{job.type || '-'}</span>
              </td>
              <td className="salary-cell">
                {job.salary ? `${job.salary.toLocaleString()}만` : <span className="meta">-</span>}
              </td>
              <td>
                <span className="badge badge-site" style={{ background: job.siteColor }}>
                  {job.siteName}
                </span>
              </td>
              <td><ScoreBar score={job.score} /></td>
              <td>
                <button
                  className={`save-btn ${savedIds.has(job.id) ? 'saved' : ''}`}
                  onClick={() => onToggleSave(job)}
                  title={savedIds.has(job.id) ? '저장 취소' : '관심 공고 저장'}
                >
                  {savedIds.has(job.id) ? '★' : '☆'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {totalPages > 1 && (
        <div className="table-footer-row">
          <Pagination page={page} totalPages={totalPages} onChange={onPageChange} />
        </div>
      )}
    </div>
  );
}

function Pagination({ page, totalPages, onChange }) {
  const delta = 2;
  const left  = Math.max(1, page - delta);
  const right = Math.min(totalPages, page + delta);
  const range = [];
  for (let i = left; i <= right; i++) range.push(i);

  const go = (p) => { onChange(p); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  return (
    <div className="pagination">
      <button className="pg-btn" onClick={() => go(1)} disabled={page === 1} title="첫 페이지">«</button>
      <button className="pg-btn" onClick={() => go(page - 1)} disabled={page === 1} title="이전">‹</button>
      {left > 1 && <span className="pg-ellipsis">…</span>}
      {range.map(p => (
        <button key={p} className={`pg-btn ${p === page ? 'active' : ''}`} onClick={() => go(p)}>
          {p}
        </button>
      ))}
      {right < totalPages && <span className="pg-ellipsis">…</span>}
      <button className="pg-btn" onClick={() => go(page + 1)} disabled={page === totalPages} title="다음">›</button>
      <button className="pg-btn" onClick={() => go(totalPages)} disabled={page === totalPages} title="마지막 페이지">»</button>
    </div>
  );
}

function ScoreBar({ score }) {
  const color = score >= 70 ? '#22c55e' : score >= 40 ? '#f59e0b' : '#94a3b8';
  return (
    <div className="score-bar-wrap" title={`매칭 점수: ${score}점`}>
      <div className="score-bar" style={{ width: `${score}%`, background: color }} />
      <span className="score-label">{score}</span>
    </div>
  );
}
