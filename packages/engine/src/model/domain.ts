/**
 * Domains — Riftbound's six colours (134).
 *
 * A Domain matters in two places: a deck's Domain Identity, set by its Champion
 * Legend and restricting which cards may be included (103.1.b), and Power costs,
 * which are Domain-associated (163.2).
 */

/** The six Domains, in the rulebook's own order (134.2.a-f). */
export const DOMAINS = ['fury', 'calm', 'mind', 'body', 'chaos', 'order'] as const

export type Domain = (typeof DOMAINS)[number]

/**
 * Written shorthand for each Domain (134.2). Card text uses these bracketed
 * symbols, e.g. a cost of `[3][R]` is 3 Energy plus 1 Fury Power.
 */
export const DOMAIN_SHORTHAND = {
  fury: 'R',
  calm: 'G',
  mind: 'B',
  body: 'O',
  chaos: 'P',
  order: 'Y',
} as const satisfies Record<Domain, string>

/** Display colour of each Domain (134.2), for the client's card rendering. */
export const DOMAIN_COLOUR = {
  fury: 'red',
  calm: 'green',
  mind: 'blue',
  body: 'orange',
  chaos: 'purple',
  order: 'yellow',
} as const satisfies Record<Domain, string>

export function isDomain(value: unknown): value is Domain {
  return typeof value === 'string' && (DOMAINS as readonly string[]).includes(value)
}

/**
 * A deck's Domain Identity: the set of Domains on its Champion Legend (103.1.b.2).
 *
 * Universal Power can pay a cost of any Domain (163.2.b), so it is deliberately
 * not a Domain and never appears in an identity.
 */
export type DomainIdentity = ReadonlySet<Domain>

/**
 * Is a card legal in a deck with this Domain Identity? (103.1.b.3-4)
 *
 * A single-Domain card needs that Domain present. A multi-Domain card needs
 * *all* of its Domains present — not merely one of them, which is the easy
 * mistake. A card with no Domains (some Battlefields) is always legal.
 */
export function isWithinIdentity(
  cardDomains: readonly Domain[],
  identity: DomainIdentity,
): boolean {
  return cardDomains.every((domain) => identity.has(domain))
}
