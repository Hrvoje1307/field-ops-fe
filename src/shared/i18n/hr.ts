export const hr = {
  common: {
    close: 'Zatvori',
    loading: 'Učitavanje…',
    appName: 'FieldOps',
    yes: 'Da',
    no: 'Ne',
    notSet: 'Nije upisano',
    relativeDay: {
      today: 'Danas',
      tomorrow: 'Sutra',
      yesterday: 'Jučer',
    },
    sensitive: {
      masked: 'Skrivena vrijednost',
      show: 'Prikaži',
      hide: 'Sakrij',
      showLabel: 'Prikaži: {{label}}',
      hideLabel: 'Sakrij: {{label}}',
    },
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
  /** Platform-wide job enums from the contract. */
  job: {
    status: {
      new: 'Novi',
      scheduled: 'Zakazan',
      confirmed: 'Potvrđen',
      en_route: 'Na putu',
      on_site: 'Na lokaciji',
      on_hold: 'Na čekanju',
      completed: 'Završen',
      invoiced: 'Fakturiran',
      cancelled: 'Otkazan',
    },
    priority: {
      low: 'Nizak prioritet',
      normal: 'Normalan prioritet',
      high: 'Visok prioritet',
      urgent: 'Hitno',
    },
  },
  technician: {
    lead: 'Voditelj',
  },
  location: {
    openInMaps: 'Otvori u kartama',
    directions: 'Navigacija',
    accessNotes: 'Napomene za pristup',
    accessCodes: 'Pristupne šifre',
    accessCodesHidden: 'Pristupne šifre su skrivene.',
  },
  asset: {
    serialNo: 'Ser. br. {{serialNo}}',
  },
  customField: {
    entity: {
      client: 'Klijent',
      location: 'Lokacija',
      asset: 'Oprema',
      job: 'Nalog',
    },
    choose: 'Odaberite…',
    noSelection: 'Bez odabira',
    required: 'obavezno',
    errors: {
      required: 'Obavezno polje.',
      number: 'Upišite broj.',
      date: 'Upišite ispravan datum.',
      option: 'Odaberite jednu od ponuđenih vrijednosti.',
      removedOption: 'Vrijednost „{{value}}” više nije ponuđena. Odaberite novu.',
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
