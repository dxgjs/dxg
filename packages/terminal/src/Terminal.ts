import { Component } from './components/Component';

export class Terminal {
  private width: number;
  private height: number;
  private buffer: string[][];
  private components: Component[];

  constructor(width: number = 80, height: number = 24) {
    this.width = width;
    this.height = height;
    this.buffer = this.createBuffer();
    this.components = [];
  }

  private createBuffer(): string[][] {
    return Array.from({ length: this.height }, () => Array(this.width).fill(' '));
  }

  public getWidth(): number {
    return this.width;
  }

  public getHeight(): number {
    return this.height;
  }

  public setSize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.buffer = this.createBuffer();
  }

  public clear(): void {
    this.buffer = this.createBuffer();
  }

  public addComponent(component: Component): void {
    this.components.push(component);
  }

  public removeComponent(component: Component): void {
    const index = this.components.indexOf(component);
    if (index > -1) {
      this.components.splice(index, 1);
    }
  }

  public render(): string[][] {
    this.clear();
    for (const component of this.components) {
      component.render(this.buffer);
    }
    return this.buffer;
  }

  public getBuffer(): string[][] {
    // Return a copy to avoid direct mutation
    return this.buffer.map(row => [...row]);
  }
}