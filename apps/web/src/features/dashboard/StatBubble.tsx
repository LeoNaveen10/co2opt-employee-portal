
export function StatBubble({ label, value, onClick }: { label: string; value: string; onClick?: () => void }) {
  if (onClick) return <button type="button" className="stat-bubble stat-link" onClick={onClick}><strong>{value}</strong><span>{label}</span></button>;
  return <div className="stat-bubble"><strong>{value}</strong><span>{label}</span></div>;
}
