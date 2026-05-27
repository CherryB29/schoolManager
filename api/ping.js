exports.handler = async function(event, context) {
  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true, now: new Date().toISOString(), query: event.queryStringParameters || {} })
  };
};