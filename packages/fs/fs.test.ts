import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import {
  readFile,
  writeFile,
  stat,
  readdir,
  readFileSync,
  writeFileSync,
  statSync,
  readdirSync
} from './src/index';
import {
  join,
  dirname,
  resolve
} from './src/path';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEST_DIR = path.join(__dirname, '__fs_test__');

describe('FS Abstraction Layer', () => {
  beforeEach(async () => {
    // Clean up and create test directory
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    // Clean up after tests
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  test('should write and read a file', async () => {
    const filePath = join(TEST_DIR, 'test.txt');
    const content = 'Hello, DXG FS!';

    await writeFile(filePath, content, { encoding: 'utf8' });
    const result = await readFile(filePath, { encoding: 'utf8' });

    expect(result).toBe(content);
  });

  test('should write and read a file synchronously', () => {
    const filePath = join(TEST_DIR, 'test-sync.txt');
    const content = 'Hello, DXG FS Sync!';

    writeFileSync(filePath, content, { encoding: 'utf8' });
    const result = readFileSync(filePath, { encoding: 'utf8' });

    expect(result).toBe(content);
  });

  test('should stat a file', async () => {
    const filePath = join(TEST_DIR, 'stat-test.txt');
    await writeFile(filePath, 'content', { encoding: 'utf8' });

    const stats = await stat(filePath);
    expect(stats.isFile()).toBe(true);
    expect(stats.size).toBeGreaterThan(0);
  });

  test('should stat a file synchronously', () => {
    const filePath = join(TEST_DIR, 'stat-test-sync.txt');
    writeFileSync(filePath, 'content', { encoding: 'utf8' });

    const stats = statSync(filePath);
    expect(stats.isFile()).toBe(true);
    expect(stats.size).toBeGreaterThan(0);
  });

  test('should readdir a directory', async () => {
    const dirPath = join(TEST_DIR, 'subdir');
    fs.mkdirSync(dirPath, { recursive: true });

    await writeFile(join(dirPath, 'file1.txt'), 'content1', { encoding: 'utf8' });
    await writeFile(join(dirPath, 'file2.txt'), 'content2', { encoding: 'utf8' });

    const files = await readdir(dirPath);
    expect(files).toContain('file1.txt');
    expect(files).toContain('file2.txt');
    expect(files.length).toBe(2);
  });

  test('should readdir a directory synchronously', () => {
    const dirPath = join(TEST_DIR, 'subdir-sync');
    fs.mkdirSync(dirPath, { recursive: true });

    writeFileSync(join(dirPath, 'file1.txt'), 'content1', { encoding: 'utf8' });
    writeFileSync(join(dirPath, 'file2.txt'), 'content2', { encoding: 'utf8' });

    const files = readdirSync(dirPath);
    expect(files).toContain('file1.txt');
    expect(files).toContain('file2.txt');
    expect(files.length).toBe(2);
  });

  test('should handle path utilities correctly', () => {
    // Use the FS package's path utilities (which are just re-exports of node:path)
    // and compare with Node.js path module's output for the same input.
    expect(join('/a/b', 'c')).toBe(path.join('/a/b', 'c'));
    expect(dirname('/a/b/c')).toBe(path.dirname('/a/b/c'));
    expect(resolve('/a/b', '../c')).toBe(path.resolve('/a/b', '../c'));
  });
});