import { readFile, writeFile, mkdir, rename, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { isPreference, message, MessageError, type LanguagePreference } from '../../src/i18n';
export class Preferences {
  private memory: LanguagePreference = 'auto';
  constructor(private file?: string) {}
  async read(): Promise<{ language: LanguagePreference }> {
    if (!this.file) return { language: this.memory };
    try {
      const value = JSON.parse(await readFile(this.file, 'utf8'));
      if (!value || !isPreference(value.language))
        throw new MessageError(message('invalidPreferences'));
      return { language: value.language };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { language: 'auto' };
      throw error;
    }
  }
  async save(value: unknown) {
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      Object.keys(value).length !== 1 ||
      !('language' in value) ||
      !isPreference(value.language)
    )
      throw new MessageError(message('invalidPreferences'));
    const result = { language: value.language };
    if (!this.file) {
      this.memory = result.language;
      return result;
    }
    await mkdir(dirname(this.file), { recursive: true });
    const temporary = `${this.file}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify(result) + '\n', { flag: 'wx', mode: 0o600 });
      await rename(temporary, this.file);
    } finally {
      await rm(temporary, { force: true });
    }
    return result;
  }
}
