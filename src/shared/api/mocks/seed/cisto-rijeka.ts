import type { TenantSeed } from './types'

/**
 * A small cleaning company in Rijeka whose plan has no Sales module: it exists to show
 * the app without Prodaja (hidden menu, 403 `sales.not_enabled`). Switch to it as the
 * shared dispatcher.
 */
export const cistoRijeka: TenantSeed = {
  name: 'Čisto d.o.o.',
  slug: 'cisto',
  oib: '29184736502',
  address: 'Korzo 12, 51000 Rijeka',
  phone: '+38551200300',
  email: 'info@cisto.test',
  iban: 'HR2123600001101234501',
  locale: 'hr-HR',
  timezone: 'Europe/Zagreb',
  currency: 'EUR',
  plan: 'basic',
  settings: {
    requireSignature: false,
    reminderSendTime: '18:00',
    smsSenderName: 'CISTO',
    onTheWaySmsEnabled: false,
    publicLinkValidityHours: 48,
    jobNumberPrefix: 'CI',
    pdfAccentColor: '#0f766e',
    pdfFooter: 'Čisto d.o.o. · Korzo 12, Rijeka',
  },
  members: [
    { user: 'cisto.owner', role: 'owner' },
    { user: 'shared.dispatcher', role: 'dispatcher' },
  ],
  depot: {
    name: 'Skladište Rijeka',
    address: 'Korzo 12, Rijeka',
    lat: 45.3271,
    lng: 14.4422,
    opensAt: '07:00',
    closesAt: '15:00',
  },
  skills: ['Čišćenje'],
  technicians: [],
  catalog: [],
  messageTemplates: [],
  checklists: [],
  jobTypes: [
    { name: 'Čišćenje ureda', color: '#0d9488', minutes: 120, people: 2 },
    { name: 'Generalno čišćenje', color: '#6366f1', minutes: 240, people: 3 },
  ],
  assetTypes: [],
  customFields: [],
  clients: [
    {
      key: 'ured-kvarner',
      type: 'company',
      name: 'Ured Kvarner d.o.o.',
      email: 'ured@kvarner.test',
      createdDaysAgo: 120,
      contacts: [{ name: 'Mirta Žic', phone: '+385991300001', email: 'ured@kvarner.test' }],
      locations: [
        {
          street: 'Riva 5',
          city: 'Rijeka',
          postalCode: '51000',
          lat: 45.3267,
          lng: 14.4425,
        },
      ],
    },
    {
      key: 'zgrada-trsat',
      type: 'company',
      name: 'Stambena zgrada Trsat 8',
      createdDaysAgo: 200,
      contacts: [{ name: 'Upravitelj zgrade', phone: '+385991300002' }],
      locations: [
        {
          street: 'Trsatska 8',
          city: 'Rijeka',
          postalCode: '51000',
          lat: 45.3374,
          lng: 14.4392,
        },
      ],
    },
  ],
  jobs: [
    {
      client: 'ured-kvarner',
      type: 'Čišćenje ureda',
      title: 'Tjedno čišćenje ureda',
      status: 'new',
      createdDaysAgo: 3,
    },
    {
      client: 'zgrada-trsat',
      type: 'Generalno čišćenje',
      title: 'Generalno čišćenje stubišta',
      status: 'new',
      createdDaysAgo: 5,
    },
  ],
  usage: { smsCount: 0, smsCost: '0.00', emailCount: 0, optimizationsCount: 0 },
}
