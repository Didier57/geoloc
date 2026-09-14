export default function Filters({
  entities,
  selectedIds,
  onToggle,
  onSelectAll,
  onClear,
  date,
  onDate,
  colors,
}) {
  return (
    <div className="filters">
      <div className="filter-block">
        <div className="filter-head">
          <span>Entités géolocalisées</span>
          <button type="button" className="link" onClick={onSelectAll}>
            Tout
          </button>
          <button type="button" className="link" onClick={onClear}>
            Aucun
          </button>
        </div>
        <div className="chips">
          {entities.length === 0 && (
            <span className="muted">Aucune entité géolocalisée trouvée dans Home Assistant.</span>
          )}
          {entities.map((entity) => {
            const checked = selectedIds.includes(entity.entityId);
            return (
              <label
                key={entity.entityId}
                className={`chip ${checked ? 'active' : ''}`}
                title={entity.entityId}
              >
                <input type="checkbox" checked={checked} onChange={() => onToggle(entity.entityId)} />
                <span className="dot" style={{ background: colors[entity.entityId] }} />
                {entity.name}
                {entity.state && <span className="chip-state">{entity.state}</span>}
              </label>
            );
          })}
        </div>
      </div>

      <div className="filter-block">
        <div className="filter-head">
          <span>Jour</span>
        </div>
        <div className="date-row">
          <label>
            Date
            <input type="date" value={date} onChange={(e) => onDate(e.target.value)} />
          </label>
          <span className="muted">de 00:00 à 24:00</span>
        </div>
      </div>
    </div>
  );
}
