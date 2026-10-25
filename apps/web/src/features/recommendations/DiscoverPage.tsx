import type { PortalState } from '../dashboard/usePortal';
import { RecommendationDialog } from '../recommendations/RecommendationDialog';
import { RecommendationForm } from '../recommendations/RecommendationForm';
import { RecommendationGrid } from '../recommendations/RecommendationGrid';
import { api } from '../../api';

export function DiscoverPage({ user, busy, data, recommendationOpen, setRecommendationOpen, editingRecommendation, setEditingRecommendation, dismissToast, runAction, deleteRecommendation }: Omit<Pick<PortalState, 'user' | 'busy' | 'data' | 'recommendationOpen' | 'setRecommendationOpen' | 'editingRecommendation' | 'setEditingRecommendation' | 'dismissToast' | 'runAction' | 'deleteRecommendation'>, 'user'> & { user: NonNullable<PortalState['user']> }) {
  return (
        <div className="page-grid two-col">
          <div className="recommendation-page-actions span-2">
            <button type="button" className="primary-btn" onClick={() => { setEditingRecommendation(null); dismissToast(); setRecommendationOpen(true); }}><span className="plus-icon" aria-hidden="true" /> Add recommendation</button>
          </div>
          {recommendationOpen ? <RecommendationDialog busy={busy} onClose={() => { setRecommendationOpen(false); setEditingRecommendation(null); }}>
            <h3 id="recommendation-dialog-title">{editingRecommendation ? 'Edit recommendation' : 'Add recommendation'}</h3>
            <p className="section-subtitle">Share a movie, series, book, or song with the team.</p>
            <RecommendationForm
              key={editingRecommendation?.id ?? 'new-recommendation'}
              recommendation={editingRecommendation}
              busy={busy}
              onCancel={() => { setRecommendationOpen(false); setEditingRecommendation(null); }}
              onSubmit={async (payload) => {
                const recommendationId = editingRecommendation?.id;
                const saved = await runAction(
                  () => api(recommendationId ? `/recommendations/${recommendationId}` : '/recommendations', {
                    method: recommendationId ? 'PATCH' : 'POST',
                    body: JSON.stringify(payload)
                  }),
                  recommendationId ? 'Recommendation updated.' : 'Recommendation added!'
                );
                if (saved) { setEditingRecommendation(null); setRecommendationOpen(false); }
                return saved;
              }}
            />
          </RecommendationDialog> : null}
          <section className="card span-2">
            <h3>Movies, series and books 🍿📚</h3>
            <p className="section-subtitle">Everyone can like and rate these picks from 1 to 5 stars.</p>
            <RecommendationGrid
              items={data.recommendations.filter((item) => item.type !== 'MUSIC')}
              currentUser={user}
              busy={busy}
              onEdit={(item) => { setEditingRecommendation(item); dismissToast(); setRecommendationOpen(true); }}
              onDelete={(id) => void deleteRecommendation(id)}
              onLike={(id) => runAction(() => api(`/recommendations/${id}/like`, { method: 'POST' }), 'Reaction updated.')}
              onRate={(id, score) => runAction(() => api(`/recommendations/${id}/rate`, { method: 'POST', body: JSON.stringify({ score }) }), 'Rating saved.')}
            />
          </section>
          <section className="card span-2 gradient-c">
            <h3>Shared music corner 🎧</h3>
            <p className="section-subtitle">Drop songs, albums, or playlists and rate other people's music picks.</p>
            <RecommendationGrid
              items={data.recommendations.filter((item) => item.type === 'MUSIC')}
              currentUser={user}
              busy={busy}
              onEdit={(item) => { setEditingRecommendation(item); dismissToast(); setRecommendationOpen(true); }}
              onDelete={(id) => void deleteRecommendation(id)}
              onLike={(id) => runAction(() => api(`/recommendations/${id}/like`, { method: 'POST' }), 'Reaction updated.')}
              onRate={(id, score) => runAction(() => api(`/recommendations/${id}/rate`, { method: 'POST', body: JSON.stringify({ score }) }), 'Rating saved.')}
            />
          </section>
        </div>
  );
}
