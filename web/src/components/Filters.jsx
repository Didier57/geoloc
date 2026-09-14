export default function Filters({
  entities,
  selectedIds,
  onToggle,
  onSelectAll,
  onClear,
  colors,
  date,
  onDate,
  onShiftDay,
}) {
  const selected = new Set(selectedIds);
  return (
    <div className="filters">
      <div className="filter-block">
        <div className="filter-head">
          <span>Personnes suivies</span>
          {entities.length > 0 && (
            <span className="filter-actions">
              <button className="link" onClick={onSelectAll}>
                Tout
              </button>
              <button className="link" onClick={onClear}>
                Aucun
              </button>
            </span>
          )}
        </div>
        <div className="chips">
          {entities.length === 0 && (
            <span className="muted">
              Aucune entité suivie. Un administrateur peut en sélectionner dans la fenêtre « Home Assistant ».
            </span>
          )}
          {entities.map((entity) => (
            <label key={entity.entityId} className="chip" title={entity.entityId}>
              <input
                type="checkbox"
                checked={selected.has(entity.entityId)}
                onChange={() => onToggle(entity.entityId)}
              />
              <span className="dot" style={{ background: colors[entity.entityId] }} />
              {entity.name}
              {entity.state && <span className="chip-state">{entity.state}</span>}
            </label>
          ))}
        </div>
      </div>

      <div className="filter-block">
        <div className="filter-head">
          <span>Jour</span>
        </div>
        <div className="date-row">
          <button className="btn icon" onClick={() => onShiftDay(-1)} title="Jour précédent">
            ‹
          </button>
          <input type="date" value={date} onChange={(e) => onDate(e.target.value)} />
          <button className="btn icon" onClick={() => onShiftDay(1)} title="Jour suivant">
            ›
          </button>
          <span className="muted">de 00:00 à 24:00</span>
        </div>
      </div>
    </div>
  );
}
