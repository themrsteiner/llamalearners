import { Component, StrictMode, type ErrorInfo, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import {
  clearPersistedAppState,
  clearPersistedScheduleAutosaves,
  restorePersistedScheduleLastGood,
} from './persistence'
import { parseScheduleImportString, saveScheduleState } from './storage'

type AppRecoveryBoundaryProps = {
  children: ReactNode
}

type AppRecoveryBoundaryState = {
  error: Error | null
  statusMessage: string | null
  statusTone: 'neutral' | 'success' | 'warning'
  busy: boolean
}

class AppRecoveryBoundary extends Component<AppRecoveryBoundaryProps, AppRecoveryBoundaryState> {
  private fileInput: HTMLInputElement | null = null

  state: AppRecoveryBoundaryState = {
    error: null,
    statusMessage: null,
    statusTone: 'neutral',
    busy: false,
  }

  static getDerivedStateFromError(error: Error): AppRecoveryBoundaryState {
    return {
      error,
      statusMessage: null,
      statusTone: 'neutral',
      busy: false,
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Application render failed.', error, errorInfo)
  }

  handleReload = () => {
    window.location.reload()
  }

  handleResetBrowserData = () => {
    clearPersistedAppState()
    window.location.reload()
  }

  handleRestoreLastAutosave = () => {
    const restored = restorePersistedScheduleLastGood()
    if (!restored) {
      this.setState({
        statusMessage: 'No last autosave was found in this browser profile.',
        statusTone: 'warning',
      })
      return
    }
    this.setState({
      statusMessage: 'Last autosave restored. Reload to retry startup.',
      statusTone: 'success',
    })
  }

  handleClearAutosavesOnly = () => {
    clearPersistedScheduleAutosaves()
    this.setState({
      statusMessage: 'Browser autosaves cleared. Your save files are unchanged.',
      statusTone: 'warning',
    })
  }

  handleOpenLoadDialog = () => {
    this.fileInput?.click()
  }

  handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0]
    event.target.value = ''
    if (!selectedFile) {
      return
    }

    this.setState({ busy: true, statusMessage: null, statusTone: 'neutral' })
    try {
      const rawText = await selectedFile.text()
      const importedSchedule = parseScheduleImportString(rawText)
      if (!importedSchedule) {
        this.setState({
          busy: false,
          statusMessage: 'That file could not be read as a schedule save.',
          statusTone: 'warning',
        })
        return
      }

      const savedAt = saveScheduleState(importedSchedule)
      if (!savedAt) {
        this.setState({
          busy: false,
          statusMessage: 'Save file was valid, but browser storage failed.',
          statusTone: 'warning',
        })
        return
      }

      this.setState({
        busy: false,
        statusMessage: 'Save file loaded into browser autosave. Reload to continue.',
        statusTone: 'success',
      })
    } catch {
      this.setState({
        busy: false,
        statusMessage: 'Could not read that file. Try another save file.',
        statusTone: 'warning',
      })
    }
  }

  render() {
    if (!this.state.error) {
      return this.props.children
    }

    const { statusMessage, statusTone, busy } = this.state

    return (
      <main
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          padding: '1.5rem',
          background: 'linear-gradient(180deg, #fbf5ee, #f4eadf)',
        }}
      >
        <section
          style={{
            width: 'min(100%, 40rem)',
            padding: '1.25rem 1.35rem',
            borderRadius: '20px',
            background: 'rgba(255, 252, 247, 0.98)',
            border: '1px solid rgba(117, 101, 80, 0.18)',
            boxShadow: '0 24px 40px -28px rgba(47, 36, 23, 0.28)',
            color: '#2f2417',
          }}
        >
          <p style={{ margin: 0, fontSize: '0.76rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.72 }}>
            Recovery
          </p>
          <h1 style={{ margin: '0.5rem 0 0', fontSize: '1.5rem', lineHeight: 1.1 }}>Saved browser data may be corrupted.</h1>
          <p style={{ margin: '0.8rem 0 0', lineHeight: 1.5 }}>
            The app hit a startup error. Choose one recovery option below, then reload.
          </p>
          <p style={{ margin: '0.45rem 0 0', lineHeight: 1.5, opacity: 0.88 }}>
            Save files (`Quick Save` and `Save As`) are local files and are not removed unless you delete them.
          </p>
          <p
            style={{
              margin: '0.9rem 0 0',
              padding: '0.75rem 0.85rem',
              borderRadius: '14px',
              background: 'rgba(183, 102, 53, 0.08)',
              border: '1px solid rgba(183, 102, 53, 0.16)',
              fontFamily: 'Consolas, Monaco, monospace',
              fontSize: '0.78rem',
              wordBreak: 'break-word',
            }}
          >
            {this.state.error.name}: {this.state.error.message}
          </p>
          {statusMessage ? (
            <p
              style={{
                margin: '0.7rem 0 0',
                padding: '0.62rem 0.78rem',
                borderRadius: '12px',
                border:
                  statusTone === 'success'
                    ? '1px solid rgba(64, 129, 92, 0.34)'
                    : statusTone === 'warning'
                      ? '1px solid rgba(183, 102, 53, 0.28)'
                      : '1px solid rgba(117, 101, 80, 0.18)',
                background:
                  statusTone === 'success'
                    ? 'rgba(64, 129, 92, 0.08)'
                    : statusTone === 'warning'
                      ? 'rgba(183, 102, 53, 0.08)'
                      : 'rgba(255, 255, 255, 0.75)',
                fontSize: '0.83rem',
              }}
            >
              {statusMessage}
            </p>
          ) : null}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.55rem', marginTop: '1rem' }}>
            <button
              onClick={this.handleReload}
              style={{
                borderRadius: '14px',
                border: '1px solid rgba(117, 101, 80, 0.18)',
                background: 'rgba(255, 255, 255, 0.9)',
                padding: '0.65rem 0.9rem',
                cursor: 'pointer',
                color: '#2f2417',
              }}
              type="button"
            >
              Reload
            </button>
            <button
              onClick={this.handleRestoreLastAutosave}
              style={{
                borderRadius: '14px',
                border: '1px solid rgba(117, 101, 80, 0.18)',
                background: 'rgba(255, 255, 255, 0.9)',
                padding: '0.65rem 0.9rem',
                cursor: 'pointer',
                color: '#2f2417',
              }}
              type="button"
            >
              Restore last autosave
            </button>
            <button
              onClick={this.handleOpenLoadDialog}
              disabled={busy}
              style={{
                borderRadius: '14px',
                border: '1px solid rgba(117, 101, 80, 0.18)',
                background: 'rgba(255, 255, 255, 0.9)',
                padding: '0.65rem 0.9rem',
                cursor: busy ? 'default' : 'pointer',
                color: '#2f2417',
                opacity: busy ? 0.65 : 1,
              }}
              type="button"
            >
              Load save file
            </button>
            <button
              onClick={this.handleClearAutosavesOnly}
              style={{
                borderRadius: '14px',
                border: '1px solid rgba(183, 102, 53, 0.35)',
                background: 'rgba(255, 245, 238, 0.95)',
                padding: '0.65rem 0.9rem',
                cursor: 'pointer',
                color: '#7a4121',
              }}
              type="button"
            >
              Clear browser autosaves
            </button>
            <button
              onClick={this.handleResetBrowserData}
              style={{
                borderRadius: '14px',
                border: '1px solid #b6474f',
                background: '#b6474f',
                padding: '0.65rem 0.9rem',
                cursor: 'pointer',
                color: '#fff8f7',
              }}
              type="button"
            >
              Reset all saved browser data
            </button>
          </div>
          <input
            ref={(node) => {
              this.fileInput = node
            }}
            accept=".json,.txt"
            onChange={this.handleFileSelected}
            style={{ display: 'none' }}
            type="file"
          />
        </section>
      </main>
    )
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppRecoveryBoundary>
      <App />
    </AppRecoveryBoundary>
  </StrictMode>,
)
