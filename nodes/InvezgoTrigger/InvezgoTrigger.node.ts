import { createHmac, timingSafeEqual } from 'crypto';
import {
	NodeApiError,
	NodeConnectionTypes,
	type IDataObject,
	type IHookFunctions,
	type INodeType,
	type INodeTypeDescription,
	type IWebhookFunctions,
	type IWebhookResponseData,
	type JsonObject,
} from 'n8n-workflow';

const BASE_URL = 'https://api.invezgo.com';
const MAX_AGE_SECONDS = 300; // Invezgo docs: reject timestamps older than 5 minutes (replay protection)

// From https://docs.invezgo.com/api-usage/webhook (value = X-Invezgo-Event, "{domain}.{type}")
const EVENTS: Array<[string, string]> = [
	['alert.disabled', 'Alert Disabled (Auto-Disabled Live Alert)'],
	['alert.triggered', 'Alert Triggered (Stocks In/Out of Live Alert)'],
	['quota.exhausted', 'Quota Exhausted'],
	['quota.low', 'Quota Low (≥95% Used)'],
	['test.ping', 'Test Ping'],
	['update.calendar', 'Update: Corporate Action Calendar'],
	['update.classification', 'Update: Investor Classification'],
	['update.disclosure', 'Update: Disclosure'],
	['update.financial', 'Update: Financial Statement'],
	['update.five', 'Update: Shareholders Above 5%'],
	['update.hsc', 'Update: High Shareholding Concentration'],
	['update.insider', 'Update: Insider Transaction'],
	['update.ksei', 'Update: KSEI Investor Type'],
	['update.news', 'Update: News'],
	['update.notation', 'Update: Special Notation'],
	['update.one', 'Update: Shareholders Above 1%'],
	['update.shareholder', 'Update: Number of Shareholders'],
	['update.summary', 'Update: Broker Summary (EOD)'],
	['update.suspend', 'Update: Suspension'],
	['update.uma', 'Update: Unusual Market Activity (UMA)'],
];

/** Returns null when the request is authentic, otherwise the HTTP status to reject it with. */
export function verifySignature(
	secret: string,
	timestamp: string,
	signature: string,
	rawBody: Buffer,
	nowSeconds = Date.now() / 1000,
): 400 | 401 | null {
	if (!/^\d+$/.test(timestamp) || Math.abs(nowSeconds - Number(timestamp)) > MAX_AGE_SECONDS) return 400;
	const expected = Buffer.from(
		'sha256=' + createHmac('sha256', secret).update(`${timestamp}.`).update(rawBody).digest('hex'),
	);
	const actual = Buffer.from(signature);
	return expected.length === actual.length && timingSafeEqual(expected, actual) ? null : 401;
}


interface InvezgoWebhook {
	url: string;
	secret: string;
	is_active: boolean;
}

/** The account's webhook (Invezgo allows one per account), or undefined when none is set up. */
async function getWebhook(ctx: IHookFunctions): Promise<InvezgoWebhook | undefined> {
	const res = (await ctx.helpers.httpRequestWithAuthentication.call(ctx, 'invezgoApi', {
		method: 'GET',
		url: `${BASE_URL}/users/webhook`,
		json: true,
		returnFullResponse: true,
		ignoreHttpStatusErrors: true,
	})) as { statusCode: number; body: InvezgoWebhook };
	if (res.statusCode === 404) return undefined;
	if (res.statusCode >= 400) {
		throw new NodeApiError(ctx.getNode(), res.body as unknown as JsonObject, {
			httpCode: String(res.statusCode),
		});
	}
	return res.body;
}

async function sendWebhook(
	ctx: IHookFunctions,
	method: 'POST' | 'PUT' | 'PATCH',
	body: IDataObject,
): Promise<InvezgoWebhook> {
	return (await ctx.helpers.httpRequestWithAuthentication.call(ctx, 'invezgoApi', {
		method,
		url: `${BASE_URL}/users/webhook`,
		body,
		json: true,
	})) as InvezgoWebhook;
}

export class InvezgoTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Invezgo Trigger',
		name: 'invezgoTrigger',
		icon: { light: 'file:../../icons/invezgo.svg', dark: 'file:../../icons/invezgo.dark.svg' },
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["events"].length ? $parameter["events"].join(", ") : "All Events"}}',
		description: 'Starts the workflow when Invezgo sends a webhook event (data updates, Live Alerts, quota)',
		defaults: {
			name: 'Invezgo Trigger',
		},
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'invezgoApi', required: true }],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'webhook',
			},
		],
		properties: [
			{
				displayName:
					'Invezgo allows one webhook per account. Activating or testing this trigger points it at this workflow and generates a new secret, so any other endpoint using it stops receiving events. Requires an ADVANCE plan or higher and a public HTTPS n8n URL.',
				name: 'notice',
				type: 'notice',
				default: '',
			},
			{
				displayName: 'Events',
				name: 'events',
				type: 'multiOptions',
				options: EVENTS.map(([value, name]) => ({ name, value })),
				default: [],
				description: 'Events that start the workflow. Leave empty to accept every event, including new ones.',
			},
		],
	};

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const staticData = this.getWorkflowStaticData('node');
				const hook = await getWebhook(this);
				// The secret must be ours too: someone may have rotated it on the website since.
				return (
					!!hook &&
					hook.is_active &&
					hook.url === this.getNodeWebhookUrl('default') &&
					hook.secret === staticData.secret
				);
			},
			async create(this: IHookFunctions): Promise<boolean> {
				const url = this.getNodeWebhookUrl('default') as string;
				const existing = await getWebhook(this);
				let hook = existing
					? existing.url === url
						? existing
						: await sendWebhook(this, 'PUT', { url })
					: await sendWebhook(this, 'POST', { url });
				if (!hook.is_active) hook = await sendWebhook(this, 'PATCH', { is_active: true });
				this.getWorkflowStaticData('node').secret = hook.secret;
				return true;
			},
			async delete(this: IHookFunctions): Promise<boolean> {
				const staticData = this.getWorkflowStaticData('node');
				const hook = await getWebhook(this);
				// Leave the webhook alone if it was re-pointed elsewhere meanwhile.
				if (hook?.is_active && hook.url === this.getNodeWebhookUrl('default')) {
					await sendWebhook(this, 'PATCH', { is_active: false });
				}
				delete staticData.secret;
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const req = this.getRequestObject();
		const secret = this.getWorkflowStaticData('node').secret as string | undefined;
		if (!req.rawBody) await req.readRawBody();

		const status = secret
			? verifySignature(
					secret,
					String(req.headers['x-invezgo-timestamp'] ?? ''),
					String(req.headers['x-invezgo-signature'] ?? ''),
					req.rawBody,
				)
			: 401;
		if (status) {
			this.getResponseObject().status(status).end();
			return { noWebhookResponse: true };
		}

		const body = this.getBodyData();
		const event = `${String(body.domain)}.${String(body.type)}`;
		const events = this.getNodeParameter('events', []) as string[];
		// Unselected events are still acknowledged with 2xx so Invezgo does not retry them.
		if (events.length && !events.includes(event)) return {};

		return { workflowData: [this.helpers.returnJsonArray({ event, ...body } as IDataObject)] };
	}
}
