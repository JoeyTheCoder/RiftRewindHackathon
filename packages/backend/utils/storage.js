const path = require('path');
const fs = require('fs').promises;
const { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, DeleteObjectCommand } = require('@aws-sdk/client-s3');

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

function createS3Storage({ bucket, prefix = '' }) {
  const client = new S3Client({});
  const basePrefix = prefix ? prefix.replace(/\/*$/, '/') : '';
  const fullKey = (key) => `${basePrefix}${key}`;
  return {
    backend: 's3',
    async writeJson(key, data) {
      await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: fullKey(key),
        Body: Buffer.from(JSON.stringify(data, null, 2), 'utf8'),
        ContentType: 'application/json'
      }));
    },
    async readJson(key) {
      const out = await client.send(new GetObjectCommand({ Bucket: bucket, Key: fullKey(key) }));
      const txt = await out.Body.transformToString();
      return JSON.parse(txt);
    },
    async exists(key) {
      try {
        await client.send(new GetObjectCommand({ Bucket: bucket, Key: fullKey(key) }));
        return true;
      } catch (e) {
        if (e.name === 'NoSuchKey' || e.$metadata?.httpStatusCode === 404) return false;
        throw e;
      }
    },
    async listKeys(prefix) {
      const keys = [];
      let ContinuationToken;
      const Prefix = fullKey(prefix);
      do {
        const resp = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix, ContinuationToken }));
        for (const item of resp.Contents || []) {
          if (item.Key && item.Key.endsWith('/')) continue;
          const k = item.Key.startsWith(basePrefix) ? item.Key.substring(basePrefix.length) : item.Key;
          keys.push(k);
        }
        ContinuationToken = resp.IsTruncated ? resp.NextContinuationToken : undefined;
      } while (ContinuationToken);
      return keys;
    },
    async writeText(key, text) {
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: fullKey(key), Body: Buffer.from(text, 'utf8'), ContentType: 'text/plain' }));
    },
    async readText(key) {
      const out = await client.send(new GetObjectCommand({ Bucket: bucket, Key: fullKey(key) }));
      return out.Body.transformToString();
    },
    async deleteObject(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: fullKey(key) }));
    }
  };
}

module.exports = { createFsStorage, createS3Storage };


