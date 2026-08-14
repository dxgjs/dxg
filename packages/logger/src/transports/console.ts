import { Transport } from '../types';

export class ConsoleTransport implements Transport {
  write(message: string): void {
    // Using process.stdout.write to avoid adding extra newline if message already has one
    process.stdout.write(message + '\n');
  }
}

// Export a file transport for future use (optional)
export class FileTransport implements Transport {
  // This is a placeholder; in a real implementation, we would write to a file
  write(message: string): void {
    // For now, we just log to console as well, but we could implement file writing
    process.stdout.write(`[FILE] ${message}\n`);
  }
}