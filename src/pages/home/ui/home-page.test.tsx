import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { hr } from '@/shared/i18n/hr'

import { HomePage } from './home-page'

describe('HomePage', () => {
  it('renders the Croatian heading', () => {
    render(<HomePage />)

    expect(screen.getByRole('heading', { level: 1, name: hr.home.title })).toBeInTheDocument()
  })

  it('shows the environment in the about dialog', async () => {
    const user = userEvent.setup()
    render(<HomePage />)

    await user.click(screen.getByRole('button', { name: hr.home.about.open }))

    const dialog = await screen.findByRole('dialog', { name: hr.home.about.title })
    expect(within(dialog).getByText('http://localhost/api/v1')).toBeInTheDocument()
    expect(within(dialog).getByText(hr.common.off)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: hr.common.close })).toBeInTheDocument()
  })
})
