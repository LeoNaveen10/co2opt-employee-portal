import { useState } from 'react';
import type { User, Recommendation } from '../../types';

export function RecommendationGrid({ items, currentUser, busy, onEdit, onDelete, onLike, onRate }: {
  items: Recommendation[];
  currentUser: User;
  busy: boolean;
  onEdit: (item: Recommendation) => void;
  onDelete: (id: string) => void;
  onLike: (id: string) => void;
  onRate: (id: string, score: number) => void;
}) {
  const [authorFilter, setAuthorFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const authors = Array.from(new Map(items.filter((item) => item.author).map((item) => [item.author.id, item.author])).values())
    .sort((a, b) => a.name.localeCompare(b.name));
  const showCategories = items.some((item) => item.type !== 'MUSIC');
  const filteredItems = items.filter((item) => (authorFilter === 'all' || item.author?.id === authorFilter) && (typeFilter === 'all' || item.type === typeFilter));
  return (
    <div>
      <div className="recommendation-filters">
        <label>Suggested by
          <select value={authorFilter} onChange={(event) => setAuthorFilter(event.target.value)}>
            <option value="all">Everyone</option>
            {authors.map((author) => <option key={author.id} value={author.id}>{author.name}</option>)}
          </select>
        </label>
        {showCategories ? <label>Category
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
            <option value="all">All categories</option>
            <option value="MOVIE">Movies</option>
            <option value="SERIES">Series</option>
            <option value="BOOK">Books</option>
          </select>
        </label> : null}
        {authorFilter !== 'all' || typeFilter !== 'all' ? <button type="button" className="ghost-btn small" onClick={() => { setAuthorFilter('all'); setTypeFilter('all'); }}>Clear filters</button> : null}
      </div>
      <div className="grid-cards roomy-grid recommendation-grid">
      {filteredItems.map((record) => {
        const item = { ...record, ratings: record.ratings ?? [], likes: record.likes ?? [] };
        const myRating = item.ratings.find((rating) => rating.userId === currentUser.id)?.score ?? 0;
        const average = item.ratings.length ? (item.ratings.reduce((sum, entry) => sum + entry.score, 0) / item.ratings.length).toFixed(1) : '—';
        const liked = item.likes.some((like) => like.userId === currentUser.id);
        return (
          <article key={item.id} className="rec-card">
            <div className="card-top-row">
              <span className="chip bright">{item.type}</span>
              <span className="rating-pill">⭐ {average} / 5{item.ratings.length ? ` • ${item.ratings.length} rating${item.ratings.length > 1 ? 's' : ''}` : ''}</span>
            </div>
            {item.imageUrl ? <img className="rec-artwork" src={item.imageUrl} alt={`Artwork for ${item.title}`} loading="lazy" /> : null}
            <div className="recommendation-title-row">
              <h4>{item.title}</h4>
            {item.author?.id === currentUser.id ? (
              <div className="record-actions">
                <button className="recommendation-edit-btn" disabled={busy} onClick={() => onEdit(item)}>Edit</button>
                <button className="recommendation-delete-btn" disabled={busy} onClick={() => onDelete(item.id)}>Delete</button>
              </div>
            ) : null}
            </div>
            <p className="meta-line">Shared by {item.author?.name ?? 'Former teammate'}</p>
            {item.note ? <p>{item.note}</p> : null}
            {item.url ? <a href={item.url} target="_blank" rel="noreferrer">Open link ↗</a> : null}
            <div className="inline-actions wrap reaction-row">
              <button type="button" className={liked ? 'recommendation-like-btn is-liked' : 'recommendation-like-btn'} aria-pressed={liked} disabled={busy} onClick={() => onLike(item.id)}>{liked ? 'Liked 💚' : 'Like'}</button>
              <span>{item.likes.length} likes</span>
              <span>Your rating: <strong>{myRating || '—'}</strong></span>
            </div>
            <div className="rate-box">
              <div className="rate-box-header">
                <strong>Rate this pick</strong>
                <span>Tap a star to rate</span>
              </div>
              <div className="rating-row roomy-rating-row">
                {[1, 2, 3, 4, 5].map((score) => (
                  <button key={score} className={myRating >= score ? 'star active' : 'star'} onClick={() => onRate(item.id, score)} aria-label={`Rate ${item.title} ${score} star${score > 1 ? 's' : ''}`}>★</button>
                ))}
              </div>
            </div>
          </article>
        );
      })}
      {filteredItems.length === 0 && <p>{items.length ? 'No recommendations match these filters.' : 'Nothing here yet. Add the first one.'}</p>}
      </div>
    </div>
  );
}
