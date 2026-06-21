import { useState } from 'react'

function formatDate(value) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
}

export default function ProgressNavigator({ countries, selectedCountry, selectedScenario, onCountryChange, onScenarioChange }) {
  const [expanded, setExpanded] = useState(selectedCountry)

  return (
    <section className="agent-profile__panel agent-profile__missions" aria-labelledby="missions-title">
      <div className="agent-profile__section-heading">
        <div><span className="agent-profile__eyebrow">Mission archive</span><h2 id="missions-title">Countries & scenarios</h2></div>
        <span className="agent-profile__section-note">Select to filter constellation</span>
      </div>
      <div className="agent-profile__tree">
        {countries.map((country) => {
          const isExpanded = expanded === country.code
          const completed = country.scenarios.filter((scenario) => scenario.completed).length
          return (
            <div className={`agent-profile__country ${selectedCountry === country.code ? 'is-selected' : ''}`} key={country.code}>
              <button
                type="button"
                className="agent-profile__country-button"
                aria-expanded={isExpanded}
                aria-controls={`profile-country-${country.code}`}
                onClick={() => {
                  setExpanded(isExpanded ? '' : country.code)
                  onCountryChange(country.code)
                }}
              >
                <span className="agent-profile__flag" aria-hidden="true">{country.flag}</span>
                <span className="agent-profile__country-copy"><strong>{country.name}</strong><small>{country.unlocked ? `${country.unlockedAt ? `Unlocked ${formatDate(country.unlockedAt)} · ` : ''}${completed}/${country.scenarios.length} scenarios cleared` : 'Mission locked'}</small></span>
                {country.character && <span className="agent-profile__character">{country.character.type ?? country.character.name ?? country.character}</span>}
                <span className="agent-profile__chevron" aria-hidden="true">{isExpanded ? '−' : '+'}</span>
              </button>
              {isExpanded && (
                <div id={`profile-country-${country.code}`} className="agent-profile__scenario-list">
                  <button type="button" className={!selectedScenario ? 'is-selected' : ''} onClick={() => onScenarioChange(null)}>
                    <span className="agent-profile__status-dot" /><span><strong>All encountered words</strong><small>Complete language constellation</small></span>
                  </button>
                  {country.scenarios.map((scenario) => (
                    <button type="button" className={selectedScenario === scenario.id ? 'is-selected' : ''} key={scenario.id} onClick={() => onScenarioChange(scenario.id)}>
                      <span className={`agent-profile__status-dot ${scenario.completed ? 'is-complete' : ''}`} />
                      <span><strong>{scenario.title}</strong><small>{scenario.completed ? `Completed${scenario.completedAt ? ` · ${formatDate(scenario.completedAt)}` : ''}` : scenario.description}</small></span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
