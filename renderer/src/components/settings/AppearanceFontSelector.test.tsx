import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent, screen, cleanup } from '@testing-library/react'
import { AppearanceFontSelector, stackFor } from './AppearanceFontSelector'
import '../../i18n'

describe('AppearanceFontSelector', () => {
  it('renders the curated options for the given kind', () => {
    render(<AppearanceFontSelector kind="code" value="system" onChange={() => {}} />)
    expect(screen.getByRole('option', { name: /menlo/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /jetbrains mono/i })).toBeInTheDocument()
    cleanup()
  })

  it('calls onChange with the picked value', () => {
    const onChange = vi.fn()
    render(<AppearanceFontSelector kind="chat" value="system" onChange={onChange} />)
    const select = screen.getByRole('combobox') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'georgia' } })
    expect(onChange).toHaveBeenCalledWith('georgia')
    cleanup()
  })

  it('applies inline style for non-system values, none for system', () => {
    const { container, rerender } = render(
      <AppearanceFontSelector kind="ui" value="system" onChange={() => {}} />
    )
    const previewSystem = container.querySelector('.font-preview') as HTMLElement
    expect(previewSystem.style.fontFamily).toBe('')

    rerender(<AppearanceFontSelector kind="ui" value="georgia" onChange={() => {}} />)
    const previewGeorgia = container.querySelector('.font-preview') as HTMLElement
    expect(previewGeorgia.style.fontFamily).toContain('Georgia')
    cleanup()
  })

  it('stackFor returns empty string for system, full stack otherwise', () => {
    expect(stackFor('code', 'system')).toBe('')
    expect(stackFor('code', 'menlo')).toContain('Menlo')
    expect(stackFor('ui', 'unknown')).toBe('')
  })
})
