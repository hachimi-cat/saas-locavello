import type { ChatActionOut, ProductAgentProfile } from '@forjio/catentio-embed';

/**
 * What the Locavello ASSISTANT may plan against — the product half of
 * the @forjio/catentio-embed contract.
 *
 * Not to be confused with `lib/catentio.ts`, which dispatches the
 * `locavello-translator` agent as this product's machine-translation
 * PROVIDER. That is a always-on product feature; this is the embedded
 * chat assistant, a separate agent row behind a pilot flag. They share
 * the customer's CATENTIO_API_KEY because both belong to the same
 * catentio customer, and nothing else.
 *
 * Scope decision: the GLOSSARY — the term base a localisation team
 * curates by hand, and the one surface here with real bulk-entry pain
 * ("add these 40 brand names as do-not-translate").
 *
 * Translations, keys, releases and translation jobs are deliberately
 * out of scope and refused at the auth layer. Translation writes pass a
 * mechanical placeholder gate on the way in; routing a second, chattier
 * writer around the side of that gate is exactly the kind of shortcut
 * this layer must not take. The translator agent already owns that job.
 */

/** Per-product delegation token prefix — a leaked token names its
 *  origin. */
export const LOCAVELLO_DELEGATION_PREFIX = 'lvdt_';

export interface LocavelloLimits {
  plan: string;
}

export const LOCAVELLO_PROFILE: ProductAgentProfile<LocavelloLimits> = {
  productName: 'Locavello',
  resources: {
    glossary: {
      label: 'glossary term',
      createRequired: ['term'],
      fields: [
        { key: 'term', type: 'string', create: true, edit: true, description: 'the source term (≤200 chars)' },
        { key: 'projectId', type: 'string', create: true, edit: true, nullable: true, description: 'scope the term to one project by id, or null for account-wide' },
        { key: 'locale', type: 'string', create: true, edit: true, nullable: true, description: 'BCP-47 locale this rule applies to, or null' },
        { key: 'translation', type: 'string', create: true, edit: true, nullable: true, description: 'the forced translation (≤500 chars); null WITH a null locale means do-not-translate' },
        { key: 'note', type: 'string', create: true, edit: true, nullable: true, description: 'guidance for translators (≤1000 chars), or null' },
      ],
    },
  },
  scopeSummary: "the workspace's projects, keys, translations, glossary, or translation memory",
  multiStepExample: 'add these brand names as do-not-translate AND force one of them in French',
  writablesSummary: 'glossary terms',
  endpointsLine:
    '- Key endpoints: POST /api/v1/glossary (create; body fields below) · PATCH /api/v1/glossary/{id} · DELETE /api/v1/glossary/{id} · GET /api/v1/glossary.',
  extraNotes: [
    'A glossary entry with both `locale` and `translation` set forces that translation for that locale. An entry with both null is a DO-NOT-TRANSLATE rule — the term is left verbatim in every locale. Say which of the two you are proposing; they read almost identically and mean opposite things.',
    'A term with a null projectId applies account-wide, across every project. Prefer that for brand names, and scope to a project only when the user names one.',
    'You cannot write translations, keys, releases or translation jobs. Translation writes pass a mechanical placeholder-safety gate, and the locavello-translator agent already owns that job — if the user wants content translated, point them at the translate action in the project rather than proposing text yourself.',
  ],
  bulkExample: 'add these 40 brand names as do-not-translate',
  untrustedExamples: 'source strings and term text',
  gatherExamples: 'the existing glossary terms, the project you are scoping to',
  executeSummaryExamples: 'the new term, whether it forces a translation or blocks one, what actually changed',
  plan: {
    lookupSummary: 'glossary terms and projects',
  },
};

export type LocavelloChatAction = ChatActionOut;
