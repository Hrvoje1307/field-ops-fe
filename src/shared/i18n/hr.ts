export const hr = {
  common: {
    close: 'Zatvori',
    on: 'Uključen',
    off: 'Isključen',
  },
  home: {
    title: 'Dobro došli u FieldOps',
    subtitle: 'Radni nalozi, raspored tehničara i potpisani izvještaji na jednom mjestu.',
    status: 'Osnova aplikacije je postavljena. Ekrani stižu uskoro.',
    about: {
      open: 'O aplikaciji',
      title: 'O aplikaciji',
      description: 'Postavke okruženja za ovu verziju.',
      apiUrl: 'Adresa API-ja',
      mockApi: 'Simulirani API (MSW)',
    },
  },
  notFound: {
    title: 'Stranica nije pronađena',
    description: 'Adresa ne postoji ili je premještena.',
    backHome: 'Natrag na početnu',
  },
  error: {
    title: 'Nešto je pošlo po zlu',
    description: 'Stranicu nije moguće prikazati. Pokušajte ponovno.',
    retry: 'Pokušaj ponovno',
  },
} as const
