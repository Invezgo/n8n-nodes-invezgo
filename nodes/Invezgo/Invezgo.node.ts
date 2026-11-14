import { NodeConnectionTypes, type INodeType, type INodeTypeDescription } from 'n8n-workflow';
import { properties } from './Invezgo.properties';

export class Invezgo implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Invezgo',
		name: 'invezgo',
		icon: { light: 'file:../../icons/invezgo.svg', dark: 'file:../../icons/invezgo.dark.svg' },
		group: ['input'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Get Indonesian stock market data (IDX) from the Invezgo API',
		defaults: {
			name: 'Invezgo',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'invezgoApi', required: true }],
		requestDefaults: {
			baseURL: 'https://api.invezgo.com',
			headers: {
				Accept: 'application/json',
				'Content-Type': 'application/json',
			},
		},
		properties,
	};
}
