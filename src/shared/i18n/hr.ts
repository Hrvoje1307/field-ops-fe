export const hr = {
  common: {
    close: 'Zatvori',
    loading: 'Učitavanje…',
    appName: 'FieldOps',
  },
  /** Platform-wide roles. The technician label should become a tenant setting (docs/backend-questions.md #17). */
  roles: {
    owner: 'Vlasnik',
    dispatcher: 'Dispečer',
    technician: 'Monter',
  },
  auth: {
    signIn: {
      title: 'Prijava',
      description: 'Prijavite se svojim emailom i lozinkom.',
      email: 'Email',
      password: 'Lozinka',
      submit: 'Prijavi se',
      submitting: 'Prijava…',
      forgotPassword: 'Zaboravili ste lozinku?',
      errors: {
        emailRequired: 'Upišite email.',
        emailInvalid: 'Upišite ispravan email.',
        passwordRequired: 'Upišite lozinku.',
        invalidCredentials: 'Pogrešan email ili lozinka.',
        tooManyAttempts: 'Previše neuspjelih pokušaja. Pokušajte ponovno za {{minutes}} min.',
        tooManyAttemptsGeneric: 'Previše pokušaja, pokušajte malo kasnije.',
        network: 'Poslužitelj nije dostupan. Provjerite vezu i pokušajte ponovno.',
        generic: 'Prijava nije uspjela. Pokušajte ponovno.',
      },
      reasons: {
        access_revoked: 'Vaš pristup je ukinut. Obratite se vlasniku tvrtke.',
        session_expired: 'Sesija je istekla. Prijavite se ponovno.',
        signed_out_elsewhere: 'Odjavljeni ste u drugom prozoru.',
      },
    },
    demo: {
      title: 'Demo prijava',
      description: 'Simulirani API: lozinka za sve račune je „demo”.',
      bothTenants: 'Obje tvrtke',
    },
    forgotPassword: {
      title: 'Nova lozinka',
      description:
        'Upišite email s kojim se prijavljujete. Poslat ćemo vam poveznicu za novu lozinku.',
      submit: 'Pošalji poveznicu',
      submitting: 'Slanje…',
      sent: 'Ako postoji račun s adresom {{email}}, poslali smo upute za novu lozinku.',
      backToSignIn: 'Natrag na prijavu',
      failed: 'Slanje nije uspjelo. Provjerite vezu i pokušajte ponovno.',
    },
    signOut: 'Odjavi se',
    switchTenant: {
      label: 'Tvrtka',
      failed: 'Promjena tvrtke nije uspjela. Pokušajte ponovno.',
    },
  },
  shell: {
    nav: {
      label: 'Glavna navigacija',
      today: 'Danas',
      jobs: 'Nalozi',
      clients: 'Klijenti',
    },
    openMenu: 'Otvori izbornik',
    userMenu: 'Korisnički izbornik',
  },
  pages: {
    placeholder: 'Ovaj ekran stiže u sljedećem koraku.',
    dayOverview: { title: 'Danas' },
    jobsList: { title: 'Nalozi' },
    clientsList: { title: 'Klijenti' },
    fieldDay: { title: 'Moj dan' },
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
