import { describe, test, expect, vi, beforeEach, beforeAll } from 'vitest';

// Mock implementations - declared at top level so they're accessible when vi.mock is hoisted
const mockText = vi.fn();
const mockSelect = vi.fn();
const mockConfirm = vi.fn();
const mockIntro = vi.fn();
const mockOutro = vi.fn();
const mockNote = vi.fn();
const mockIsCancel = vi.fn(() => false);
const mockCancel = {};

// Mock @clack/prompts before importing our module
vi.mock('@clack/prompts', () => ({
  text: mockText,
  select: mockSelect,
  confirm: mockConfirm,
  intro: mockIntro,
  outro: mockOutro,
  note: mockNote,
  isCancel: mockIsCancel,
  cancel: mockCancel
}));

describe('Prompts Package', () => {
  test('should exist', () => {
    // This is a placeholder test - the prompts package is currently empty
    expect(true).toBe(true);
  });
});

describe('Prompts Package - DXG Enhancements', () => {
  let prompts: any;

  // Import the module after mocking
  beforeAll(async () => {
    prompts = await import('./src/index');
  });

  beforeEach(() => {
    vi.resetAllMocks();
    // Reset mock implementations
    mockText.mockReset();
    mockSelect.mockReset();
    mockConfirm.mockReset();
    mockIntro.mockReset();
    mockOutro.mockReset();
    mockNote.mockReset();
    mockIsCancel.mockReturnValue(false);
  });

  describe('dxgIntro', () => {
    test('should call intro with formatted message', () => {
      prompts.dxgIntro('test message');
      expect(mockIntro).toHaveBeenCalledWith(
        expect.stringContaining('DXG')
      );
    });
  });

  describe('dxgOutro', () => {
    test('should call outro with formatted message', () => {
      prompts.dxgOutro('test message');
      expect(mockOutro).toHaveBeenCalledWith(
        expect.stringContaining('DXG')
      );
    });
  });

  describe('dxgNote', () => {
    test('should call note with info formatted message', () => {
      prompts.dxgNote('test message');
      expect(mockNote).toHaveBeenCalledWith(
        expect.stringContaining('•')
      );
    });
  });

  describe('dxgSelect', () => {
    test('should return value when not cancelled', async () => {
      mockSelect.mockResolvedValue('option1');
      mockIsCancel.mockReturnValue(false);

      const result = await prompts.dxgSelect({
        message: 'Choose an option',
        options: [
          { label: 'Option 1', value: 'option1' },
          { label: 'Option 2', value: 'option2' }
        ]
      });

      expect(result).toBe('option1');
    });

    test('should return undefined when cancelled', async () => {
      mockSelect.mockResolvedValue(mockCancel);
      mockIsCancel.mockReturnValue(true);

      const result = await prompts.dxgSelect({
        message: 'Choose an option',
        options: [
          { label: 'Option 1', value: 'option1' },
          { label: 'Option 2', value: 'option2' }
        ]
      });

      expect(result).toBeUndefined();
    });
  });

  describe('dxgConfirm', () => {
    test('should return boolean when not cancelled', async () => {
      mockConfirm.mockResolvedValue(true);
      mockIsCancel.mockReturnValue(false);

      const result = await prompts.dxgConfirm({
        message: 'Are you sure?'
      });

      expect(result).toBe(true);
    });

    test('should return undefined when cancelled', async () => {
      mockConfirm.mockResolvedValue(mockCancel);
      mockIsCancel.mockReturnValue(true);

      const result = await prompts.dxgConfirm({
        message: 'Are you sure?'
      });

      expect(result).toBeUndefined();
    });
  });

  describe('dxgText', () => {
    test('should return string when not cancelled', async () => {
      mockText.mockResolvedValue('test input');
      mockIsCancel.mockReturnValue(false);

      const result = await prompts.dxgText({
        message: 'Enter something'
      });

      expect(result).toBe('test input');
    });

    test('should return undefined when cancelled', async () => {
      mockText.mockResolvedValue(mockCancel);
      mockIsCancel.mockReturnValue(true);

      const result = await prompts.dxgText({
        message: 'Enter something'
      });

      expect(result).toBeUndefined();
    });
  });
});