import { createHmac, timingSafeEqual } from 'crypto';
import {
	NodeConnectionTypes,
	NodeOperationError,
	type IDataObject,
	type INodeType,
	type INodeTypeDescription,
	type IWebhookFunctions,
	type IWebhookResponseData,
} from 'n8n-workflow';

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

// Invezgo has no API to register webhooks (the URL is set by hand in the dashboard), so there is nothing for webhookMethods to call.
// eslint-disable-next-line @n8n/community-nodes/webhook-lifecycle-complete
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
					'Copy the Production URL above into the Webhook card on the Invezgo API settings page (Setting → API), then put the secret it shows in the credential\'s Webhook Secret field. Invezgo only accepts public HTTPS URLs.',
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

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const req = this.getRequestObject();
		const { webhookSecret } = await this.getCredentials<{ webhookSecret?: string }>('invezgoApi');
		if (!webhookSecret) {
			throw new NodeOperationError(this.getNode(), 'Set the Webhook Secret in the Invezgo API credential');
		}
		if (!req.rawBody) await req.readRawBody();

		const status = verifySignature(
			webhookSecret,
			String(req.headers['x-invezgo-timestamp'] ?? ''),
			String(req.headers['x-invezgo-signature'] ?? ''),
			req.rawBody,
		);
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
