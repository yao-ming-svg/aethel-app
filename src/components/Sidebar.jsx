import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import styles from './Sidebar.module.css'

const navItems = [
  { to: '/dashboard',    label: 'Dashboard',    icon: '🏠' },
  { to: '/schedule',     label: 'Schedule',     icon: '📅' },
  { to: '/tasks',        label: 'Tasks',        icon: '✅' },
  { to: '/resources',   label: 'Resources',    icon: '📚' },
  { to: '/analytics',   label: 'Analytics',    icon: '📊' },
  { to: '/ai-assistant', label: 'AI Assistant', icon: '🤖' },
]

export default function Sidebar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const onSettings = location.pathname === '/settings'

  const initials = user
    ? `${user.firstName[0]}${user.lastName[0]}`.toUpperCase()
    : '?'

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <aside className={styles.sidebar}>
      <div className={styles.logo}>
        <span className={styles.logoIcon}>⚡</span>
        <span className={styles.logoText}>Aethel</span>
      </div>

      <nav className={styles.nav}>
        {navItems.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `${styles.navItem} ${isActive ? styles.active : ''}`
            }
          >
            <span className={styles.navIcon}>{icon}</span>
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <button
        className={`${styles.userSection} ${onSettings ? styles.userSectionActive : ''}`}
        onClick={() => navigate('/settings')}
        title="Account settings"
      >
        <div className={styles.avatar}>{initials}</div>
        <div className={styles.userInfo}>
          <span className={styles.userName}>
            {user ? `${user.firstName} ${user.lastName}` : ''}
          </span>
          <span className={styles.userEmail}>{user?.email}</span>
        </div>
        <button
          className={styles.logoutBtn}
          onClick={(e) => { e.stopPropagation(); handleLogout() }}
          title="Sign out"
        >
          ↩
        </button>
      </button>
    </aside>
  )
}
