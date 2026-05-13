import { useState } from 'react';

export default function RefJobInput({ onSubmit, onClear, refJob, loading, error }) {
  const [url, setUrl] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!url.trim()) return;
    onSubmit(url.trim());
  };

  return (
    <div className="ref-job-panel">
      {!refJob ? (
        <form className="ref-job-form" onSubmit={handleSubmit}>
          <span className="ref-job-label">🔍 유사 공고 찾기</span>
          <input
            className="ref-job-input"
            type="url"
            placeholder="마음에 드는 공고 URL 붙여넣기 (원티드·사람인·잡코리아·인크루트)"
            value={url}
            onChange={e => setUrl(e.target.value)}
            disabled={loading}
          />
          <button className="btn-primary ref-job-btn" type="submit" disabled={loading || !url.trim()}>
            {loading ? '분석 중…' : '이 공고와 유사한 순으로'}
          </button>
        </form>
      ) : (
        <div className="ref-job-active">
          <span className="ref-job-icon">📌</span>
          <span className="ref-job-info">
            <strong>{refJob.title}</strong>
            {refJob.company && <em> · {refJob.company}</em>}
            <span className="ref-job-mode"> 기준으로 유사도순 정렬 중</span>
          </span>
          <button className="btn-ghost ref-job-clear" onClick={onClear}>✕ 해제</button>
        </div>
      )}
      {error && <p className="ref-job-error">{error}</p>}
    </div>
  );
}
