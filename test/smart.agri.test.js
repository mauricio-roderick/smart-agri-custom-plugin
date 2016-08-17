'use strict';

const DATASET_ID = '324c0b3e-daa1-428d-80d3-bf74b2b0eae5',
	  TABLE_NAME = 'waterLevel',
	  AUTHENTICATION_PARAMETERS = {
		  tenant: 'reekoh.com',
		  username: 'demo@reekoh.com',
		  password: 'Dunu6897',
		  clientId: 'a52311aa-21d0-4065-acca-beb9420e5640',
		  clientSecret: 'htThkxpBwMQgFDfUcqHFaXOunIaTSWM04a+s/LUF9qk='
	  };

var cp     = require('child_process'),
	should = require('should'),
	moment = require('moment-timezone'),
	service;

describe('Service', function () {
	this.slow(5000);

	after('terminate child process', function (done) {
		this.timeout(10000);

		setTimeout(function () {
			service.kill('SIGKILL');
			done();
		}, 8000);
	});

	describe('#spawn', function () {
		it('should spawn a child process', function () {
			should.ok(service = cp.fork(process.cwd()), 'Child process not spawned.');
		});
	});

	describe('#handShake', function () {
		it('should notify the parent process when ready within 5 seconds', function (done) {
			this.timeout(5000);

			service.on('message', function (message) {
				if (message.type === 'ready')
					done();
			});

			service.send({
				type: 'ready',
				data: {
					options: {
						'pbi-tenant': AUTHENTICATION_PARAMETERS.tenant,
						'pbi-username': AUTHENTICATION_PARAMETERS.username,
						'pbi-password': AUTHENTICATION_PARAMETERS.password,
						'pbi-client_id': AUTHENTICATION_PARAMETERS.clientId,
						'pbi-client_secret': AUTHENTICATION_PARAMETERS.clientSecret,
						'pbi-dataset': DATASET_ID,
						'pbi-table': TABLE_NAME,
						'aml-url': 'https://ussouthcentral.services.azureml.net/workspaces/20df39f0ebfb4777b26a06351cb5d2c3/services/dfcb2d34d71848138222cd6f3b2b6872/execute?api-version=2.0&details=true',
						'aml-api_key': 'PSTqmmsU0wATjmZheoDwvObunhqmTsJhM2O9h2NvOJzsaI2aSJvxUfCyGjr/YmPWLC7wclidyd1HOh+oA9Sjbg==',
						'fio-api_key': 'e05fd6b98abd2b6c95f749d76ed58e4b',
					}
				}
			}, function (error) {

				should.ifError(error);
			});
		});
	});

	describe('#data', function () {
		it('should process the data and send back a result', function (done) {
			this.timeout(8000);
			var requestId = (new Date()).getTime().toString();

			service.on('message', function (message) {
				if (message.type === 'result') {
					var data = JSON.parse(message.data);

					should.ok(data.azure_result, 'Invalid return data.');
					should.equal(message.requestId, requestId);
					done();
				}
			});

			service.send({
				type: 'data',
				requestId: requestId,
				data: {
					latitude: 14.556981,
					longitude: 121.034378,
					water_tank_condition: 1,
					time: moment().unix()
				}
			}, function (error) {
				should.ifError(error);
			});
		});
	});
});