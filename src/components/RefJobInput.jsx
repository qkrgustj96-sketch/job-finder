import { useState } from 'react';

export default function RefJobInput({ onSubmit, onClear, refJob, loading, error, enrichStatus = {} }) {
  const [url, setUrl] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!url.trim()) return;
    onSubmit(url.trim());
    setUrl('');
  };

  return (
    <div className="ref-job-panel">
      {!refJob ? (
        <form className="ref-job-form" onSubmit={handleSubmit}>
          <span className="ref-job-label">✨ 유사 공고 자동 검색</span>
          <input
            className="ref-job-input"
            type="url"
            placeholder="마음에 드는 공고 URL만 붙여넣으면 자동으로 유사 공고를 찾아드려요"
            value={url}
            onChange={e => setUrl(e.target.value)}
            disabled={loading}
          />
          <button className="btn-primary ref-job-btn" type="submit" disabled={loading || !url.trim()}>
            {loading ? '분석 중…' : '유사 공고 검색'}
          </button>
        </form>
      ) : (
        <div className="ref-job-active">
          <span className="ref-job-icon">📌</span>
          <span className="ref-job-info">
            <strong>{refJob.title}</strong>
            {refJob.company && <em> · {refJob.company}</em>}
            {enrichStatus.loading
              ? <span className="ref-job-mode enrich-loading"> 🔍 상세 분석 중 ({enrichStatus.done}/{enrichStatus.total})</span>
              : <span className="ref-job-mode"> · 유사도순 정렬</span>
            }
          </span>
          <button className="btn-ghost ref-job-clear" onClick={() => { onClear(); setUrl(''); }}>✕ 해제</button>
        </div>
      )}
      {error && <p className="ref-job-error">⚠ {error}</p>}
    </div>
  );
}
