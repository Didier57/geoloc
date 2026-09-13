export default function Filters({
  entities,
  selectedIds,
  onToggle,
  onSelectAll,
  onClear,
  from,
  to,
  onFrom,
  onTo,
  onQuick,
  colors,
}) {
  return (
    <div className="filters">
      <div className="filter-block">
        <div className="filter-head">
          <span>Personnes</span>
          <button type="button" className="link" onClick={onSelectAll}>
            Tout
          </button>
          <button type="button" className="link" onClick={onClear}>
            Aucun
          </button>
        </div>
        <div className="chips">
          {entities.length === 0 && <span className="muted">Aucun appareil suivi trouvé.</span>}
          {entities.map((entity) => (
            <button
              type="button"
              key={entity.entityId}
              className={`chip ${selectedIds.includes(entity.entityId) ? 'active' : ''}`}
              onClick={() => onToggle(entity.entityId)}
            >
              <span className="dot" style={{ background: colors[entity.entityId] }} />
              {entity.name}
              {entity.state && <span className="chip-state">{entity.state}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="filter-block">
        <div className="filter-head">
          <span>Période</span>
          <button type="button" className="link" onClick={() => onQuick(0, true)}>
            Aujourd'hui
          </button>
          <button type="button" className="link" onClick={() => onQuick(1)}>
            24 h
          </button>
          <button type="button" className="link" onClick={() => onQuick(7)}>
            7 jours
          </button>
          <button type="button" className="link" onClick={() => onQuick(30)}>
            30 jours
          </button>
        </div>
        <div className="date-row">
          <label>
            Du
            <input type="date" value={from} onChange={(e) => onFrom(e.target.value)} />
          </label>
          <label>
            Au
            <input type="date" value={to} onChange={(e) => onTo(e.target.value)} />
          </label>
        </div>
      </div>
    </div>
  );
}
