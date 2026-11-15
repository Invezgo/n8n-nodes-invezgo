// Sanity check for the generated node: every path placeholder must point to a field shown for that operation,
// and a top-level field name must never be reused with a different type. Run after `npm run build`.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const { properties } = createRequire(import.meta.url)('../dist/nodes/Invezgo/Invezgo.properties.js');
const ops = properties.filter((p) => p.name === 'operation');
const fields = properties.filter((p) => !['resource', 'operation'].includes(p.name));
const types = {};
let count = 0;

for (const f of fields) {
	assert.ok(!types[f.name] || types[f.name] === f.type, `field "${f.name}" reused with another type`);
	types[f.name] = f.type;
}
for (const opProp of ops) {
	const resource = opProp.displayOptions.show.resource[0];
	for (const op of opProp.options) {
		count++;
		const shown = fields.filter(
			(f) => f.displayOptions.show.resource[0] === resource && f.displayOptions.show.operation[0] === op.value,
		);
		for (const [, name] of op.routing.request.url.matchAll(/\$parameter\["(\w+)"\]/g)) {
			assert.ok(shown.some((f) => f.name === name && f.required), `${resource}/${op.value}: missing path field ${name}`);
		}
	}
}
console.log(`OK: ${count} operations checked`);

// Webhook signature: HMAC-SHA256(secret, `${timestamp}.${rawBody}`), 5-minute window.
const { createHmac } = await import('node:crypto');
const { verifySignature } = createRequire(import.meta.url)('../dist/nodes/InvezgoTrigger/InvezgoTrigger.node.js');
const body = Buffer.from('{"id":"x","domain":"test","type":"ping","created_at":1,"data":{}}');
const ts = '1762425300';
const sig = 'sha256=' + createHmac('sha256', 's3cret').update(`${ts}.`).update(body).digest('hex');
assert.equal(verifySignature('s3cret', ts, sig, body, 1762425300), null);
assert.equal(verifySignature('wrong', ts, sig, body, 1762425300), 401);
assert.equal(verifySignature('s3cret', ts, sig, Buffer.from(body + ' '), 1762425300), 401);
assert.equal(verifySignature('s3cret', ts, sig, body, 1762425300 + 301), 400);
assert.equal(verifySignature('s3cret', 'abc', sig, body, 1762425300), 400);
console.log('OK: webhook signature checks');
