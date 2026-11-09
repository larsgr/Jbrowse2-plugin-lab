import type { ReactNode } from 'react'
import BaseTooltip from '@jbrowse/core/ui/BaseTooltip'

/** The tooltip box plus a vertical guide line at the cursor. */
export function TooltipFrame({
  height,
  clientMouseCoord,
  offsetMouseCoord,
  children,
}: {
  height: number
  clientMouseCoord: [number, number]
  offsetMouseCoord: [number, number]
  children: ReactNode
}) {
  return (
    <>
      <BaseTooltip
        clientPoint={{ x: clientMouseCoord[0] + 15, y: clientMouseCoord[1] }}
      >
        <div data-testid="pileup-tooltip" style={{ maxWidth: 360 }}>
          {children}
        </div>
      </BaseTooltip>
      <div
        style={{
          position: 'absolute',
          left: offsetMouseCoord[0],
          top: 0,
          height,
          width: 1,
          background: 'rgba(0,0,0,0.45)',
          pointerEvents: 'none',
        }}
      />
    </>
  )
}

export function Swatch({ color }: { color: string }) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: 10,
        height: 10,
        marginRight: 4,
        verticalAlign: 'middle',
        background: color,
        border: '1px solid rgba(255,255,255,0.7)',
      }}
    />
  )
}
