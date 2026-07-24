/**
 * Minimal context logger (replaces @nestjs/common Logger).
 *
 * Same call surface the services already use — `new Logger(Name)` then
 * `.log/.warn/.error/.debug` — so converting off Nest didn't touch every log
 * line. Writes structured-ish lines to stdout/stderr; swap for pino later
 * without changing call sites.
 */
export class Logger {
  constructor(private readonly context: string) {}

  private fmt(level: string, message: string): string {
    return `${new Date().toISOString()} ${level} [${this.context}] ${message}`;
  }

  log(message: string): void {
    // eslint-disable-next-line no-console
    console.log(this.fmt('LOG', message));
  }

  warn(message: string): void {
    // eslint-disable-next-line no-console
    console.warn(this.fmt('WARN', message));
  }

  error(message: string, trace?: string): void {
    // eslint-disable-next-line no-console
    console.error(this.fmt('ERROR', message));
    if (trace) console.error(trace);
  }

  debug(message: string): void {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.debug(this.fmt('DEBUG', message));
    }
  }
}
