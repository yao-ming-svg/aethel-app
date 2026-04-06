import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import '../App.css'
import styles from './Settings.module.css'

export default function Settings() {
  const { user, updateProfile, updatePassword, deleteAccount } = useAuth()
  const navigate = useNavigate()

  // Profile form
  const [profile, setProfile] = useState({
    firstName: user?.firstName ?? '',
    lastName: user?.lastName ?? '',
  })
  const [profileMsg, setProfileMsg] = useState(null) // { type: 'success'|'error', text }

  // Password form
  const [passwords, setPasswords] = useState({
    current: '',
    next: '',
    confirm: '',
  })
  const [passwordMsg, setPasswordMsg] = useState(null)

  // Delete confirmation
  const [deleteInput, setDeleteInput] = useState('')
  const [showDelete, setShowDelete] = useState(false)

  // ── Profile ──────────────────────────────────────────────────────────────────
  function handleProfileChange(e) {
    setProfile((p) => ({ ...p, [e.target.name]: e.target.value }))
    setProfileMsg(null)
  }

  function handleProfileSave(e) {
    e.preventDefault()
    if (!profile.firstName.trim() || !profile.lastName.trim()) {
      setProfileMsg({ type: 'error', text: 'First and last name are required.' })
      return
    }
    updateProfile({ firstName: profile.firstName.trim(), lastName: profile.lastName.trim() })
    setProfileMsg({ type: 'success', text: 'Name updated successfully.' })
  }

  // ── Password ─────────────────────────────────────────────────────────────────
  function handlePasswordChange(e) {
    setPasswords((p) => ({ ...p, [e.target.name]: e.target.value }))
    setPasswordMsg(null)
  }

  function handlePasswordSave(e) {
    e.preventDefault()
    if (!passwords.current) {
      setPasswordMsg({ type: 'error', text: 'Please enter your current password.' })
      return
    }
    if (passwords.next.length < 8) {
      setPasswordMsg({ type: 'error', text: 'New password must be at least 8 characters.' })
      return
    }
    if (passwords.next !== passwords.confirm) {
      setPasswordMsg({ type: 'error', text: 'New passwords do not match.' })
      return
    }
    const result = updatePassword({ currentPassword: passwords.current, newPassword: passwords.next })
    if (result.error) {
      setPasswordMsg({ type: 'error', text: result.error })
    } else {
      setPasswordMsg({ type: 'success', text: 'Password updated successfully.' })
      setPasswords({ current: '', next: '', confirm: '' })
    }
  }

  // ── Delete ───────────────────────────────────────────────────────────────────
  const DELETE_PHRASE = 'delete my account'

  function handleDelete() {
    deleteAccount()
    navigate('/login', { replace: true })
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="page">
      <div className="page-header">
        <h1>Account Settings</h1>
        <p>Manage your profile, password, and account preferences.</p>
      </div>

      {/* Profile */}
      <section className={`card ${styles.section}`}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionIcon}>👤</div>
          <div>
            <h2 className={styles.sectionTitle}>Profile</h2>
            <p className={styles.sectionDesc}>Update your display name.</p>
          </div>
        </div>

        <form onSubmit={handleProfileSave} className={styles.form} noValidate>
          {profileMsg && (
            <div className={`${styles.msg} ${styles[profileMsg.type]}`}>
              {profileMsg.text}
            </div>
          )}

          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="firstName">First Name</label>
              <input
                id="firstName"
                name="firstName"
                className={styles.input}
                type="text"
                value={profile.firstName}
                onChange={handleProfileChange}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="lastName">Last Name</label>
              <input
                id="lastName"
                name="lastName"
                className={styles.input}
                type="text"
                value={profile.lastName}
                onChange={handleProfileChange}
              />
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Email</label>
            <input className={`${styles.input} ${styles.inputDisabled}`} type="email" value={user?.email ?? ''} disabled />
            <p className={styles.hint}>Email cannot be changed.</p>
          </div>

          <div className={styles.formFooter}>
            <button className="btn btn-primary" type="submit">Save Changes</button>
          </div>
        </form>
      </section>

      {/* Password */}
      <section className={`card ${styles.section}`}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionIcon}>🔒</div>
          <div>
            <h2 className={styles.sectionTitle}>Change Password</h2>
            <p className={styles.sectionDesc}>Choose a strong password of at least 8 characters.</p>
          </div>
        </div>

        <form onSubmit={handlePasswordSave} className={styles.form} noValidate>
          {passwordMsg && (
            <div className={`${styles.msg} ${styles[passwordMsg.type]}`}>
              {passwordMsg.text}
            </div>
          )}

          <div className={styles.field}>
            <label className={styles.label} htmlFor="current">Current Password</label>
            <input
              id="current"
              name="current"
              className={styles.input}
              type="password"
              placeholder="••••••••"
              value={passwords.current}
              onChange={handlePasswordChange}
              autoComplete="current-password"
            />
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="next">New Password</label>
              <input
                id="next"
                name="next"
                className={styles.input}
                type="password"
                placeholder="Min. 8 characters"
                value={passwords.next}
                onChange={handlePasswordChange}
                autoComplete="new-password"
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="confirm">Confirm New Password</label>
              <input
                id="confirm"
                name="confirm"
                className={styles.input}
                type="password"
                placeholder="••••••••"
                value={passwords.confirm}
                onChange={handlePasswordChange}
                autoComplete="new-password"
              />
            </div>
          </div>

          <div className={styles.formFooter}>
            <button className="btn btn-primary" type="submit">Update Password</button>
          </div>
        </form>
      </section>

      {/* Danger zone */}
      <section className={`card ${styles.section} ${styles.dangerSection}`}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionIcon}>⚠️</div>
          <div>
            <h2 className={`${styles.sectionTitle} ${styles.dangerTitle}`}>Delete Account</h2>
            <p className={styles.sectionDesc}>
              Permanently remove your account and all associated data. This cannot be undone.
            </p>
          </div>
        </div>

        {!showDelete ? (
          <button
            className={`btn ${styles.dangerBtn}`}
            onClick={() => setShowDelete(true)}
          >
            Delete My Account
          </button>
        ) : (
          <div className={styles.deleteConfirm}>
            <p className={styles.deleteWarning}>
              This will permanently delete your account, all your courses, schedules, and materials.
              To confirm, type <strong>{DELETE_PHRASE}</strong> below.
            </p>
            <input
              className={`${styles.input} ${styles.deleteInput}`}
              type="text"
              placeholder={DELETE_PHRASE}
              value={deleteInput}
              onChange={(e) => setDeleteInput(e.target.value)}
            />
            <div className={styles.deleteActions}>
              <button
                className="btn btn-outline"
                onClick={() => { setShowDelete(false); setDeleteInput('') }}
              >
                Cancel
              </button>
              <button
                className={`btn ${styles.dangerBtn}`}
                disabled={deleteInput !== DELETE_PHRASE}
                onClick={handleDelete}
              >
                Permanently Delete Account
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
