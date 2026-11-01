import { render, screen } from '@testing-library/react'
import { FormProvider, useForm } from 'react-hook-form'
import { describe, expect, it } from 'vitest'

import { SelectField } from './select-field'

function Harness({ required, value }: { required?: boolean; value: string }) {
  const form = useForm({ defaultValues: { kind: value } })
  return (
    <FormProvider {...form}>
      <SelectField
        name="kind"
        label="Vrsta"
        emptyLabel="Odaberi"
        required={required}
        options={[
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ]}
      />
    </FormProvider>
  )
}

const options = () => screen.getAllByRole('option').map((o) => o.textContent)

describe('SelectField', () => {
  it('an optional field always has the empty choice', () => {
    render(<Harness value="a" />)
    expect(options()).toEqual(['Odaberi', 'A', 'B'])
  })
  it('a required field without a value offers the empty choice', () => {
    render(<Harness required value="" />)
    expect(options()).toEqual(['Odaberi', 'A', 'B'])
  })
  it('a required field with a value has no empty choice to go back to', () => {
    render(<Harness required value="a" />)
    expect(options()).toEqual(['A', 'B'])
  })
})
