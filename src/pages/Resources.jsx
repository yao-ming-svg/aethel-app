import '../App.css'
import styles from './Resources.module.css'

const categories = ['All', 'Textbooks', 'Videos', 'Articles', 'Practice']

export default function Resources() {
  return (
    <div className="page">
      <div className={styles.header}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1>Resources</h1>
          <p>Discover and save study materials for your subjects.</p>
        </div>
        <button className="btn btn-primary">+ Add Resource</button>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <div className={styles.searchBar}>
          <input
            className={styles.searchInput}
            type="text"
            placeholder="Search resources by subject, keyword, or type..."
          />
          <button className="btn btn-primary">Search</button>
        </div>
      </div>

      <div className={styles.filterRow} style={{ marginTop: 16 }}>
        {categories.map((c) => (
          <button
            key={c}
            className={`${styles.filterBtn} ${c === 'All' ? styles.filterActive : ''}`}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2 className={styles.sectionTitle}>AI-Recommended Resources</h2>
        <div className="placeholder-block" style={{ marginTop: 12 }}>
          <p>AI recommendations will appear here once you add subjects.</p>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2 className={styles.sectionTitle}>Saved Resources</h2>
        <div className="placeholder-block" style={{ marginTop: 12 }}>
          <p>No saved resources yet.</p>
        </div>
      </div>
    </div>
  )
}
