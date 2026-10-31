import type { UserSeed } from './types'

/** Every seeded user signs in with this password. */
export const SEED_PASSWORD = 'demo'

export const SEED_USERS: UserSeed[] = [
  // Alarmko d.o.o. (Zagreb)
  {
    key: 'alarmko.owner',
    email: 'vlasnik@alarmko.test',
    fullName: 'Marko Kovač',
    phone: '+385913456789',
  },
  {
    key: 'alarmko.dispatcher',
    email: 'dispecer@alarmko.test',
    fullName: 'Ivana Babić',
    phone: '+385914567890',
  },
  {
    key: 'alarmko.ivan',
    email: 'ivan@alarmko.test',
    fullName: 'Ivan Horvat',
    phone: '+385915678901',
  },
  {
    key: 'alarmko.luka',
    email: 'luka@alarmko.test',
    fullName: 'Luka Novak',
    phone: '+385916789012',
  },
  {
    key: 'alarmko.petra',
    email: 'petra@alarmko.test',
    fullName: 'Petra Jurić',
    phone: '+385917890123',
  },
  // Bura klima d.o.o. (Split)
  {
    key: 'bura.owner',
    email: 'vlasnik@bura.test',
    fullName: 'Josip Marić',
    phone: '+385981234567',
  },
  {
    key: 'bura.dispatcher',
    email: 'dispecer@bura.test',
    fullName: 'Maja Radić',
    phone: '+385982345678',
  },
  { key: 'bura.ante', email: 'ante@bura.test', fullName: 'Ante Vuković', phone: '+385983456789' },
  { key: 'bura.mia', email: 'mia@bura.test', fullName: 'Mia Grgić', phone: '+385984567890' },
  // Čisto d.o.o. (Rijeka): a tenant without the Sales module
  {
    key: 'cisto.owner',
    email: 'vlasnik@cisto.test',
    fullName: 'Lana Bogdan',
    phone: '+385991234500',
  },
  // Dispatcher in all three tenants (exercises /auth/switch-tenant)
  {
    key: 'shared.dispatcher',
    email: 'ana@demo.test',
    fullName: 'Ana Perić',
    phone: '+385995678901',
  },
]
