import { useState } from 'react';

export default function SavedJobs({ jobs, onRemove }) {
  const [open, setOpen] = useState(true);
  if (jobs.length === 0) return null;

  return (
    <div className="saved-panel">
      <button className="saved-panel-toggle" onClick={() => setOpen((o) => !o)}>
        ★ 관심 공고 ({jobs.length}) {open ? '▲' : '▼'}
      </button>
      {open && (
        <ul className="saved-list">
          {jobs.map((job) => (
            <li key={job.id} className="saved-item">
              <span className="badge badge-site" style={{ background: job.siteColor }}>
                {job.siteName}
              </span>
              <a href={job.url} target="_blank" rel="noopener noreferrer" className="job-link">
                {job.title}
              </a>
              <span className="saved-company">— {job.company}</span>
              <button className="remove-btn" onClick={() => onRemove(job.id)}>✕</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
