export function sseHeaders(res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
}

export function sseEmit(res, event, data) {
  res.write(`event: ${event}\ndata: ${String(data).replace(/\n/g, '\\n')}\n\n`);
  if (res.flush) res.flush();
}
