import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent, screen, cleanup } from '@testing-library/react'
import { McpServerCard } from './McpServerCard'
import '../../i18n'

const stdioServer: McpServerConfig = { command: 'npx', args: ['-y', 'figma-mcp'] }
const httpServer: McpServerConfig = { type: 'http', url: 'https://mcp.example.com' }

describe('McpServerCard — transport badge', () => {
  it('renders stdio badge for command-based servers', () => {
    render(
      <McpServerCard
        name="figma"
        config={stdioServer}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
    expect(screen.getByText(/stdio/i)).toBeInTheDocument()
    cleanup()
  })

  it('renders HTTP badge for http servers', () => {
    render(
      <McpServerCard
        name="stripe"
        config={httpServer}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
    expect(screen.getByText(/http/i)).toBeInTheDocument()
    cleanup()
  })

  it('clicking edit/delete invokes the callbacks', () => {
    const onEdit = vi.fn()
    const onDelete = vi.fn()
    render(
      <McpServerCard
        name="figma"
        config={stdioServer}
        onEdit={onEdit}
        onDelete={onDelete}
      />,
    )
    fireEvent.click(screen.getByLabelText(/edit/i))
    fireEvent.click(screen.getByLabelText(/delete/i))
    expect(onEdit).toHaveBeenCalledOnce()
    expect(onDelete).toHaveBeenCalledOnce()
    cleanup()
  })
})
