import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import {
  readFile,
  writeFile,
  stat,
  readdir,
  readFileSync,
  writeFileSync,
  statSync,
  readdirSync,
  pathExists,
  pathExistsSync,
  mkdir,
  mkdirSync,
  rm,
  rmSync,
  copyFile,
  copyFileSync,
  appendFile,
  appendFileSync
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

  test('should create directory async', async () => {
    const dirPath = join(TEST_DIR, 'new-dir');
    await mkdir(dirPath, { recursive: true });
    const exists = await pathExists(dirPath);
    expect(exists).toBe(true);

    // Verify it's a directory
    const stats = await stat(dirPath);
    expect(stats.isDirectory()).toBe(true);
  });

  test('should create directory sync', () => {
    const dirPath = join(TEST_DIR, 'new-dir-sync');
    mkdirSync(dirPath, { recursive: true });
    const exists = pathExistsSync(dirPath);
    expect(exists).toBe(true);

    // Verify it's a directory
    const stats = statSync(dirPath);
    expect(stats.isDirectory()).toBe(true);
  });

  test('should remove file async', async () => {
    const filePath = join(TEST_DIR, 'to-remove.txt');
    await writeFile(filePath, 'content', { encoding: 'utf8' });
    let exists = await pathExists(filePath);
    expect(exists).toBe(true);

    await rm(filePath);
    exists = await pathExists(filePath);
    expect(exists).toBe(false);
  });

  test('should remove file sync', () => {
    const filePath = join(TEST_DIR, 'to-remove-sync.txt');
    writeFileSync(filePath, 'content', { encoding: 'utf8' });
    let exists = pathExistsSync(filePath);
    expect(exists).toBe(true);

    rmSync(filePath);
    exists = pathExistsSync(filePath);
    expect(exists).toBe(false);
  });

  test('should copy file async', async () => {
    const srcPath = join(TEST_DIR, 'source.txt');
    const destPath = join(TEST_DIR, 'destination.txt');
    const content = 'Hello, copy!';

    await writeFile(srcPath, content, { encoding: 'utf8' });
    await copyFile(srcPath, destPath);

    const srcContent = await readFile(srcPath, { encoding: 'utf8' });
    const destContent = await readFile(destPath, { encoding: 'utf8' });
    expect(srcContent).toBe(content);
    expect(destContent).toBe(content);
  });

  test('should copy file sync', () => {
    const srcPath = join(TEST_DIR, 'source-sync.txt');
    const destPath = join(TEST_DIR, 'destination-sync.txt');
    const content = 'Hello, copy sync!';

    writeFileSync(srcPath, content, { encoding: 'utf8' });
    copyFileSync(srcPath, destPath);

    const srcContent = readFileSync(srcPath, { encoding: 'utf8' });
    const destContent = readFileSync(destPath, { encoding: 'utf8' });
    expect(srcContent).toBe(content);
    expect(destContent).toBe(content);
  });

  test('should append to file async', async () => {
    const filePath = join(TEST_DIR, 'append-test.txt');
    const initialContent = 'Initial content\n';
    const appendedContent = 'Appended content';
    const expectedContent = initialContent + appendedContent;

    await writeFile(filePath, initialContent, { encoding: 'utf8' });
    await appendFile(filePath, appendedContent, { encoding: 'utf8' });

    const result = await readFile(filePath, { encoding: 'utf8' });
    expect(result).toBe(expectedContent);
  });

  test('should append to file sync', () => {
    const filePath = join(TEST_DIR, 'append-test-sync.txt');
    const initialContent = 'Initial content\n';
    const appendedContent = 'Appended content sync';
    const expectedContent = initialContent + appendedContent;

    writeFileSync(filePath, initialContent, { encoding: 'utf8' });
    appendFileSync(filePath, appendedContent, { encoding: 'utf8' });

    const result = readFileSync(filePath, { encoding: 'utf8' });
    expect(result).toBe(expectedContent);
  });

  test('should create nested directories async', async () => {
    const dirPath = join(TEST_DIR, 'nested', 'deep', 'directory');
    await mkdir(dirPath, { recursive: true });
    const exists = await pathExists(dirPath);
    expect(exists).toBe(true);
  });

  test('should create nested directories sync', () => {
    const dirPath = join(TEST_DIR, 'nested-sync', 'deep-sync', 'directory-sync');
    mkdirSync(dirPath, { recursive: true });
    const exists = pathExistsSync(dirPath);
    expect(exists).toBe(true);
  });
});