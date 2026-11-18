import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class InvezgoApi implements ICredentialType {
	name = 'invezgoApi';

	displayName = 'Invezgo API';

	icon: Icon = { light: 'file:../icons/invezgo.svg', dark: 'file:../icons/invezgo.dark.svg' };

	documentationUrl = 'https://invezgo.com/id/setting/api';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			description: 'Generate your API key at https://invezgo.com/id/setting/api',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://api.invezgo.com',
			url: '/usage/api',
			method: 'GET',
		},
	};
}
