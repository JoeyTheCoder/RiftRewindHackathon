const path = require('path');
const fs = require('fs').promises;

function createFsStorage(baseDir) {
  async function ensureDir(dir) {
    await fs.mkdir(dir, { recursive: true });
  }
  return {
    backend: 'fs',
    async writeJson(key, data) {
      const filePath = path.join(baseDir, key);
      await ensureDir(path.dirname(filePath));
      await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
    },
    async readJson(key) {
      const filePath = path.join(baseDir, key);
      const txt = await fs.readFile(filePath, 'utf8');
      return JSON.parse(txt);
    },
    async exists(key) {
      const filePath = path.join(baseDir, key);
      try {
        await fs.stat(filePath);
        return true;
      } catch (e) {
        if (e.code === 'ENOENT') return false;
        throw e;
      }
    },
    async listKeys(prefix) {
      const dir = path.join(baseDir, prefix);
      try {
        const entries = await fs.readdir(dir);
        return entries.map(e => path.posix.join(prefix.replace(/\\/g, '/'), e));
      } catch (e) {
        if (e.code === 'ENOENT') return [];
        throw e;
      }
    },
    async writeText(key, text) {
      const filePath = path.join(baseDir, key);
      await ensureDir(path.dirname(filePath));
      await fs.writeFile(filePath, text, 'utf8');
    },
    async readText(key) {
      const filePath = path.join(baseDir, key);
      return fs.readFile(filePath, 'utf8');
    },
    async deleteObject(key) {
      const filePath = path.join(baseDir, key);
      try { await fs.unlink(filePath); } catch (_) {}
    }
  };
}

module.exports = { createFsStorage };


