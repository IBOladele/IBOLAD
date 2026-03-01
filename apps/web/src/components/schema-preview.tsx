import { createUserSchema } from '@repo/shared';

export function SchemaPreview() {
  const payload = {
    name: 'Grace Hopper',
    email: 'grace@example.com',
  };

  const parsed = createUserSchema.safeParse(payload);

  return (
    <section className="card">
      <h2>Shared schema status</h2>
      <p>{parsed.success ? 'Sample payload is valid.' : 'Sample payload is invalid.'}</p>
    </section>
  );
}
