import { Component } from './Component';

export class Text extends Component {
  private content: string;

  constructor(content: string, x: number = 0, y: number = 0) {
    super(x, y);
    this.content = content;
  }

  public setContent(content: string): void {
    this.content = content;
  }

  public getContent(): string {
    return this.content;
  }

  public render(buffer: string[][]): void {
    // We assume the buffer is a 2D array of strings, initially filled with empty strings or spaces.
    // For simplicity, we'll just put the text at the current position, one character per cell.
    // We don't handle wrapping or overflow for now.
    const lines = this.content.split('\n');
    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx];
      const yPos = this.y + lineIdx;
      if (yPos < 0 || yPos >= buffer.length) {
        continue;
      }
      for (let charIdx = 0; charIdx < line.length; charIdx++) {
        const xPos = this.x + charIdx;
        if (xPos < 0 || xPos >= buffer[yPos].length) {
          continue;
        }
        buffer[yPos][xPos] = line[charIdx];
      }
    }
  }
}