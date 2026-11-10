/** Base class for expected, user-facing errors. `status` mirrors the HTTP status code. */
export class KitError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ForbiddenError extends KitError {
  constructor(message = "Forbidden") {
    super(message, 403, "forbidden");
  }
}

export class NotFoundError extends KitError {
  constructor(message = "Not found") {
    super(message, 404, "not_found");
  }
}

export class ConflictError extends KitError {
  constructor(message: string) {
    super(message, 409, "conflict");
  }
}

export class ValidationError extends KitError {
  constructor(message: string) {
    super(message, 400, "validation_error");
  }
}
