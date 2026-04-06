import { useState } from 'react'
import '../App.css'
import styles from './AIAssistant.module.css'

const features = [
  { icon: '📅', title: 'Study Schedule Generator', desc: 'Generate a personalized study schedule based on your deadlines and availability.' },
  { icon: '📄', title: 'Document Summarizer',       desc: 'Upload PDFs or notes and get concise, exam-focused summaries.' },
  { icon: '🔍', title: 'Resource Recommender',      desc: 'Get AI-curated textbooks, videos, and articles tailored to your subjects.' },
]

export default function AIAssistant() {
  const [input, setInput] = useState('')

  return (
    <div className="page">
      <div className="page-header">
        <h1>AI Assistant</h1>
        <p>Your AI-powered study companion. Ask questions, get a schedule, or summarize notes.</p>
      </div>

      <div className="grid-3" style={{ marginBottom: 20 }}>
        {features.map((f) => (
          <div key={f.title} className={`card ${styles.featureCard}`}>
            <span className={styles.featureIcon}>{f.icon}</span>
            <h3 className={styles.featureTitle}>{f.title}</h3>
            <p className={styles.featureDesc}>{f.desc}</p>
            <button className={`btn btn-outline ${styles.featureBtn}`}>Try it</button>
          </div>
        ))}
      </div>

      <div className="card">
        <h2 className={styles.chatTitle}>Chat with AI</h2>

        <div className={styles.chatWindow}>
          <div className={styles.chatEmpty}>
            <p>Start a conversation with the AI assistant.</p>
            <p style={{ marginTop: 6, fontSize: 12 }}>
              Try: "Create a study schedule for my Math exam on Friday" or "Summarize my uploaded notes"
            </p>
          </div>
        </div>

        <div className={styles.inputRow}>
          <input
            className={styles.chatInput}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask anything about your studies..."
          />
          <button className={`btn ${styles.uploadBtn}`} title="Upload a file">📎</button>
          <button className="btn btn-primary" disabled={!input.trim()}>Send</button>
        </div>
      </div>
    </div>
  )
}
