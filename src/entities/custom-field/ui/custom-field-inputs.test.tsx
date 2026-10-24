import { zodResolver } from '@hookform/resolvers/zod'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useMemo, useState } from 'react'
import { FormProvider, useForm } from 'react-hook-form'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { ApiError } from '@/shared/api/api-error'
import type { CustomFieldDefinition, CustomFieldValues } from '@/shared/api/generated/model'
import { applyFieldErrors } from '@/shared/lib/form-errors'

import { customFieldPaths } from '../lib/definitions'
import { ALL_TYPES, definition } from '../model/definitions.fixture'
import { customFieldFormValues } from '../model/form-values'
import { buildCustomFieldsSchema } from '../model/schema'
import { CustomFieldInputs } from './custom-field-inputs'

interface HarnessProps {
  definitions: CustomFieldDefinition[]
  values?: CustomFieldValues
  onValid?: (customFields: CustomFieldValues) => void
  /** Answer every valid submit with this error, as the API would. */
  serverError?: ApiError
  /** Where the fields sit in the request body. */
  nested?: boolean
}

/** A form like the real ones: the custom fields are one part of the body. */
function Harness({ definitions, values, onValid, serverError, nested = false }: HarnessProps) {
  const name = nested ? 'firstLocation.customFields' : 'customFields'
  const schema = useMemo(() => {
    const customFields = buildCustomFieldsSchema(definitions)
    return nested
      ? z.object({ firstLocation: z.object({ customFields }) })
      : z.object({ customFields })
  }, [definitions, nested])
  const initial = customFieldFormValues(definitions, values, { locale: 'hr-HR' })
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: nested
      ? { firstLocation: { customFields: initial } }
      : { customFields: initial },
  })
  const [unmatched, setUnmatched] = useState<string[]>([])

  const submit = form.handleSubmit((data) => {
    if (serverError) {
      setUnmatched(
        applyFieldErrors(
          form.setError,
          serverError.fieldErrors,
          customFieldPaths(definitions, name),
        ),
      )
      return
    }
    onValid?.('firstLocation' in data ? data.firstLocation.customFields : data.customFields)
  })

  return (
    <FormProvider {...form}>
      <form noValidate onSubmit={(event) => void submit(event)}>
        <CustomFieldInputs definitions={definitions} name={name} />
        <button type="submit">Spremi</button>
        {unmatched.map((message) => (
          <p key={message} data-testid="toast">
            {message}
          </p>
        ))}
      </form>
    </FormProvider>
  )
}

/** The message the input points at with aria-describedby. */
function describedText(element: HTMLElement): string | null {
  const id = element.getAttribute('aria-describedby')
  return id ? (document.getElementById(id)?.textContent ?? null) : null
}

describe('CustomFieldInputs', () => {
  it('renders an input for every type, labelled from the definition, in sortOrder', () => {
    render(<Harness definitions={[...ALL_TYPES].reverse()} />)

    expect(screen.getByLabelText(/^Napomena/)).toHaveAttribute('type', 'text')
    expect(screen.getByLabelText(/^Opis/).tagName).toBe('TEXTAREA')
    expect(screen.getByLabelText(/^Veličina/)).toHaveAttribute('inputmode', 'decimal')
    expect(screen.getByLabelText(/^Rok/)).toHaveAttribute('type', 'date')
    const select = screen.getByLabelText(/^Razina/)
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Odaberite…', 'Osnovna', 'Puna'])
    const tags = screen.getByRole('group', { name: 'Oznake' })
    expect(within(tags).getAllByRole('checkbox')).toHaveLength(3)
    expect(screen.getByRole('checkbox', { name: 'Potvrđeno' })).not.toBeChecked()
    expect(screen.getByLabelText(/^Tajni kod/)).toHaveValue('')

    // Required fields are marked
    expect(screen.getByLabelText(/^Veličina/)).toHaveAttribute('aria-required', 'true')
    expect(screen.getByLabelText(/^Napomena/)).not.toHaveAttribute('aria-required')

    // The visual required mark (*) is hidden from screen readers
    const order = screen
      .getAllByText(/^(Napomena|Opis|Veličina|Rok|Razina|Oznake|Potvrđeno|Tajni kod)\*?$/)
      .map((element) => element.textContent.replace('*', ''))
    expect(order).toEqual([
      'Napomena',
      'Opis',
      'Veličina',
      'Rok',
      'Razina',
      'Oznake',
      'Potvrđeno',
      'Tajni kod',
    ])
  })

  it('shows errors next to the fields they belong to', async () => {
    const user = userEvent.setup()
    const onValid = vi.fn()
    render(<Harness definitions={ALL_TYPES} onValid={onValid} />)

    await user.type(screen.getByLabelText(/^Rok/), '2026-02-30')
    await user.click(screen.getByRole('button', { name: 'Spremi' }))

    expect(onValid).not.toHaveBeenCalled()
    const size = screen.getByLabelText(/^Veličina/)
    expect(size).toHaveAttribute('aria-invalid', 'true')
    expect(describedText(size)).toBe('Obavezno polje.')
    expect(describedText(screen.getByLabelText(/^Razina/))).toBe('Obavezno polje.')
    expect(screen.getByLabelText(/^Napomena/)).not.toHaveAttribute('aria-invalid')

    await user.type(size, 'pet')
    expect(describedText(size)).toBe('Upišite broj.')
  })

  it('submits the values in API form', async () => {
    const user = userEvent.setup()
    const onValid = vi.fn()
    render(<Harness definitions={ALL_TYPES} onValid={onValid} />)

    await user.type(screen.getByLabelText(/^Napomena/), 'Ulaz iz dvorišta')
    await user.type(screen.getByLabelText(/^Opis/), 'Prvi red{Enter}Drugi red')
    await user.type(screen.getByLabelText(/^Veličina/), '6,1')
    await user.selectOptions(screen.getByLabelText(/^Razina/), 'Puna')
    const tags = screen.getByRole('group', { name: 'Oznake' })
    await user.click(within(tags).getByRole('checkbox', { name: 'Treća' }))
    await user.click(within(tags).getByRole('checkbox', { name: 'Prva' }))
    await user.click(screen.getByRole('checkbox', { name: 'Potvrđeno' }))
    await user.click(screen.getByRole('button', { name: 'Spremi' }))

    expect(onValid).toHaveBeenCalledWith({
      note: 'Ulaz iz dvorišta',
      details: 'Prvi red\nDrugi red',
      size: 6.1,
      level: 'full',
      tags: ['c', 'a'],
      confirmed: true,
    })
  })

  it('maps 400 errors from the API onto the right inputs; unknown paths go to a toast', async () => {
    const user = userEvent.setup()
    const serverError = new ApiError(400, {
      title: 'Validation failed',
      status: 400,
      errors: {
        'customFields.size': ['Najviše 64.'],
        'customFields.removed_field': ['Polje ne postoji.'],
      },
    })
    render(
      <Harness
        definitions={ALL_TYPES}
        values={{ size: 80, level: 'basic' }}
        serverError={serverError}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Spremi' }))

    const size = screen.getByLabelText(/^Veličina/)
    expect(describedText(size)).toBe('Najviše 64.')
    expect(size).toHaveFocus()
    expect(screen.getByTestId('toast')).toHaveTextContent('Polje ne postoji.')
  })

  it('maps 400 errors under a prefix (firstLocation.customFields.size)', async () => {
    const user = userEvent.setup()
    const serverError = new ApiError(400, {
      title: 'Validation failed',
      status: 400,
      errors: { 'firstLocation.customFields.size': ['Najviše 64.'] },
    })
    render(
      <Harness
        nested
        definitions={ALL_TYPES}
        values={{ size: 80, level: 'basic' }}
        serverError={serverError}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Spremi' }))
    expect(describedText(screen.getByLabelText(/^Veličina/))).toBe('Najviše 64.')
    expect(screen.queryByTestId('toast')).not.toBeInTheDocument()
  })
})

describe('CustomFieldInputs: sensitive fields', () => {
  const secret = definition({ key: 'secret', type: 'text', label: 'Tajni kod', isSensitive: true })

  it('a stored value stays masked, and out of the page, until revealed', async () => {
    const user = userEvent.setup()
    const { container } = render(<Harness definitions={[secret]} values={{ secret: '4471' }} />)

    expect(screen.queryByDisplayValue('4471')).not.toBeInTheDocument()
    expect(container).not.toHaveTextContent('4471')

    await user.click(screen.getByRole('button', { name: 'Prikaži: Tajni kod' }))
    const input = screen.getByLabelText('Tajni kod')
    expect(input).toHaveValue('4471')
    expect(input).toHaveFocus()
  })

  it('unrevealed → left out of the request', async () => {
    const user = userEvent.setup()
    const onValid = vi.fn()
    render(<Harness definitions={[secret]} values={{ secret: '4471' }} onValid={onValid} />)
    await user.click(screen.getByRole('button', { name: 'Spremi' }))
    expect(onValid).toHaveBeenCalledWith({})
  })

  it('revealed and unchanged → sent', async () => {
    const user = userEvent.setup()
    const onValid = vi.fn()
    render(<Harness definitions={[secret]} values={{ secret: '4471' }} onValid={onValid} />)
    await user.click(screen.getByRole('button', { name: 'Prikaži: Tajni kod' }))
    await user.click(screen.getByRole('button', { name: 'Spremi' }))
    expect(onValid).toHaveBeenCalledWith({ secret: '4471' })
  })

  it('revealed and cleared → null', async () => {
    const user = userEvent.setup()
    const onValid = vi.fn()
    render(<Harness definitions={[secret]} values={{ secret: '4471' }} onValid={onValid} />)
    await user.click(screen.getByRole('button', { name: 'Prikaži: Tajni kod' }))
    await user.clear(screen.getByLabelText('Tajni kod'))
    await user.click(screen.getByRole('button', { name: 'Spremi' }))
    expect(onValid).toHaveBeenCalledWith({ secret: null })
  })

  it('nothing stored: the input shows directly, and empty stays out of the request', async () => {
    const user = userEvent.setup()
    const onValid = vi.fn()
    render(<Harness definitions={[secret]} onValid={onValid} />)
    expect(screen.queryByRole('button', { name: /Prikaži/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Spremi' }))
    expect(onValid).toHaveBeenCalledWith({})
  })
})

describe('CustomFieldInputs: removed options', () => {
  const level = definition({
    key: 'level',
    type: 'select',
    label: 'Razina',
    options: [
      { value: 'basic', label: 'Osnovna' },
      { value: 'full', label: 'Puna' },
    ],
  })
  const tags = definition({
    key: 'tags',
    type: 'multiselect',
    label: 'Oznake',
    options: [
      { value: 'a', label: 'Prva' },
      { value: 'b', label: 'Druga' },
    ],
  })
  const warning = (value: string) => `Vrijednost „${value}” više nije ponuđena. Odaberite novu.`

  it('select: keeps the stored value with a warning and blocks saving until a current option is picked', async () => {
    const user = userEvent.setup()
    const onValid = vi.fn()
    render(<Harness definitions={[level]} values={{ level: 'premium' }} onValid={onValid} />)

    const select = screen.getByLabelText('Razina')
    expect(select).toHaveValue('premium')
    expect(describedText(select)).toBe(warning('premium'))

    await user.click(screen.getByRole('button', { name: 'Spremi' }))
    expect(onValid).not.toHaveBeenCalled()
    expect(describedText(select)).toBe(warning('premium'))
    expect(select).toHaveAttribute('aria-invalid', 'true')

    await user.selectOptions(select, 'Osnovna')
    expect(within(select).queryByRole('option', { name: 'premium' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Spremi' }))
    expect(onValid).toHaveBeenCalledWith({ level: 'basic' })
  })

  it('select: clearing the value also resolves it', async () => {
    const user = userEvent.setup()
    const onValid = vi.fn()
    render(<Harness definitions={[level]} values={{ level: 'premium' }} onValid={onValid} />)
    await user.selectOptions(screen.getByLabelText('Razina'), 'Bez odabira')
    await user.click(screen.getByRole('button', { name: 'Spremi' }))
    expect(onValid).toHaveBeenCalledWith({})
  })

  it('multiselect: the removed value stays ticked with a warning until unticked', async () => {
    const user = userEvent.setup()
    const onValid = vi.fn()
    render(<Harness definitions={[tags]} values={{ tags: ['a', 'gone'] }} onValid={onValid} />)

    const group = screen.getByRole('group', { name: 'Oznake' })
    const gone = within(group).getByRole('checkbox', { name: 'gone' })
    expect(gone).toBeChecked()
    expect(describedText(group)).toBe(warning('gone'))

    await user.click(screen.getByRole('button', { name: 'Spremi' }))
    expect(onValid).not.toHaveBeenCalled()
    expect(describedText(group)).toBe(warning('gone'))

    await user.click(gone)
    expect(within(group).queryByRole('checkbox', { name: 'gone' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Spremi' }))
    expect(onValid).toHaveBeenCalledWith({ tags: ['a'] })
  })
})
