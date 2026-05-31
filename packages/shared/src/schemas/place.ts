import { z } from 'zod';

export const placeFiltersSchema = z.object({
  country: z.string().length(2).optional(),
  city: z.string().optional(),
  types: z.array(z.string()).optional(),
  businessStatus: z.string().optional(),
  search: z.string().optional(),
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
  near: z
    .object({
      lat: z.number(),
      lng: z.number(),
      radius: z.number().positive(),
    })
    .optional(),
  inAreaId: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(500).default(50),
  offset: z.number().int().min(0).default(0),
});
export type PlaceFilters = z.infer<typeof placeFiltersSchema>;
