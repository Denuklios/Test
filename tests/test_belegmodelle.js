// Belegerkennung: Wahl des Modells (automatisch / günstig / genau) mit nachgestelltem Erkennungsdienst
const path = require('path');
const dir = path.join(__dirname, '..', 'rechnung');
let sdkPath;
try { sdkPath = require.resolve('@anthropic-ai/sdk', { paths: [dir] }); } catch { console.log('übersprungen: rechnung/node_modules fehlt'); process.exit(0); }
let fails = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FEHL ') + m); if (!c) fails++; };
const calls = [];
let answer = {};
class APIError extends Error {}
class AuthenticationError extends APIError {}
class Fake {
  constructor() { this.beta = { messages: { create: async (req) => { calls.push(req); const a = answer[req.model]; if (a instanceof Error) throw a; return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(a) }] }; } } }; }
}
Object.assign(Fake, { APIError, AuthenticationError, RateLimitError: class extends APIError {}, BadRequestError: class extends APIError {} });
require.cache[sdkPath] = { id: sdkPath, filename: sdkPath, loaded: true, exports: { default: Fake } };
const R = require(path.join(dir, 'receipts.js'));
const img = { buffer: Buffer.alloc(200, 1), mime: 'image/jpeg', company: { name: 'X' }, apiKey: 'k' };
(async () => {
  answer = { 'claude-haiku-5-5': { total: '125.00', confident: true }, 'claude-opus-5-5': { total: '125.00', confident: true } };
  calls.length = 0; let r = await R.extract({ ...img, mode: 'auto' });
  ok(calls.length === 1 && r.model === 'claude-haiku-5-5', 'automatisch + sicher → nur günstiges Modell');
  ok(!('fallbacks' in calls[0]) && calls[0].output_config.effort === 'low', 'günstiges Modell ohne Ausweichlösung, wenig Aufwand');
  answer['claude-haiku-5-5'] = { total: '1?5', confident: false };
  calls.length = 0; r = await R.extract({ ...img, mode: 'auto' });
  ok(calls.length === 2 && r.model === 'claude-opus-5-5' && r.retried, 'automatisch + unsicher → genaues Modell liest nach');
  ok(calls[1].fallbacks === 'default', 'genaues Modell mit Ausweichlösung bei Ablehnung');
  calls.length = 0; r = await R.extract({ ...img, mode: 'cheap' });
  ok(calls.length === 1 && r.confident === false, 'günstig → bleibt beim günstigen Modell (Beleg kommt zur Prüfung)');
  calls.length = 0; r = await R.extract({ ...img, mode: 'precise' });
  ok(calls.length === 1 && calls[0].model === 'claude-opus-5-5', 'genau → nur großes Modell');
  answer['claude-haiku-5-5'] = new Error('überlastet');
  calls.length = 0; r = await R.extract({ ...img, mode: 'auto' });
  ok(r.model === 'claude-opus-5-5', 'günstiges Modell fällt aus → genaues springt ein');
  answer['claude-haiku-5-5'] = new AuthenticationError('x');
  try { await R.extract({ ...img, mode: 'auto' }); ok(false, 'falscher Schlüssel'); } catch (e) { ok(/Schlüssel/.test(e.message), 'falscher Schlüssel → klare Meldung, kein zweiter Versuch'); }
  console.log(fails ? `\n${fails} Fehler` : '\nAlle Tests bestanden');
  process.exit(fails ? 1 : 0);
})();
