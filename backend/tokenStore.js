import fs from 'node:fs/promises';
import path from 'node:path';

export class TokenStore {
  constructor(filePath) {
    this.filePath = filePath;
  }

  async save(payload) {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(payload, null, 2), 'utf8');
  }

  async load() {
    const raw = await fs.readFile(this.filePath, 'utf8');
    return JSON.parse(raw);
  }

  async delete() {
    try {
      await fs.unlink(this.filePath);
    } catch (error) {
      if (error && error.code !== 'ENOENT') {
        throw error;
      }
    }
  }
}
