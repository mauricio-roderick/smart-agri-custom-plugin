'use strict';

const DATASET_ID = '329cbe00-e81b-4858-85bb-5df91c27834b',
	  TABLE_NAME = 'AgriMetrics',
	  AML_URL = 'https://ussouthcentral.services.azureml.net/workspaces/20df39f0ebfb4777b26a06351cb5d2c3/services/358dc2e24f854c01b1fcb5a4bece863e/execute?api-version=2.0&details=true',
	  AML_API_KEY = 'ZSpCynDu29TcjyptyXpCYV1X5/FZgmJ4hWlbIvddZ2OfMO0N9m9Ef0A5Xwf3oqavfUqCmoI1/s6TB3xqZYtY2Q==',
	  FIO_API_KEY = 'e05fd6b98abd2b6c95f749d76ed58e4b',
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
	config = require('../config.json'),
	numDaysToPredict = config.days_to_predict.default,
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
						'aml-url': AML_URL,
						'aml-api_key': AML_API_KEY,
						'fio-api_key': FIO_API_KEY,
						'days_to_predict': numDaysToPredict,
					}
				}
			}, function (error) {

				should.ifError(error);
			});
		});
	});

	describe('#data', function () {
		it('should process the data and send back a result', function (done) {
			this.timeout(numDaysToPredict * 10000);

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