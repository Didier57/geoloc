export default function Filters({ entities, date, onDate, colors }) {
  return (
    <div className="filters">
      <div className="filter-block">
        <div className="filter-head">
          <span>Personnes suivies</span>
        </div>
        <div className="chips">
          {entities.length === 0 && (
            <span className="muted">
              Aucune entité suivie. Un administrateur peut en sélectionner dans la fenêtre « Home Assistant ».
            </span>
          )}
          {entities.map((entity) => (
            <span key={entity.entityId} className="chip static" title={entity.entityId}>
              <span className="dot" style={{ background: colors[entity.entityId] }} />
              {entity.name}
              {entity.state && <span className="chip-state">{entity.state}</span>}
            </span>
          ))}
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
