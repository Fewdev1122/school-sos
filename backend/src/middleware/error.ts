import { Context } from 'hono';
import { ZodError } from 'zod';

export function handleError(c: Context, error: unknown) {
  if (error instanceof ZodError) {
    return c.json(
      {
        success: false,
        error: 'Validation Error',
        message: error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
      },
      400
    );
  }

  console.error('Unhandled error:', error);
  return c.json(
    {
      success: false,
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'An unexpected error occurred',
    },
    500
  );
}
