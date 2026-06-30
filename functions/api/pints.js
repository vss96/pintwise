const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });

export async function onRequestGet({ request, env }) {
  const status = new URL(request.url).searchParams.get('status');
  try {
    const stmt = status
      ? env.DB.prepare(
          'SELECT * FROM pint_entries WHERE status = ? ORDER BY date_created DESC'
        ).bind(status)
      : env.DB.prepare('SELECT * FROM pint_entries ORDER BY date_created DESC');
    const { results } = await stmt.all();
    return json(results);
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }
  const debtor = (body.debtor || '').trim();
  const creditor = (body.creditor || '').trim();
  const description = (body.description || '').trim();
  const amount = Number(body.amount) || 1.0;
  if (!debtor || !creditor) {
    return json({ error: 'debtor and creditor are required' }, 400);
  }
  try {
    const { meta } = await env.DB.prepare(
      'INSERT INTO pint_entries (debtor, creditor, description, amount, date_created, status) VALUES (?, ?, ?, ?, ?, ?)'
    )
      .bind(debtor, creditor, description, amount, new Date().toISOString(), 'pending')
      .run();
    return json({ id: meta.last_row_id }, 201);
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}
