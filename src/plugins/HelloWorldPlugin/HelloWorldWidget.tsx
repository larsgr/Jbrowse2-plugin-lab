import { useState } from 'react'
import { observer } from 'mobx-react'
import type { Instance } from 'mobx-state-tree'
import type { HelloWorldWidgetModel } from './stateModel'

const HelloWorldWidget = observer(
  ({ model }: { model: Instance<HelloWorldWidgetModel> }) => {
    const [name, setName] = useState('')

    return (
      <div style={{ padding: '1rem' }}>
        <h2 style={{ marginTop: 0, color: '#1a7abf' }}>
          👋 Hello World Widget
        </h2>
        <p style={{ color: '#555' }}>
          This is a custom <strong>WidgetType</strong> plugin. Widgets appear in
          the right-hand drawer panel. They can display feature information,
          analysis results, or any custom UI.
        </p>
        <div style={{ marginTop: '1rem' }}>
          <label htmlFor="name-input" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
            Enter your name:
          </label>
          <input
            id="name-input"
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Your name here"
            style={{
              padding: '0.5rem',
              border: '1px solid #ccc',
              borderRadius: '4px',
              width: '200px',
              marginRight: '0.5rem',
            }}
          />
        </div>
        {name && (
          <div
            style={{
              marginTop: '1rem',
              padding: '0.75rem 1rem',
              background: '#e8f4fd',
              border: '1px solid #1a7abf',
              borderRadius: '4px',
              color: '#1a7abf',
              fontWeight: 'bold',
            }}
          >
            Hello, {name}! Welcome to the JBrowse2 Plugin Lab! 🧬
          </div>
        )}
        <div style={{ marginTop: '1.5rem', fontSize: '0.875rem', color: '#888' }}>
          <strong>Plugin type:</strong> WidgetType
          <br />
          <strong>Opened via:</strong> Add menu → Open Hello World Widget
          <br />
          <strong>Model state:</strong>{' '}
          <code style={{ background: '#f0f0f0', padding: '0 4px', borderRadius: '3px' }}>
            {JSON.stringify({ id: model.id, type: model.type })}
          </code>
        </div>
      </div>
    )
  },
)

export default HelloWorldWidget
