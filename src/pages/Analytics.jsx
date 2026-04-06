import '../App.css'
import styles from './Analytics.module.css'

const metricCards = [
  { label: 'Total Study Hours',   value: '0h',  desc: 'This semester' },
  { label: 'Tasks Completed',      value: '0',   desc: 'All time' },
  { label: 'Avg. Session Length',  value: '—',   desc: 'Minutes per session' },
  { label: 'Streak',               value: '0',   desc: 'Days in a row' },
]

export default function Analytics() {
  return (
    <div className="page">
      <div className="page-header">
        <h1>Analytics</h1>
        <p>Track your study progress and performance trends.</p>
      </div>

      <div className={styles.metricsGrid}>
        {metricCards.map((m) => (
          <div key={m.label} className="card">
            <p className={styles.metricLabel}>{m.label}</p>
            <p className={styles.metricValue}>{m.value}</p>
            <p className={styles.metricDesc}>{m.desc}</p>
          </div>
        ))}
      </div>

      <div className="grid-2" style={{ marginTop: 16 }}>
        <div className="card">
          <h2 className={styles.sectionTitle}>Study Hours — Weekly</h2>
          <div className="placeholder-block" style={{ marginTop: 12, minHeight: 160 }}>
            <p>Chart will appear once study sessions are logged.</p>
          </div>
        </div>

        <div className="card">
          <h2 className={styles.sectionTitle}>Tasks Completed — By Subject</h2>
          <div className="placeholder-block" style={{ marginTop: 12, minHeight: 160 }}>
            <p>Chart will appear once tasks are completed.</p>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2 className={styles.sectionTitle}>Performance Trends</h2>
        <div className="placeholder-block" style={{ marginTop: 12, minHeight: 120 }}>
          <p>Performance data will populate as you log study sessions and complete tasks.</p>
        </div>
      </div>
    </div>
  )
}
