const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });

export async function onRequestPatch({ params, env }) {
  const id = Number(params.id);
  if (!id) return json({ error: 'Invalid id' }, 400);
  try {
    const { meta } = await env.DB.prepare(
      "UPDATE pint_entries SET status = 'paid', date_paid = ? WHERE id = ?"
    )
      .bind(new Date().toISOString(), id)
      .run();
    if (meta.changes === 0) return json({ error: 'Not found' }, 404);
    return json({ success: true });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

export async function onRequestDelete({ params, env }) {
  const id = Number(params.id);
  if (!id) return json({ error: 'Invalid id' }, 400);
  try {
    const { meta } = await env.DB.prepare('DELETE FROM pint_entries WHERE id = ?')
      .bind(id)
      .run();
    if (meta.changes === 0) return json({ error: 'Not found' }, 404);
    return json({ success: true });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}
