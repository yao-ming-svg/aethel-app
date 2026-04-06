import { createContext, useContext, useState, useEffect } from 'react'

const AuthContext = createContext(null)

const USERS_KEY = 'aethel_users'
const SESSION_KEY = 'aethel_session'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // Rehydrate session on mount
  useEffect(() => {
    const stored = localStorage.getItem(SESSION_KEY)
    if (stored) {
      try {
        setUser(JSON.parse(stored))
      } catch {
        localStorage.removeItem(SESSION_KEY)
      }
    }
    setLoading(false)
  }, [])

  function getUsers() {
    try {
      return JSON.parse(localStorage.getItem(USERS_KEY)) || []
    } catch {
      return []
    }
  }

  function register({ firstName, lastName, email, password }) {
    const users = getUsers()
    const exists = users.find((u) => u.email.toLowerCase() === email.toLowerCase())
    if (exists) {
      return { error: 'An account with this email already exists.' }
    }

    const newUser = {
      id: crypto.randomUUID(),
      firstName,
      lastName,
      email,
      // NOTE: passwords stored in plain text here because this is a
      // localStorage mock. Replace with a real backend + hashed passwords.
      password,
      createdAt: new Date().toISOString(),
    }

    localStorage.setItem(USERS_KEY, JSON.stringify([...users, newUser]))

    const session = { id: newUser.id, firstName, lastName, email }
    localStorage.setItem(SESSION_KEY, JSON.stringify(session))
    setUser(session)
    return { success: true }
  }

  function login({ email, password }) {
    const users = getUsers()
    const found = users.find(
      (u) =>
        u.email.toLowerCase() === email.toLowerCase() &&
        u.password === password,
    )
    if (!found) {
      return { error: 'Invalid email or password.' }
    }

    const session = {
      id: found.id,
      firstName: found.firstName,
      lastName: found.lastName,
      email: found.email,
    }
    localStorage.setItem(SESSION_KEY, JSON.stringify(session))
    setUser(session)
    return { success: true }
  }

  function updateProfile({ firstName, lastName }) {
    const users = getUsers()
    const updated = users.map((u) =>
      u.id === user.id ? { ...u, firstName, lastName } : u,
    )
    localStorage.setItem(USERS_KEY, JSON.stringify(updated))
    const session = { ...user, firstName, lastName }
    localStorage.setItem(SESSION_KEY, JSON.stringify(session))
    setUser(session)
    return { success: true }
  }

  function updatePassword({ currentPassword, newPassword }) {
    const users = getUsers()
    const found = users.find((u) => u.id === user.id)
    if (!found || found.password !== currentPassword) {
      return { error: 'Current password is incorrect.' }
    }
    const updated = users.map((u) =>
      u.id === user.id ? { ...u, password: newPassword } : u,
    )
    localStorage.setItem(USERS_KEY, JSON.stringify(updated))
    return { success: true }
  }

  function deleteAccount() {
    const users = getUsers()
    localStorage.setItem(USERS_KEY, JSON.stringify(users.filter((u) => u.id !== user.id)))
    // Remove all data associated with this user
    localStorage.removeItem(`aethel_courses_${user.id}`)
    localStorage.removeItem(`aethel_onboarded_${user.id}`)
    localStorage.removeItem(SESSION_KEY)
    setUser(null)
  }

  function logout() {
    localStorage.removeItem(SESSION_KEY)
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, register, login, logout, updateProfile, updatePassword, deleteAccount }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
