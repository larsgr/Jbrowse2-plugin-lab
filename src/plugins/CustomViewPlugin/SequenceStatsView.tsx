import { observer } from 'mobx-react'

const NUCLEOTIDE_COLORS: Record<string, string> = {
  A: '#1a9850',
  T: '#d73027',
  G: '#756bb1',
  C: '#3182bd',
  N: '#aaa',
}

// The model is typed as `any` here because the stateModel is cast to
// IAnyModelType to bridge the MST version gap between root and @jbrowse/core
const SequenceStatsView = observer(({ model }: { model: any }) => {
  const sequence: string = model.sequence ?? ''
  const stats = model.stats as {
    length: number
    counts: Record<string, number>
    gcContent: number
    complement: string
  }

  return (
    <div
      style={{
        padding: '1.5rem',
        fontFamily: 'monospace, sans-serif',
        height: '100%',
        overflow: 'auto',
        boxSizing: 'border-box',
      }}
    >
      <h2 style={{ marginTop: 0, color: '#333', fontFamily: 'sans-serif' }}>
        🧬 Sequence Stats View
      </h2>
      <p style={{ color: '#555', fontFamily: 'sans-serif', marginBottom: '1.5rem' }}>
        This is a custom <strong>ViewType</strong> plugin. Views are the main
        visualization panels in JBrowse2 (e.g., Linear Genome View, Circular
        View). This demo view analyzes a DNA sequence.
      </p>

      <div style={{ marginBottom: '1rem' }}>
        <label
          htmlFor="seq-input"
          style={{
            display: 'block',
            fontFamily: 'sans-serif',
            fontWeight: 'bold',
            marginBottom: '0.5rem',
          }}
        >
          Enter a DNA sequence:
        </label>
        <textarea
          id="seq-input"
          rows={3}
          value={sequence}
          onChange={e => model.setSequence(e.target.value.toUpperCase())}
          placeholder="e.g. ATGCGATCGATCGTAGCTAGC"
          style={{
            width: '100%',
            padding: '0.5rem',
            border: '1px solid #ccc',
            borderRadius: '4px',
            fontFamily: 'monospace',
            fontSize: '1rem',
            boxSizing: 'border-box',
            resize: 'vertical',
          }}
        />
      </div>

      {sequence.length > 0 && (
        <>
          <div
            style={{
              marginBottom: '1.5rem',
              padding: '0.75rem',
              background: '#f8f8f8',
              borderRadius: '4px',
              border: '1px solid #ddd',
              wordBreak: 'break-all',
            }}
          >
            {sequence.split('').map((base, i) => (
              <span
                key={i}
                style={{
                  color: NUCLEOTIDE_COLORS[base] ?? '#333',
                  fontWeight: NUCLEOTIDE_COLORS[base] ? 'bold' : 'normal',
                }}
              >
                {base}
              </span>
            ))}
          </div>

          <table
            style={{
              borderCollapse: 'collapse',
              width: '100%',
              fontFamily: 'sans-serif',
              fontSize: '0.95rem',
              marginBottom: '1.5rem',
            }}
          >
            <thead>
              <tr style={{ background: '#f0f0f0' }}>
                <th
                  style={{
                    textAlign: 'left',
                    padding: '0.5rem',
                    borderBottom: '2px solid #ccc',
                  }}
                >
                  Statistic
                </th>
                <th
                  style={{
                    textAlign: 'right',
                    padding: '0.5rem',
                    borderBottom: '2px solid #ccc',
                  }}
                >
                  Value
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>
                  Length
                </td>
                <td
                  style={{
                    padding: '0.5rem',
                    textAlign: 'right',
                    borderBottom: '1px solid #eee',
                  }}
                >
                  {stats.length} bp
                </td>
              </tr>
              {(['A', 'T', 'G', 'C', 'N'] as const).map(base => (
                <tr key={base}>
                  <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>
                    <span
                      style={{
                        color: NUCLEOTIDE_COLORS[base],
                        fontWeight: 'bold',
                        marginRight: '0.5rem',
                      }}
                    >
                      {base}
                    </span>
                    count
                  </td>
                  <td
                    style={{
                      padding: '0.5rem',
                      textAlign: 'right',
                      borderBottom: '1px solid #eee',
                    }}
                  >
                    {stats.counts[base] ?? 0} (
                    {stats.length > 0
                      ? (((stats.counts[base] ?? 0) / stats.length) * 100).toFixed(1)
                      : '0.0'}
                    %)
                  </td>
                </tr>
              ))}
              <tr>
                <td
                  style={{
                    padding: '0.5rem',
                    borderBottom: '1px solid #eee',
                    fontWeight: 'bold',
                  }}
                >
                  GC content
                </td>
                <td
                  style={{
                    padding: '0.5rem',
                    textAlign: 'right',
                    borderBottom: '1px solid #eee',
                    fontWeight: 'bold',
                  }}
                >
                  {stats.gcContent.toFixed(1)}%
                </td>
              </tr>
              <tr>
                <td style={{ padding: '0.5rem' }}>Complement</td>
                <td
                  style={{
                    padding: '0.5rem',
                    textAlign: 'right',
                    fontFamily: 'monospace',
                    fontSize: '0.85rem',
                    wordBreak: 'break-all',
                  }}
                >
                  {stats.complement}
                </td>
              </tr>
            </tbody>
          </table>

          <div
            style={{
              padding: '0.75rem',
              background: '#fff8e1',
              border: '1px solid #ffd54f',
              borderRadius: '4px',
              fontFamily: 'sans-serif',
              fontSize: '0.875rem',
              color: '#555',
            }}
          >
            <strong>Note:</strong> In a real JBrowse2 view, this component
            would receive genomic regions, interact with the session, and
            coordinate with other views. The <code>stateModel</code> (MobX
            State Tree) manages the reactive state shown above.
          </div>
        </>
      )}
    </div>
  )
})

export default SequenceStatsView
