import { measureText } from '@jbrowse/core/util'
import { observer } from 'mobx-react'
import type { Condition } from './conditions'
import { ROW_PAD, rowTop, type PileupLayout, type PlacedLegendItem } from './layout'

export interface OverlayModel {
  conditions: Condition[]
  pileupLayout: PileupLayout
  pileupCaption: string[]
  expanded: boolean
  setExpanded: (expanded: boolean) => void
  /** JBrowse's "zoom in or force load" guard is showing instead of data */
  regionTooLarge?: boolean
  legendLayout: {
    items: PlacedLegendItem[]
    fontSize: number
    swatch: number
  }
}

const PANEL_BG = 'rgba(255,255,255,0.85)'

/**
 * HTML drawn over the canvas: the legend band, the pile-up caption with the
 * expand/collapse button, and a label per condition row.
 *
 * Positions come from the display's `pileupLayout`, the same object the
 * renderer drew with, so labels line up with their rows at any row height.
 * Everything is pointer-transparent except the button, so hovering a label
 * still reaches the canvas underneath and its tooltip.
 */
const PileupOverlay = observer(function PileupOverlay({
  model,
}: {
  model: OverlayModel
}) {
  const { conditions, pileupLayout: l, pileupCaption, expanded } = model
  // The guard's message sits at the top of the track, under the legend, and
  // labels for rows that are not drawn would explain nothing.
  if (model.regionTooLarge) {
    return null
  }
  const legend = model.legendLayout
  const fontSize = Math.max(8, Math.min(12, l.rowHeight - ROW_PAD - 2))
  const labelWidth =
    Math.max(0, ...conditions.map(c => measureText(c.name, fontSize))) + 16
  const [title, ...subtitle] = pileupCaption

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        fontSize: 11,
        lineHeight: 1.2,
      }}
    >
      {legend.items.map(item => (
        <div
          key={item.label}
          style={{
            position: 'absolute',
            left: item.x,
            top: item.y,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: legend.fontSize,
            whiteSpace: 'nowrap',
          }}
        >
          <span
            style={{
              width: legend.swatch,
              height: legend.swatch,
              background: item.color,
              boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.25)',
            }}
          />
          {item.label}
        </div>
      ))}

      <div
        data-testid="pileup-caption"
        style={{
          position: 'absolute',
          left: 4,
          top: l.top + 2,
          background: PANEL_BG,
          padding: '1px 4px',
          borderRadius: 3,
          maxWidth: 260,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <strong>{title}</strong>
          {conditions.length ? (
            <button
              type="button"
              data-testid="pileup-expand"
              style={{
                pointerEvents: 'auto',
                font: 'inherit',
                fontSize: 10,
                padding: '0 6px',
                border: '1px solid #1976d2',
                borderRadius: 3,
                background: 'white',
                color: '#1976d2',
                cursor: 'pointer',
              }}
              // Keep the click from starting a drag-scroll of the view.
              onMouseDown={e => e.stopPropagation()}
              onClick={() => model.setExpanded(!expanded)}
            >
              {expanded ? 'Collapse ▴' : `Expand ${conditions.length} ▾`}
            </button>
          ) : null}
        </div>
        {subtitle.map(line => (
          <div key={line} style={{ opacity: 0.75, fontSize: 10 }}>
            {line}
          </div>
        ))}
      </div>

      {expanded && l.rowHeight >= 7
        ? conditions.map((c, i) => (
            <div
              key={`${c.name}-${i}`}
              data-testid="pileup-row-label"
              style={{
                position: 'absolute',
                left: 0,
                width: labelWidth,
                top: rowTop(l, i),
                height: l.rowHeight - ROW_PAD,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: 4,
                paddingRight: 2,
                boxSizing: 'border-box',
                fontSize,
                whiteSpace: 'nowrap',
                background: PANEL_BG,
              }}
            >
              <span
                style={{
                  width: 4,
                  alignSelf: 'stretch',
                  margin: '1px 0',
                  background: c.color,
                }}
              />
              {c.name}
            </div>
          ))
        : null}
    </div>
  )
})

export default PileupOverlay
