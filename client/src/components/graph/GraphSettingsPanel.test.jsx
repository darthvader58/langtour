import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import GraphSettingsPanel from './GraphSettingsPanel.jsx'

afterEach(() => {
  cleanup()
})

function renderPanel(props = {}) {
  return render(
    <GraphSettingsPanel
      display={{ nodeSize: 1, lineThickness: 1, nodeOpacity: 1, edgeOpacity: 1 }}
      onDisplayChange={vi.fn()}
      simCutoff={0.5}
      onSimCutoffChange={vi.fn()}
      simStats={{ min: 0, max: 1 }}
      linkCount={{ active: 10, total: 20 }}
      disabled={false}
      {...props}
    />
  )
}

describe('GraphSettingsPanel', () => {
  it('renders closed by default', () => {
    renderPanel()
    expect(screen.getByTestId('graph-settings-toggle')).toBeTruthy()
    expect(screen.queryByTestId('graph-settings-popover')).toBeNull()
  })

  it('opens the popover when the gear is clicked', () => {
    renderPanel()
    fireEvent.click(screen.getByTestId('graph-settings-toggle'))
    expect(screen.queryByTestId('graph-settings-popover')).toBeTruthy()
  })

  it('shows all five slider labels when open', () => {
    renderPanel()
    fireEvent.click(screen.getByTestId('graph-settings-toggle'))
    expect(screen.getByText('Link similarity')).toBeTruthy()
    expect(screen.getByText('Node size')).toBeTruthy()
    expect(screen.getByText('Line thickness')).toBeTruthy()
    expect(screen.getByText('Node opacity')).toBeTruthy()
    expect(screen.getByText('Edge opacity')).toBeTruthy()
  })

  it('calls onDisplayChange when a display slider moves', () => {
    const onDisplayChange = vi.fn()
    renderPanel({ onDisplayChange })
    fireEvent.click(screen.getByTestId('graph-settings-toggle'))
    const nodeSizeInput = screen.getByRole('slider', { name: /Node size/i })
    fireEvent.change(nodeSizeInput, { target: { value: '2' } })
    expect(onDisplayChange).toHaveBeenCalledWith({ nodeSize: 2 })
  })

  it('calls onSimCutoffChange when the link similarity slider moves', () => {
    const onSimCutoffChange = vi.fn()
    renderPanel({ onSimCutoffChange })
    fireEvent.click(screen.getByTestId('graph-settings-toggle'))
    const simInput = screen.getByRole('slider', { name: /Link similarity/i })
    fireEvent.change(simInput, { target: { value: '0.8' } })
    expect(onSimCutoffChange).toHaveBeenCalledWith(0.8)
  })

  it('closes when clicking outside the popover', () => {
    renderPanel()
    fireEvent.click(screen.getByTestId('graph-settings-toggle'))
    expect(screen.queryByTestId('graph-settings-popover')).toBeTruthy()
    fireEvent.mouseDown(document.body)
    expect(screen.queryByTestId('graph-settings-popover')).toBeNull()
  })
})
