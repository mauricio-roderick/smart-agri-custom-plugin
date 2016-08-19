'use strict';

const AUTH_URL     = 'https://login.windows.net',
	  RESOURCE_URL = 'https://analysis.windows.net/powerbi/api';

var adal    = require('adal-node'),
	request = require('request');

function PowerBITask(authenticationParameters) {
	Object.assign(this, authenticationParameters);
}

PowerBITask.prototype = {
	init: function (callback) {
		let context = adal.createAuthenticationContext(`${AUTH_URL}/${this.tenant}`);

		context.acquireTokenWithUsernamePassword(RESOURCE_URL, this.username, this.password, this.client_id, this.client_secret, (error, response) => {
			if (error)
				callback(error);
			else {
				this.accessToken = response.accessToken;
				callback();
			}
		});
	},
	send: function (data, callback) {
		request.post({
			url: `https://api.powerbi.com/v1.0/myorg/datasets/${this.dataset}/tables/${this.table}/rows`,
			body: {
				rows: data
			},
			json: true,
			auth: {
				bearer: this.accessToken
			}
		}, function (error, response, body) {
			if (error)
				callback(error.message);
			else if (response.statusCode !== 200)
				callback(new Error(`HTTP ${response.statusCode} ${body.message}`));
			else
				callback();
		});
	},
	clear: function (callback) {
		
		request.delete({
			url: `https://api.powerbi.com/v1.0/myorg/datasets/${this.dataset}/tables/${this.table}/rows`,
			auth: {
				bearer: this.accessToken
			}
		}, function (error, response, body) {
			if (error)
				callback(error.message);
			else if (response.statusCode !== 200)
				callback(new Error(`HTTP ${response.statusCode} ${body.message}`));
			else
				callback();
		});
	}
};

module.exports = PowerBITask;