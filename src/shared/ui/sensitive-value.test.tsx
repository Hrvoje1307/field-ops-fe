import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { SensitiveValue } from './sensitive-value'

describe('SensitiveValue', () => {
  it('keeps the value out of the page until revealed, and hides it again', async () => {
    const user = userEvent.setup()
    const { container } = render(<SensitiveValue label="Šifra">4471</SensitiveValue>)

    expect(container).not.toHaveTextContent('4471')
    expect(screen.getByRole('img', { name: 'Skrivena vrijednost' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Prikaži: Šifra' }))
    expect(container).toHaveTextContent('4471')

    await user.click(screen.getByRole('button', { name: 'Sakrij: Šifra' }))
    expect(container).not.toHaveTextContent('4471')
  })

  it('reveals one way when not hideable and reports the reveal', async () => {
    const user = userEvent.setup()
    const onReveal = vi.fn()
    render(
      <SensitiveValue label="Šifra" hideable={false} onReveal={onReveal}>
        4471
      </SensitiveValue>,
    )
    await user.click(screen.getByRole('button', { name: 'Prikaži: Šifra' }))
    expect(onReveal).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: /Sakrij/ })).not.toBeInTheDocument()
  })
})
