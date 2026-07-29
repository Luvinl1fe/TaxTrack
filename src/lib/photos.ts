/**
 * Receipt photo storage.
 *
 * ImagePicker hands back a URI in the app's *cache* directory. The OS is free
 * to purge that at any time, so a receipt whose `photo_uri` points there will
 * silently lose its image — usually weeks later, which is exactly when the user
 * needs it for a tax return. Every picked image is copied into the documents
 * directory before the URI is stored.
 *
 * Uses the SDK 54 `File` / `Directory` API from `expo-file-system`. The
 * `readAsStringAsync`-style functions moved to `expo-file-system/legacy` and
 * throw at runtime if called from the main export.
 */

import { Directory, File, Paths } from 'expo-file-system';

/** Subdirectory of the app's documents directory holding receipt images. */
const PHOTO_DIRECTORY = 'receipts';

function photoDirectory(): Directory {
  const directory = new Directory(Paths.document, PHOTO_DIRECTORY);
  // `idempotent` rather than checking `exists` first: the check-then-create
  // pair can lose a race, and "already there" is the expected case anyway.
  directory.create({ intermediates: true, idempotent: true });
  return directory;
}

/** The file extension of a URI, lowercased, defaulting to `jpg`. */
function extensionOf(uri: string): string {
  const match = /\.([a-zA-Z0-9]{1,5})(?:\?|#|$)/.exec(uri);
  return match ? match[1].toLowerCase() : 'jpg';
}

/**
 * Copy a picked image into permanent storage and return its stored URI.
 *
 * Named after the receipt id so the file is traceable back to its row, and so
 * re-picking for the same receipt overwrites rather than accumulating orphans.
 */
export function persistPhoto(sourceUri: string, receiptId: string): string {
  const source = new File(sourceUri);
  const destination = new File(photoDirectory(), `${receiptId}.${extensionOf(sourceUri)}`);

  if (destination.exists) {
    destination.delete();
  }

  source.copy(destination);
  return destination.uri;
}

/**
 * Delete a stored photo, ignoring a file that is already gone.
 *
 * Best-effort by design: a receipt should still save even if its image can't
 * be removed. The alternative — failing the save — loses the user's data to
 * protect a few kilobytes of disk.
 */
export function deletePhoto(photoUri: string | null): void {
  if (photoUri === null) return;

  try {
    const file = new File(photoUri);
    if (file.exists) {
      file.delete();
    }
  } catch {
    // Orphaned file at worst.
  }
}
