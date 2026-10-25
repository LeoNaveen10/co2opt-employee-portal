import { useState, useEffect } from 'react';
import type { Recommendation, RecommendationSearchResult } from '../../types';
import { api } from '../../api';

export function RecommendationForm({ recommendation, busy, onSubmit, onCancel }: {
  recommendation: Recommendation | null;
  busy: boolean;
  onSubmit: (payload: { type: string; title: string; url: string; imageUrl: string; note: string }) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [type, setType] = useState(recommendation?.type ?? 'MOVIE');
  const [title, setTitle] = useState(recommendation?.title ?? '');
  const [url, setUrl] = useState(recommendation?.url ?? '');
  const [imageUrl, setImageUrl] = useState(recommendation?.imageUrl ?? '');
  const [note, setNote] = useState(recommendation?.note ?? '');
  const [searchResults, setSearchResults] = useState<RecommendationSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchError, setSearchError] = useState('');

  useEffect(() => {
    if (title.trim().length < 2) {
      setSearching(false);
      return;
    }
    if (imageUrl) return;
    let cancelled = false;
    setSearching(true);
    setSearchError('');
    const timer = window.setTimeout(() => {
      void api<{ results: RecommendationSearchResult[] }>(
        `/recommendations/search?type=${encodeURIComponent(type)}&term=${encodeURIComponent(title.trim())}`
      ).then((response) => {
        if (cancelled) return;
        setSearchResults(response.results);
        setHasSearched(true);
        setImageUrl(response.results[0]?.imageUrl ?? '');
        setSearching(false);
      }).catch((error: Error) => {
        if (!cancelled) { setSearchError(error.message); setSearching(false); }
      });
    }, 500);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [title, type, imageUrl]);

  return (
    <form className="form-stack" onSubmit={async (e) => {
      e.preventDefault();
      const saved = await onSubmit({
        type,
        title: title.trim(),
        url: url.trim(),
        imageUrl: imageUrl.trim(),
        note: note.trim()
      });
      if (saved && !recommendation) {
        setTitle('');
        setUrl('');
        setImageUrl('');
        setNote('');
        setSearchResults([]);
        setHasSearched(false);
      }
    }}>
      <select value={type} onChange={(e) => { setType(e.target.value); setImageUrl(''); setSearchResults([]); setHasSearched(false); setSearchError(''); }}>
        <option value="MOVIE">Movie</option>
        <option value="SERIES">Series</option>
        <option value="BOOK">Book</option>
        <option value="MUSIC">Music</option>
      </select>
      <label>
        Title
        <input placeholder="Search by title" value={title} onChange={(e) => { setTitle(e.target.value); setImageUrl(''); setUrl(''); setSearchResults([]); setHasSearched(false); }} required />
      </label>
      {(
        <div className="catalog-search">
          {searching ? <p className="meta-line" role="status">Finding artwork?</p> : null}
          {searchError ? <p className="catalog-error" role="alert">{searchError}</p> : null}
          {searchResults.length ? (
            <div className="catalog-results" aria-label="Artwork search results">
              {searchResults.map((result) => (
                <button
                  key={result.id}
                  type="button"
                  className="catalog-result"
                  onClick={() => {
                    setTitle(result.title);
                    setUrl(result.url ?? '');
                    setImageUrl(result.imageUrl);
                    setSearchResults([]);
                  }}
                >
                  <img src={result.imageUrl} alt="" />
                  <span><strong>{result.title}</strong>{result.artist ? <small>{result.artist}</small> : null}</span>
                </button>
              ))}
            </div>
          ) : null}
          {hasSearched && !searchResults.length && !searchError ? (
            <p className="meta-line">
              No artwork found for this title. You can still share your recommendation.
            </p>
          ) : null}
          {imageUrl ? <img className="artwork-preview" src={imageUrl} alt={`Artwork for ${title}`} /> : null}
        </div>
      )}
      <input placeholder="Optional link" value={url} onChange={(e) => setUrl(e.target.value)} />
      <textarea placeholder="Why recommend this?" value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="inline-actions">
        <button className="primary-btn" disabled={busy || searching}>{recommendation ? 'Save changes' : 'Share recommendation'}</button>
        {recommendation ? <button type="button" className="ghost-btn" disabled={busy} onClick={onCancel}>Cancel edit</button> : null}
      </div>
    </form>
  );
}
