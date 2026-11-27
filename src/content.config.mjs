import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { sources } from './lib/site.mjs';

const sourceIds = Object.keys(sources());

// Every page in content/pages/<lang>/... must have this frontmatter.
// A wrong or missing field stops the build with a clear message.
const pages = defineCollection({
  loader: glob({
    pattern: '**/*.md',
    base: './content/pages',
    generateId: ({ entry }) => entry.replace(/\.md$/, ''),
  }),
  schema: z
    .object({
      title: z.string().min(1),
      summary: z.string().optional(),
      order: z.number().default(100),
      // English only: bump by 1 whenever the meaning changes.
      version: z.number().int().positive().optional(),
      clinical: z.boolean(),
      needs_clinical_review: z.boolean(),
      // Emergency and warning-sign pages: stale translations stop the build.
      safety_critical: z.boolean().default(false),
      last_reviewed_by: z.string().nullable().default(null),
      last_reviewed_on: z.coerce.date().nullable().default(null),
      sources: z.array(z.enum(sourceIds.length ? sourceIds : ['none'])).default([]),
      // Translations only:
      source_version: z.number().int().optional(),
      translated_by: z.string().optional(),
      translated_on: z.coerce.date().optional(),
      fallback_to_english: z.boolean().default(false),
    })
    .refine((d) => !d.clinical || d.needs_clinical_review || (d.last_reviewed_by && d.last_reviewed_on), {
      message: 'A clinical page with needs_clinical_review: false must have last_reviewed_by and last_reviewed_on.',
    }),
});

export const collections = { pages };
