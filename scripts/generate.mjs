// Generates nodes/Invezgo/Invezgo.properties.ts from the Invezgo OpenAPI spec.
// Usage: node scripts/generate.mjs [path-or-url]   (default: https://api.invezgo.com/openapi.json)
import { readFileSync, writeFileSync } from 'node:fs';

const src = process.argv[2] || 'https://api.invezgo.com/openapi.json';
const spec = src.startsWith('http') ? await (await fetch(src)).json() : JSON.parse(readFileSync(src, 'utf8'));
const schemas = spec.components.schemas;

// Path prefix -> resource shown in the UI. First match wins; order matters.
const RESOURCES = [
	['market', 'Market', /^\/analysis\/(list|top|uma|suspend|notation|calendar|news|disclosure)\b/],
	['shareholder', 'Shareholder', /^\/analysis\/(shareholder|free-float|insider-chart)/],
	['brokerActivity', 'Broker Activity', /^\/analysis\/(summary|stalker\/(broker|list)|inventory-chart|intraday-inventory|sankey)/],
	['sector', 'Sector', /^\/analysis\/(stalker\/sector|sector)/],
	['financial', 'Financial', /^\/analysis\/(financial|keystat|flow-of-funds)/],
	['stock', 'Stock Price & Trade', /^\/analysis\//],
	['batch', 'Batch', /^\/batch\//],
	['search', 'Search', /^\/search/],
	['screener', 'Screener', /^\/screener/],
	['watchlist', 'Watchlist', /^\/watchlists/],
	['journal', 'Journal', /^\/journals/],
	['portfolio', 'Portfolio', /^\/portfolios/],
	['trade', 'Realized Trade', /^\/trades/],
	['alert', 'Alert', /^\/alerts/],
	['post', 'Post', /^\/posts/],
	['usage', 'Usage', /^\/usage/],
];

const LABELS = {
	code: 'Stock Code', stock: 'Stock Code', broker: 'Broker Code', from: 'Start Date', to: 'End Date',
	id: 'ID', query: 'Search Query', range: 'Range (Months)', max_nodes: 'Max Nodes', min_percentage: 'Min Percentage',
	pricefrom: 'Price From', priceto: 'Price To', timefrom: 'Time From (WIB)', timeto: 'Time To (WIB)', time: 'Time (WIB)',
	orderby: 'Order By',
};
const VALUE_LABELS = {
	RG: 'Regular Market (RG)', NG: 'Negotiated Market (NG)', TN: 'Cash Market (TN)', ALL: 'All', all: 'All',
	f: 'Foreign', d: 'Domestic', F: 'Foreign', D: 'Domestic', BS: 'Balance Sheet', IS: 'Income Statement', CF: 'Cash Flow',
	FY: 'Full Year', Q: 'All Quarters', BUY: 'Buy', SELL: 'Sell', ASC: 'Ascending', DESC: 'Descending',
};
const UPPERCASE = new Set(['code', 'stock', 'broker']);
// Friendlier names where the API summary just repeats the resource name.
const OP_NAMES = {
	'Create Alert': 'Create', 'Update Alert': 'Update', 'Delete Alert': 'Delete', Portfolio: 'Get Holdings',
	'Favorite Posts': 'Get Favorites', 'Liked Posts': 'Get Liked', 'Stock Posts': 'Get by Stock Code',
	Screener: 'Run Screen', 'API Usage': 'Get Quota', Watchlist: 'Get Items',
};

const title = (s) => s.replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\b\w/g, (c) => c.toUpperCase());
const camel = (s) => s.replace(/[^a-zA-Z0-9]+(.)?/g, (_, c) => (c ? c.toUpperCase() : '')).replace(/^./, (c) => c.toLowerCase());
const clean = (s = '') => s.replace(/`/g, '"').replace(/\s+/g, ' ').trim();
const english = (d = '') => {
	const en = d.split('[English]')[1] ?? d;
	return clean(en.trim().split(/\n\s*\n/)[0]);
};
const resolve = (s) => (s?.$ref ? schemas[s.$ref.split('/').pop()] : s) || {};

// Same top-level name must keep the same shape across operations, otherwise rename.
const signatures = {};
function uniqueName(name, sig) {
	const list = (signatures[name] ??= []);
	let i = list.indexOf(sig);
	if (i === -1) i = list.push(sig) - 1;
	return i === 0 ? name : `${name}${i + 1}`;
}

function field(name, schema, { required, description, example, isDate }) {
	schema = resolve(schema);
	const enumVals = schema.enum ?? schema.anyOf?.flatMap((a) => a.enum ?? []);
	const p = { displayName: LABELS[name] ?? title(name), name, required: required || undefined };
	if (schema.type === 'array') {
		const items = resolve(schema.items);
		if (items.enum) {
			p.type = 'multiOptions';
			p.options = items.enum.map((v) => ({ name: VALUE_LABELS[v] ?? v, value: v }));
			p.default = schema.default ?? [];
		} else {
			p.type = 'string';
			p.default = (schema.default ?? (name === 'scope' ? ['public'] : [])).join(',');
			p.hint = 'Comma-separated list';
			p.value = "={{ String($value).split(',').map(s => s.trim()).filter(s => s) }}";
		}
	} else if (enumVals?.length) {
		p.type = 'options';
		p.options = [...new Set(enumVals)].map((v) => ({ name: VALUE_LABELS[v] ?? String(v), value: v }));
		p.default = schema.default ?? enumVals[0];
	} else if (schema.type === 'integer' || schema.type === 'number') {
		p.type = 'number';
		p.default = schema.default ?? example ?? 0;
		if (schema.minimum !== undefined) p.typeOptions = { minValue: schema.minimum };
		if (schema.type === 'number') p.typeOptions = { ...p.typeOptions, numberPrecision: 2 };
	} else if (schema.type === 'boolean') {
		p.type = 'boolean';
		p.default = schema.default ?? false;
	} else if (isDate) {
		p.type = 'dateTime';
		p.default = '';
		p.value = '={{ String($value).slice(0, 10) }}'; // API wants YYYY-MM-DD (WIB)
	} else {
		p.type = 'string';
		p.default = schema.default ?? '';
		if (example !== undefined && example !== '') p.placeholder = `e.g. ${example}`;
		if (UPPERCASE.has(name)) p.value = '={{ String($value).trim().toUpperCase() }}';
		if (schema.nullable) p.value = "={{ $value === '' ? null : $value }}";
		if (name === 'formula' || name === 'description' || name === 'note') p.typeOptions = { rows: 2 };
	}
	if (description) p.description = description;
	return p;
}

function withRouting(p, sendType) {
	const value = p.value ?? '={{ $value }}';
	delete p.value;
	if (sendType === 'path') return p;
	p.routing = { send: { type: sendType, property: p.name, value } };
	return p;
}

const resources = Object.fromEntries(RESOURCES.map(([v, n]) => [v, { name: n, value: v, ops: [] }]));
const properties = [];

for (const [path, methods] of Object.entries(spec.paths)) {
	for (const [method, op] of Object.entries(methods)) {
		if (path === '/ws' || op.deprecated) continue; // WebSocket is not usable from a regular node
		const res = RESOURCES.find(([, , re]) => re.test(path))?.[0];
		if (!res) throw new Error(`No resource for ${path}`);
		const name = clean(op.summary.replace(/\[REALTIME\]\s*/, ''));
		const value = camel(name);
		const show = { resource: [res], operation: [value] };
		const top = [];
		const optional = [];
		const pathNames = {};

		for (const prm of op.parameters ?? []) {
			const isDate = /YYYY-MM-DD/.test(prm.description ?? '');
			const desc = clean(prm.description);
			const p = field(prm.name, prm.schema, { required: prm.required, description: desc, example: prm.example ?? prm.schema?.example, isDate });
			if (prm.in === 'path') {
				p.required = true;
				const valueExpr = p.value;
				p.name = uniqueName(prm.name, JSON.stringify([p.type, p.options]));
				pathNames[prm.name] = { name: p.name, upper: !!valueExpr };
				delete p.value;
				top.push(p);
			} else if (prm.required) {
				const n = prm.name;
				p.name = uniqueName(n, JSON.stringify([p.type, p.options]));
				const r = withRouting(p, 'query');
				r.routing.send.property = n;
				top.push(r);
			} else {
				delete p.required;
				optional.push(withRouting(p, 'query'));
			}
		}

		const body = resolve(op.requestBody?.content?.['application/json']?.schema);
		for (const [n, s] of Object.entries(body.properties ?? {})) {
			const req = body.required?.includes(n);
			const desc = clean(s.description);
			const p = field(n, s, { required: req, description: desc, isDate: n === 'date' });
			if (req) {
				p.name = uniqueName(n, JSON.stringify([p.type, p.options, 'body']));
				const r = withRouting(p, 'body');
				r.routing.send.property = n;
				top.push(r);
			} else {
				delete p.required;
				optional.push(withRouting(p, 'body'));
			}
		}

		const url = path.replace(/\{(\w+)\}/g, (_, n) => {
			const { name: pn, upper } = pathNames[n];
			const v = upper ? `String($parameter["${pn}"]).trim().toUpperCase()` : `String($parameter["${pn}"])`;
			return `{{ encodeURIComponent(${v}) }}`;
		});

		resources[res].ops.push({
			name: OP_NAMES[name] ?? name,
			value,
			action: name,
			description: english(op.description) || name,
			routing: { request: { method: method.toUpperCase(), url: url.includes('{{') ? `=${url}` : url } },
		});
		for (const p of top) properties.push({ ...p, displayOptions: { show } });
		if (optional.length) {
			const isBody = !!op.requestBody;
			properties.push({
				displayName: isBody ? 'Additional Fields' : 'Options',
				name: isBody ? 'additionalFields' : 'options',
				type: 'collection',
				placeholder: isBody ? 'Add Field' : 'Add Option',
				default: {},
				displayOptions: { show },
				options: optional.sort((a, b) => a.displayName.localeCompare(b.displayName)),
			});
		}
	}
}

const byName = (a, b) => a.name.localeCompare(b.name);
const used = Object.values(resources).filter((r) => r.ops.length).sort(byName);
const resourceProp = {
	displayName: 'Resource',
	name: 'resource',
	type: 'options',
	noDataExpression: true,
	options: used.map(({ name, value }) => ({ name, value })),
	default: used[0].value,
};
const operationProps = used.map((r) => {
	r.ops.sort(byName);
	return {
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: [r.value] } },
		options: r.ops,
		default: r.ops[0].value,
	};
});

const all = [resourceProp, ...operationProps, ...properties];
const out = `// AUTO-GENERATED by scripts/generate.mjs from the Invezgo OpenAPI spec (v${spec.info.version}). Do not edit by hand.
import type { INodeProperties } from 'n8n-workflow';

export const properties: INodeProperties[] = ${JSON.stringify(all, null, '\t')};
`;
writeFileSync(new URL('../nodes/Invezgo/Invezgo.properties.ts', import.meta.url), out);
console.log(`Generated ${used.length} resources, ${used.reduce((n, r) => n + r.ops.length, 0)} operations.`);
