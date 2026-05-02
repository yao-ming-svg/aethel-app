import ReactMarkdown from 'react-markdown'
import styles from './ChatMarkdown.module.css'

/**
 * Renders assistant markdown: ### headers, nested lists, **bold** subheaders.
 */
export default function ChatMarkdown({ children }) {
  return (
    <div className={styles.root}>
      <ReactMarkdown
        components={{
          h1: ({ children }) => <h3 className={styles.sectionHeading}>{children}</h3>,
          h2: ({ children }) => <h3 className={styles.sectionHeading}>{children}</h3>,
          h3: ({ children }) => <h3 className={styles.sectionHeading}>{children}</h3>,
          h4: ({ children }) => <h4 className={styles.subSectionHeading}>{children}</h4>,
          h5: ({ children }) => <h4 className={styles.subSectionHeading}>{children}</h4>,
          h6: ({ children }) => <h4 className={styles.subSectionHeading}>{children}</h4>,
          p: ({ children }) => <p className={styles.p}>{children}</p>,
          ul: ({ children }) => <ul className={styles.ul}>{children}</ul>,
          ol: ({ children }) => <ol className={styles.ol}>{children}</ol>,
          li: ({ children }) => <li className={styles.li}>{children}</li>,
          strong: ({ children }) => <strong className={styles.strong}>{children}</strong>,
          em: ({ children }) => <em className={styles.em}>{children}</em>,
          a: ({ href, children }) => (
            <a className={styles.link} href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
          code: ({ children }) => <code className={styles.code}>{children}</code>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
