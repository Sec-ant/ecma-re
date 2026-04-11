export class EsreError extends Error {
  constructor(
    message: string,
    public position?: number,
  ) {
    super(
      position !== undefined ? `${message} at position ${position}` : message,
    );
    this.name = "EsreError";
  }
}
