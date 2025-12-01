/**
 * Tag Helper Utilities
 *
 * Convert between tag IDs and full tag objects
 */

import { PROS_TAGS, CONS_TAGS, ADDITIONAL_TAGS, type ProsTag, type ConsTag } from '@/data/priorityTags';

/**
 * Get full tag objects from tag IDs
 */
export function getFullTagObjects(tagIds: string[]): Array<{
  id: string;
  text: string;
  mentionCount?: number;
  attributes: Record<string, number>;
}> {
  return tagIds
    .map(id => {
      // Try PROS_TAGS first
      const prosTag = PROS_TAGS.find(t => t.id === id);
      if (prosTag) {
        return {
          id: prosTag.id,
          text: prosTag.text,
          attributes: convertRelatedAttributesToRecord(prosTag.relatedAttributes),
        };
      }

      // Try CONS_TAGS
      const consTag = CONS_TAGS.find(t => t.id === id);
      if (consTag) {
        return {
          id: consTag.id,
          text: consTag.text,
          attributes: convertRelatedAttributesToRecord(consTag.relatedAttributes),
        };
      }

      // Try ADDITIONAL_TAGS
      const additionalTag = ADDITIONAL_TAGS.find(t => t.id === id);
      if (additionalTag) {
        return {
          id: additionalTag.id,
          text: additionalTag.text,
          attributes: convertRelatedAttributesToRecord(additionalTag.relatedAttributes),
        };
      }

      console.warn(`Tag ID not found: ${id}`);
      return null;
    })
    .filter(Boolean) as Array<{
    id: string;
    text: string;
    attributes: Record<string, number>;
  }>;
}

/**
 * Convert relatedAttributes array to Record<string, number>
 */
function convertRelatedAttributesToRecord(
  relatedAttributes: Array<{ attribute: string; weight: number }>
): Record<string, number> {
  const record: Record<string, number> = {};
  relatedAttributes.forEach(({ attribute, weight }) => {
    record[attribute] = weight;
  });
  return record;
}

/**
 * Get tag text by ID
 */
export function getTagText(tagId: string): string {
  const prosTag = PROS_TAGS.find(t => t.id === tagId);
  if (prosTag) return prosTag.text;

  const consTag = CONS_TAGS.find(t => t.id === tagId);
  if (consTag) return consTag.text;

  const additionalTag = ADDITIONAL_TAGS.find(t => t.id === tagId);
  if (additionalTag) return additionalTag.text;

  return tagId;
}

/**
 * Get tag type (pros/cons)
 */
export function getTagType(tagId: string): 'pros' | 'cons' | 'additional' | null {
  if (PROS_TAGS.find(t => t.id === tagId)) return 'pros';
  if (CONS_TAGS.find(t => t.id === tagId)) return 'cons';
  if (ADDITIONAL_TAGS.find(t => t.id === tagId)) return 'additional';
  return null;
}

/**
 * Validate tag IDs
 */
export function validateTagIds(tagIds: string[]): {
  valid: string[];
  invalid: string[];
} {
  const valid: string[] = [];
  const invalid: string[] = [];

  tagIds.forEach(id => {
    if (getTagType(id)) {
      valid.push(id);
    } else {
      invalid.push(id);
    }
  });

  return { valid, invalid };
}
