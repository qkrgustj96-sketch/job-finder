import { SITE_CONFIGS } from '../services/jobSites.js';

export default function SiteLinks({ keyword }) {
  if (!keyword) return null;

  return (
    <div className="site-links">
      <span className="site-links-label">바로가기</span>
      {Object.entries(SITE_CONFIGS).map(([key, cfg]) => (
        <a
          key={key}
          href={cfg.searchUrl(keyword)}
          target="_blank"
          rel="noopener noreferrer"
          className="site-link-btn"
          style={{ borderColor: cfg.color, color: cfg.color }}
        >
          {cfg.name} →
        </a>
      ))}
    </div>
  );
}
